import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
  type OnConnect,
  type Connection as FlowConnection,
  type ReactFlowInstance,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";

import client from "../api/client";
import type { CollectionWithMoves, Connection, Move } from "../types";
import MoveNode from "../components/graph/MoveNode";
import MoveDetailPanel from "../components/graph/MoveDetailPanel";
import AddConnectionPanel, { type ConnectionPreview } from "../components/graph/AddConnectionPanel";
import ConnectionEditPanel from "../components/graph/ConnectionEditPanel";
import EditMovePanel from "../components/graph/EditMovePanel";
import ConfirmModal from "../components/ConfirmModal";
import CurvedEdge from "../components/graph/CurvedEdge";
import AnimatedCurvedEdge from "../components/graph/AnimatedCurvedEdge";
import { analyzeGraph } from "../utils/graphAnalysis";
import { multiTermMatch, highlightTerms } from "../utils/search";
import { useDropdownKeyNav } from "../hooks/useDropdownKeyNav";
import { getD3ForceLayout, getELKLayout, type ELKAlgorithm } from "../utils/layouts";

const nodeTypes = { moveNode: MoveNode };
const edgeTypes = {
  curvedEdge: CurvedEdge,
  animatedCurvedEdge: AnimatedCurvedEdge,
};

// Focus mode sort options
const FOCUS_SORT_OPTIONS = [
  { value: "difficulty", label: "Difficulty" },
  { value: "familiarity", label: "Familiarity" },
  { value: "mental_availability", label: "Mental Availability" },
  { value: "beat_energy", label: "Beat Energy" },
  { value: "sensual_energy", label: "Sensual Energy" },
  { value: "created_at", label: "Date Added" },
  { value: "has_learning_notes", label: "Has Learning Notes" },
];

// Dagre layout configuration
const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;

// All available handles for spreading
// Smart handle selection based on relative node positions
function getSmartHandles(
  sourceNode: Node | undefined,
  targetNode: Node | undefined
): { sourceHandle: string; targetHandle: string } {
  // Default to right->left if nodes not found
  if (!sourceNode || !targetNode) {
    return { sourceHandle: "source-right", targetHandle: "target-left" };
  }

  const dx = targetNode.position.x - sourceNode.position.x;
  const dy = targetNode.position.y - sourceNode.position.y;

  // Determine primary direction based on which axis has greater distance
  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal dominant
    if (dx > 0) {
      // Target is to the right
      return { sourceHandle: "source-right", targetHandle: "target-left" };
    } else {
      // Target is to the left
      return { sourceHandle: "source-left", targetHandle: "target-right" };
    }
  } else {
    // Vertical dominant
    if (dy > 0) {
      // Target is below
      return { sourceHandle: "source-bottom", targetHandle: "target-top" };
    } else {
      // Target is above
      return { sourceHandle: "source-top", targetHandle: "target-bottom" };
    }
  }
}

// Focus layout: always use side handles (left/right only, never top/bottom)
function getFocusHandles(
  sourceNode: Node | undefined,
  targetNode: Node | undefined
): { sourceHandle: string; targetHandle: string } {
  if (!sourceNode || !targetNode) {
    return { sourceHandle: "source-right", targetHandle: "target-left" };
  }
  const dx = targetNode.position.x - sourceNode.position.x;
  if (dx >= 0) {
    return { sourceHandle: "source-right", targetHandle: "target-left" };
  } else {
    return { sourceHandle: "source-left", targetHandle: "target-right" };
  }
}

// Calculate curve factors for edges
// Per business rules, only one edge exists per source/target pair,
// so we use neutral curvature (0) for all edges - distance-based curvature handles visual appeal
function calculateCurveFactors(edges: Edge[]): Map<string, number> {
  const curveFactors = new Map<string, number>();
  edges.forEach((edge) => {
    curveFactors.set(edge.id, 0);
  });
  return curveFactors;
}

function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction = "LR"
): { nodes: Node[]; edges: Edge[] } {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

// Focus layout: center focused move with predecessors on left, successors on right
// Supports multiple levels: level 1 = direct connections, level 2 = connections of connections, etc.
// Key principle: Moves only connect to adjacent columns. A move can appear in multiple columns
// if needed (as duplicate nodes with virtual IDs).
function getFocusLayoutElements(
  nodes: Node[],
  edges: Edge[],
  connections: Connection[],
  moves: Move[],
  focusedMoveId: string,
  sortBy: string,
  sortAsc: boolean,
  maxLevel: number = 1
): {
  nodes: Node[];
  edges: Edge[];
  focusPositions: Map<string, "left" | "center" | "right">;
  virtualToRealId: Map<string, string>;
} {
  const COLUMN_GAP = 300;
  const ROW_GAP = 80;
  const CENTER_X = 400;
  const START_Y = 0;

  // Get move data for sorting
  const getMoveData = (id: string) => moves.find((m) => m.id === id);

  // Sort function for moves within a column
  const getSortValue = (moveId: string): number | string => {
    const move = getMoveData(moveId);
    if (!move) return 0;

    switch (sortBy) {
      case "difficulty":
        return move.difficulty ?? 0;
      case "familiarity":
        return move.familiarity ?? 0;
      case "mental_availability":
        return move.mental_availability ?? 0;
      case "beat_energy":
        return move.beat_energy ?? 0;
      case "sensual_energy":
        return move.sensual_energy ?? 0;
      case "created_at":
        return move.created_at ?? "";
      case "has_learning_notes":
        return move.learning_notes ? 1 : 0;
      default:
        return move.difficulty ?? 0;
    }
  };

  const compareMoves = (a: string, b: string): number => {
    const valA = getSortValue(a);
    const valB = getSortValue(b);
    if (valA < valB) return sortAsc ? -1 : 1;
    if (valA > valB) return sortAsc ? 1 : -1;
    return 0;
  };

  // Sort function that sorts by parent index first, then by UI criteria
  const sortMovesWithParentOrder = (
    ids: string[],
    parentOrderMap: Map<string, number>
  ): string[] => {
    return [...ids].sort((a, b) => {
      // Primary: sort by parent position (lower parent index = earlier)
      const parentA = parentOrderMap.get(a) ?? Infinity;
      const parentB = parentOrderMap.get(b) ?? Infinity;
      if (parentA !== parentB) return parentA - parentB;

      // Secondary: sort by UI criteria
      return compareMoves(a, b);
    });
  };

  // Simple sort by UI criteria only (for L1)
  const sortMoves = (ids: string[]): string[] => {
    return [...ids].sort(compareMoves);
  };

  // Track virtual node info
  // virtualId -> { realMoveId, level, side, parentVirtualId }
  interface VirtualNode {
    virtualId: string;
    realMoveId: string;
    level: number;
    side: "left" | "right" | "center";
    parentVirtualId: string | null; // The node in the adjacent column this connects to
  }

  const virtualNodes = new Map<string, VirtualNode>();
  const virtualToRealId = new Map<string, string>();

  // Track which moves are in each column (to allow same move in different columns)
  // columnMoves[level][side] = Set of realMoveIds in that column
  const columnMoves: Array<{ left: Set<string>; right: Set<string> }> = [];

  // Add the focused move at center
  virtualNodes.set(focusedMoveId, {
    virtualId: focusedMoveId,
    realMoveId: focusedMoveId,
    level: 0,
    side: "center",
    parentVirtualId: null,
  });
  virtualToRealId.set(focusedMoveId, focusedMoveId);

  // Build level data structures
  // levelColumns[level] = { left: [virtualIds], right: [virtualIds] }
  interface LevelColumn {
    left: string[]; // virtual IDs
    right: string[]; // virtual IDs
    leftParentOrder: Map<string, number>;
    rightParentOrder: Map<string, number>;
  }

  const levelColumns: LevelColumn[] = [];

  // Helper to create virtual ID for duplicate nodes
  const createVirtualId = (realMoveId: string, level: number, side: string): string => {
    return `${realMoveId}_L${level}_${side}`;
  };

  // Build L1: direct connections to focused move
  const l1PredecessorMoves = connections
    .filter((c) => c.target_move_id === focusedMoveId && c.source_move_id !== focusedMoveId)
    .map((c) => c.source_move_id);

  const l1SuccessorMoves = connections
    .filter((c) => c.source_move_id === focusedMoveId && c.target_move_id !== focusedMoveId)
    .map((c) => c.target_move_id);

  // L1 sorts by UI criteria only
  const sortedL1Left = sortMoves([...new Set(l1PredecessorMoves)]);
  const sortedL1Right = sortMoves([...new Set(l1SuccessorMoves)]);

  // Track L1 moves
  columnMoves.push({
    left: new Set(sortedL1Left),
    right: new Set(sortedL1Right),
  });

  // Create virtual nodes for L1
  const l1LeftVirtualIds: string[] = [];
  const l1RightVirtualIds: string[] = [];

  sortedL1Left.forEach((realMoveId) => {
    const virtualId = realMoveId; // First occurrence uses real ID
    virtualNodes.set(virtualId, {
      virtualId,
      realMoveId,
      level: 1,
      side: "left",
      parentVirtualId: focusedMoveId,
    });
    virtualToRealId.set(virtualId, realMoveId);
    l1LeftVirtualIds.push(virtualId);
  });

  sortedL1Right.forEach((realMoveId) => {
    // Check if this move is already on the left side at L1
    const existsOnLeft = columnMoves[0].left.has(realMoveId);
    const virtualId = existsOnLeft ? createVirtualId(realMoveId, 1, "right") : realMoveId;
    virtualNodes.set(virtualId, {
      virtualId,
      realMoveId,
      level: 1,
      side: "right",
      parentVirtualId: focusedMoveId,
    });
    virtualToRealId.set(virtualId, realMoveId);
    l1RightVirtualIds.push(virtualId);
  });

  levelColumns.push({
    left: l1LeftVirtualIds,
    right: l1RightVirtualIds,
    leftParentOrder: new Map(),
    rightParentOrder: new Map(),
  });

  // Build L2+ levels
  for (let level = 2; level <= maxLevel; level++) {
    const prevLevel = levelColumns[level - 2];
    const currentColumnMoves = { left: new Set<string>(), right: new Set<string>() };

    // Find predecessors of previous level's left column
    const newLeftVirtualIds: string[] = [];
    const leftParentOrder = new Map<string, number>();
    const leftParentMap = new Map<string, string>(); // realMoveId -> parentVirtualId

    prevLevel.left.forEach((parentVirtualId, parentIndex) => {
      const parentRealId = virtualToRealId.get(parentVirtualId)!;
      const predecessors = connections
        .filter((c) => c.target_move_id === parentRealId && c.source_move_id !== parentRealId)
        .map((c) => c.source_move_id);

      predecessors.forEach((realMoveId) => {
        // Skip if already in this column
        if (currentColumnMoves.left.has(realMoveId)) return;

        currentColumnMoves.left.add(realMoveId);
        if (!leftParentOrder.has(realMoveId)) {
          leftParentOrder.set(realMoveId, parentIndex);
          leftParentMap.set(realMoveId, parentVirtualId);
        }
      });
    });

    // Find successors of previous level's right column
    const newRightVirtualIds: string[] = [];
    const rightParentOrder = new Map<string, number>();
    const rightParentMap = new Map<string, string>(); // realMoveId -> parentVirtualId

    prevLevel.right.forEach((parentVirtualId, parentIndex) => {
      const parentRealId = virtualToRealId.get(parentVirtualId)!;
      const successors = connections
        .filter((c) => c.source_move_id === parentRealId && c.target_move_id !== parentRealId)
        .map((c) => c.target_move_id);

      successors.forEach((realMoveId) => {
        // Skip if already in this column
        if (currentColumnMoves.right.has(realMoveId)) return;

        currentColumnMoves.right.add(realMoveId);
        if (!rightParentOrder.has(realMoveId)) {
          rightParentOrder.set(realMoveId, parentIndex);
          rightParentMap.set(realMoveId, parentVirtualId);
        }
      });
    });

    columnMoves.push(currentColumnMoves);

    // Sort and create virtual nodes for this level
    const sortedNewLeftMoves = sortMovesWithParentOrder(
      [...currentColumnMoves.left],
      leftParentOrder
    );
    const sortedNewRightMoves = sortMovesWithParentOrder(
      [...currentColumnMoves.right],
      rightParentOrder
    );

    // Create virtual nodes for new left column
    sortedNewLeftMoves.forEach((realMoveId) => {
      // Always use virtual ID for L2+ to avoid conflicts
      const virtualId = createVirtualId(realMoveId, level, "left");
      virtualNodes.set(virtualId, {
        virtualId,
        realMoveId,
        level,
        side: "left",
        parentVirtualId: leftParentMap.get(realMoveId) || null,
      });
      virtualToRealId.set(virtualId, realMoveId);
      newLeftVirtualIds.push(virtualId);
    });

    // Create virtual nodes for new right column
    sortedNewRightMoves.forEach((realMoveId) => {
      const virtualId = createVirtualId(realMoveId, level, "right");
      virtualNodes.set(virtualId, {
        virtualId,
        realMoveId,
        level,
        side: "right",
        parentVirtualId: rightParentMap.get(realMoveId) || null,
      });
      virtualToRealId.set(virtualId, realMoveId);
      newRightVirtualIds.push(virtualId);
    });

    levelColumns.push({
      left: newLeftVirtualIds,
      right: newRightVirtualIds,
      leftParentOrder,
      rightParentOrder,
    });
  }

  // Track focus positions for each virtual node
  const focusPositions = new Map<string, "left" | "center" | "right">();

  // Calculate total height needed to vertically center everything
  let maxColumnHeight = 0;
  levelColumns.forEach((col) => {
    maxColumnHeight = Math.max(maxColumnHeight, col.left.length, col.right.length);
  });

  // Build positioned nodes - create node instances for each virtual node
  const positionedNodes: Node[] = [];

  // Add center node
  const centerNode = nodes.find((n) => n.id === focusedMoveId);
  if (centerNode) {
    const centerY = START_Y;
    positionedNodes.push({
      ...centerNode,
      position: { x: CENTER_X, y: centerY },
      data: {
        ...centerNode.data,
        focusPosition: "center",
      },
    });
    focusPositions.set(focusedMoveId, "center");
  }

  // Add nodes for each level column
  levelColumns.forEach((col, levelIndex) => {
    const level = levelIndex + 1;

    // Left column nodes
    col.left.forEach((virtualId, rowIndex) => {
      const vNode = virtualNodes.get(virtualId)!;
      const realNode = nodes.find((n) => n.id === vNode.realMoveId);
      if (realNode) {
        const x = CENTER_X - COLUMN_GAP * level;
        const y = START_Y + level * ROW_GAP + rowIndex * ROW_GAP;
        positionedNodes.push({
          ...realNode,
          id: virtualId, // Use virtual ID
          position: { x, y },
          data: {
            ...realNode.data,
            focusPosition: "left",
            realMoveId: vNode.realMoveId, // Store real ID for click handling
          },
        });
        focusPositions.set(virtualId, "left");
      }
    });

    // Right column nodes
    col.right.forEach((virtualId, rowIndex) => {
      const vNode = virtualNodes.get(virtualId)!;
      const realNode = nodes.find((n) => n.id === vNode.realMoveId);
      if (realNode) {
        const x = CENTER_X + COLUMN_GAP * level;
        const y = START_Y + level * ROW_GAP + rowIndex * ROW_GAP;
        positionedNodes.push({
          ...realNode,
          id: virtualId, // Use virtual ID
          position: { x, y },
          data: {
            ...realNode.data,
            focusPosition: "right",
            realMoveId: vNode.realMoveId, // Store real ID for click handling
          },
        });
        focusPositions.set(virtualId, "right");
      }
    });
  });

  // Build edges - only between adjacent columns
  const filteredEdges: Edge[] = [];
  const addedEdges = new Set<string>(); // Prevent duplicate edges

  // Edges from center to L1
  levelColumns[0]?.left.forEach((virtualId) => {
    const vNode = virtualNodes.get(virtualId)!;
    const edgeId = `edge_${vNode.realMoveId}_${focusedMoveId}`;
    if (!addedEdges.has(edgeId)) {
      // Find original edge
      const origEdge = edges.find(
        (e) => e.source === vNode.realMoveId && e.target === focusedMoveId
      );
      if (origEdge) {
        filteredEdges.push({
          ...origEdge,
          id: `${origEdge.id}_${virtualId}`,
          source: virtualId,
          target: focusedMoveId,
        });
        addedEdges.add(edgeId);
      }
    }
  });

  levelColumns[0]?.right.forEach((virtualId) => {
    const vNode = virtualNodes.get(virtualId)!;
    const edgeId = `edge_${focusedMoveId}_${vNode.realMoveId}`;
    if (!addedEdges.has(edgeId)) {
      const origEdge = edges.find(
        (e) => e.source === focusedMoveId && e.target === vNode.realMoveId
      );
      if (origEdge) {
        filteredEdges.push({
          ...origEdge,
          id: `${origEdge.id}_${virtualId}`,
          source: focusedMoveId,
          target: virtualId,
        });
        addedEdges.add(edgeId);
      }
    }
  });

  // Edges between adjacent levels (L1-L2, L2-L3, etc.)
  // Scan ALL connections between adjacent columns (not just stored primary parent)
  // to handle cases where multiple L1 nodes connect to the same L2 node
  for (let level = 2; level <= maxLevel; level++) {
    const currentCol = levelColumns[level - 1];
    const prevCol = levelColumns[level - 2];
    if (!currentCol || !prevCol) continue;

    // Left side: current level nodes connect TO previous level nodes
    currentCol.left.forEach((virtualId) => {
      const vNode = virtualNodes.get(virtualId)!;
      prevCol.left.forEach((parentVirtualId) => {
        const parentNode = virtualNodes.get(parentVirtualId)!;
        const origEdge = edges.find(
          (e) => e.source === vNode.realMoveId && e.target === parentNode.realMoveId
        );
        if (origEdge) {
          filteredEdges.push({
            ...origEdge,
            id: `${origEdge.id}_${virtualId}_${parentVirtualId}`,
            source: virtualId,
            target: parentVirtualId,
          });
        }
      });
    });

    // Right side: previous level nodes connect TO current level nodes
    currentCol.right.forEach((virtualId) => {
      const vNode = virtualNodes.get(virtualId)!;
      prevCol.right.forEach((parentVirtualId) => {
        const parentNode = virtualNodes.get(parentVirtualId)!;
        const origEdge = edges.find(
          (e) => e.source === parentNode.realMoveId && e.target === vNode.realMoveId
        );
        if (origEdge) {
          filteredEdges.push({
            ...origEdge,
            id: `${origEdge.id}_${parentVirtualId}_${virtualId}`,
            source: parentVirtualId,
            target: virtualId,
          });
        }
      });
    });
  }

  return { nodes: positionedNodes, edges: filteredEdges, focusPositions, virtualToRealId };
}

export default function CollectionGraphPage() {
  const { id } = useParams<{ id: string }>();
  const [collection, setCollection] = useState<CollectionWithMoves | null>(
    null
  );
  const [moves, setMoves] = useState<Move[]>([]);
  const [allDanceStyleMoves, setAllDanceStyleMoves] = useState<Move[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState<"dagre" | "custom" | "focus" | "force" | "elk">("focus");
  const [elkAlgorithm, setElkAlgorithm] = useState<ELKAlgorithm>("layered");

  // Focus mode state
  const [focusedMoveId, setFocusedMoveId] = useState<string | null>(null);
  const [focusSortBy, setFocusSortBy] = useState<string>("difficulty");
  const [focusSortAsc, setFocusSortAsc] = useState(true);

  // Auto-select a random node when focus layout opens with no focused node
  useEffect(() => {
    if (layout === "focus" && !focusedMoveId && moves.length > 0) {
      const randomIndex = Math.floor(Math.random() * moves.length);
      setFocusedMoveId(moves[randomIndex].id);
    }
  }, [layout, focusedMoveId, moves]);
  const [focusLevel, setFocusLevel] = useState(1);
  const [virtualToRealIdMap, setVirtualToRealIdMap] = useState<Map<string, string>>(new Map());

  // Panel state
  const [selectedMove, setSelectedMove] = useState<Move | null>(null);
  const [addConnectionMove, setAddConnectionMove] = useState<Move | null>(null);
  const [editingMove, setEditingMove] = useState<Move | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [panelClosing, setPanelClosing] = useState(false);
  const [deleteConfirmMove, setDeleteConfirmMove] = useState<Move | null>(null);
  const [connectionPreview, setConnectionPreview] = useState<ConnectionPreview | null>(null);

  // Graph analysis state - toggle for showing component colors
  const [showComponentColors, setShowComponentColors] = useState(false);

  // Graph search state
  const [graphSearch, setGraphSearch] = useState("");
  const [graphSearchOpen, setGraphSearchOpen] = useState(false);
  const [graphSearchLimit, setGraphSearchLimit] = useState(20);
  const graphSearchRef = useRef<HTMLDivElement>(null);

  // Handle panel close with animation
  const handlePanelClose = useCallback(() => {
    setPanelClosing(true);
    setTimeout(() => {
      setSelectedMove(null);
      setAddConnectionMove(null);
      setEditingMove(null);
      setPanelClosing(false);
    }, 200); // Match animation duration
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);

  // Graph search: filtered results
  const graphSearchResults = useMemo(() => {
    if (!graphSearch.trim()) return [];
    return moves.filter((m) => multiTermMatch(m.name, graphSearch));
  }, [moves, graphSearch]);

  // Graph search: select a move from results
  const handleGraphSearchSelect = useCallback(
    (move: Move) => {
      setGraphSearch("");
      setGraphSearchOpen(false);
      if (layout === "focus") {
        setFocusedMoveId(move.id);
      } else {
        setSelectedMove(move);
        setAddConnectionMove(null);
        setEditingMove(null);
        setSelectedEdgeId(null);
        // Update node selection and center the view
        setNodes((prev) =>
          prev.map((n) => ({ ...n, selected: n.id === move.id }))
        );
        requestAnimationFrame(() => {
          reactFlowInstance.current?.fitView({
            nodes: [{ id: move.id }],
            duration: 300,
            maxZoom: 1.2,
            padding: 0.5,
          });
        });
      }
    },
    [layout, setNodes]
  );

  // Graph search: keyboard navigation
  const visibleGraphResults = graphSearchResults.slice(0, graphSearchLimit);
  const { highlightedIndex: graphSearchIndex, handleKeyDown: handleGraphSearchKeyDown } =
    useDropdownKeyNav({
      itemCount: visibleGraphResults.length,
      onSelect: (i) => handleGraphSearchSelect(visibleGraphResults[i]),
      onEscape: () => setGraphSearchOpen(false),
      enabled: graphSearchOpen && graphSearch.trim().length > 0,
    });

  // Graph search: click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        graphSearchRef.current &&
        !graphSearchRef.current.contains(e.target as Node)
      ) {
        setGraphSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Load collection, moves, and connections in a single request
  const loadGraphData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await client.get(`/collections/${id}/graph-data`);
      const { collection: col, moves: graphMoves, connections: graphConnections } = res.data;
      setCollection(col);
      setMoves(graphMoves);
      setConnections(graphConnections);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadGraphData();
  }, [loadGraphData]);

  // Fetch ALL moves of this dance style (for Add Connection panel)
  useEffect(() => {
    if (!collection) return;
    client
      .get(`/moves?dance_style=${encodeURIComponent(collection.dance_style)}`)
      .then((res) => setAllDanceStyleMoves(res.data))
      .catch(console.error);
  }, [collection?.dance_style]);

  // Create set of move IDs in this collection
  const collectionMoveIds = useMemo(
    () => new Set(moves.map((m) => m.id)),
    [moves]
  );

  // Convert data to React Flow nodes and edges
  const { initialNodes, initialEdges } = useMemo(() => {
    if (!collection) return { initialNodes: [], initialEdges: [] };

    const moveIdSet = new Set(collection.moves.map((m) => m.move_id));

    // Create nodes from moves
    const flowNodes: Node[] = collection.moves.map((cm, index) => {
      const move = moves.find((m) => m.id === cm.move_id);
      return {
        id: cm.move_id,
        type: "moveNode",
        position: {
          x: cm.position_x ?? (index % 4) * 200,
          y: cm.position_y ?? Math.floor(index / 4) * 100,
        },
        data: {
          move: move || { id: cm.move_id, name: cm.move_name, is_state: false },
          hasStoredPosition: cm.position_x !== null && cm.position_y !== null,
          onAddConnection: (moveData: Move) => setAddConnectionMove(moveData),
          onInfoClick: (moveData: Move) => {
            setSelectedMove(moveData as Move);
            setAddConnectionMove(null);
          },
        },
      };
    });

    // Create edges from connections (only for moves in this collection)
    const flowEdges: Edge[] = connections
      .filter(
        (conn) =>
          moveIdSet.has(conn.source_move_id) &&
          moveIdSet.has(conn.target_move_id)
      )
      .map((conn) => {
        const sourceNode = flowNodes.find((n) => n.id === conn.source_move_id);
        const targetNode = flowNodes.find((n) => n.id === conn.target_move_id);
        const handles = getSmartHandles(sourceNode, targetNode);

        return {
          id: conn.id,
          source: conn.source_move_id,
          target: conn.target_move_id,
          sourceHandle: handles.sourceHandle,
          targetHandle: handles.targetHandle,
          type: "smoothstep" as const,
          markerEnd: { type: MarkerType.ArrowClosed },
          label: conn.label || undefined,
          data: { connection: conn },
        };
      });

    return { initialNodes: flowNodes, initialEdges: flowEdges };
  }, [collection, moves, connections]);

  // Analyze graph structure for connected components and node degrees
  const graphAnalysis = useMemo(() => {
    return analyzeGraph(initialNodes, initialEdges);
  }, [initialNodes, initialEdges]);

  // Helper to apply final styling to nodes and edges
  const applyFinalStyling = useCallback(
    (layoutedNodes: Node[], baseEdges: Edge[], layoutMode?: string) => {
      // Calculate curve factors for visual variety
      const curveFactors = calculateCurveFactors(baseEdges);

      // Force and ELK layouts use smoothstep edges since organic positioning
      // handles edge separation naturally; curved bezier edges create exaggerated
      // arcs when nodes are far apart in force-directed layouts
      const useSimpleEdges = layoutMode === "force" || layoutMode === "elk";

      // Apply edge styling and handles
      const finalEdges = baseEdges.map((edge) => {
        const sourceNode = layoutedNodes.find((n) => n.id === edge.source);
        const targetNode = layoutedNodes.find((n) => n.id === edge.target);
        const handles = layoutMode === "focus"
          ? getFocusHandles(sourceNode, targetNode)
          : getSmartHandles(sourceNode, targetNode);
        const isSelected = edge.id === selectedEdgeId;
        const curveFactor = curveFactors.get(edge.id) || 0;

        const edgeType = useSimpleEdges
          ? (isSelected ? "animatedCurvedEdge" : "smoothstep")
          : (isSelected ? "animatedCurvedEdge" : "curvedEdge");

        return {
          ...edge,
          sourceHandle: handles.sourceHandle,
          targetHandle: handles.targetHandle,
          type: edgeType,
          markerEnd: isSelected ? undefined : { type: MarkerType.ArrowClosed },
          data: { ...edge.data, curveFactor },
        };
      });

      // Determine which node should be selected
      const activeId = layout === "focus" ? focusedMoveId : selectedMove?.id;

      // Add connection status, component data, and selection state to nodes
      // For focus mode virtual nodes, use realMoveId to look up full-collection connection status
      const nodesWithAnalysis = layoutedNodes.map((node) => {
        const realId = (node.data as Record<string, unknown>).realMoveId as string | undefined;
        const lookupId = realId || node.id;
        const shouldSelect = activeId
          ? (lookupId === activeId || node.id === activeId)
          : false;
        return {
          ...node,
          selected: shouldSelect,
          data: {
            ...node.data,
            connectionStatus: graphAnalysis.connectionStatus.get(lookupId),
            componentIndex: graphAnalysis.nodeComponentIndex.get(lookupId),
            showComponentColors,
          },
        };
      });

      setNodes(nodesWithAnalysis);
      setEdges(finalEdges);

      // Center the view on the selected node after layout completes
      if (activeId && reactFlowInstance.current) {
        const selectedNode = nodesWithAnalysis.find((n) => n.selected);
        if (selectedNode) {
          // Use requestAnimationFrame to ensure nodes are rendered before fitting
          requestAnimationFrame(() => {
            reactFlowInstance.current?.fitView({
              nodes: [{ id: selectedNode.id }],
              duration: 300,
              maxZoom: 1.2,
              padding: 0.5,
            });
          });
        }
      }
    },
    [selectedEdgeId, graphAnalysis, showComponentColors, setNodes, setEdges, layout, focusedMoveId, selectedMove?.id]
  );

  // Apply layout when data changes
  useEffect(() => {
    if (initialNodes.length === 0) return;

    let finalNodes: Node[];
    let baseEdges: Edge[];

    if (layout === "focus" && focusedMoveId) {
      // Focus layout: centered focused move with predecessors/successors
      const focusResult = getFocusLayoutElements(
        initialNodes,
        initialEdges,
        connections,
        moves,
        focusedMoveId,
        focusSortBy,
        focusSortAsc,
        focusLevel
      );
      finalNodes = focusResult.nodes;
      baseEdges = focusResult.edges;

      // If a connection preview exists, inject the preview target/source node
      // into the layout if it's not already present (e.g., newly created move
      // with no connections yet)
      if (connectionPreview) {
        const previewMoveId =
          connectionPreview.sourceMoveId === focusedMoveId
            ? connectionPreview.targetMoveId
            : connectionPreview.sourceMoveId;
        const alreadyInLayout = finalNodes.some((n) => {
          const realId = (n.data as Record<string, unknown>).realMoveId as string | undefined;
          return n.id === previewMoveId || realId === previewMoveId;
        });
        if (!alreadyInLayout) {
          const previewNode = initialNodes.find((n) => n.id === previewMoveId);
          if (previewNode) {
            // Position on the right if focused move is source ("to"),
            // or on the left if focused move is target ("from")
            const isRight = connectionPreview.sourceMoveId === focusedMoveId;
            const COLUMN_GAP = 300;
            const CENTER_X = 400;
            const ROW_GAP = 80;
            // Place below existing nodes in that column
            const sameColumnNodes = finalNodes.filter((n) => {
              const fp = (n.data as Record<string, unknown>).focusPosition;
              return isRight ? fp === "right" : fp === "left";
            });
            const maxY = sameColumnNodes.length > 0
              ? Math.max(...sameColumnNodes.map((n) => n.position.y)) + ROW_GAP
              : (finalNodes.find((n) => (n.data as Record<string, unknown>).focusPosition === "center")?.position.y ?? 0);
            finalNodes = [
              ...finalNodes,
              {
                ...previewNode,
                position: {
                  x: isRight ? CENTER_X + COLUMN_GAP : CENTER_X - COLUMN_GAP,
                  y: maxY,
                },
                data: {
                  ...previewNode.data,
                  focusPosition: isRight ? "right" : "left",
                },
              },
            ];
            // Also register in virtualToRealId map (real ID = itself)
            focusResult.virtualToRealId.set(previewMoveId, previewMoveId);
          }
        }
      }

      setVirtualToRealIdMap(focusResult.virtualToRealId);
      applyFinalStyling(finalNodes, baseEdges, "focus");
    } else if (layout === "dagre") {
      setVirtualToRealIdMap(new Map());
      const { nodes: layoutedNodes } = getLayoutedElements(
        initialNodes,
        initialEdges
      );
      finalNodes = layoutedNodes;
      baseEdges = initialEdges;
      applyFinalStyling(finalNodes, baseEdges, "dagre");
    } else if (layout === "force") {
      // D3-Force layout - async
      getD3ForceLayout(initialNodes, initialEdges).then(({ nodes: layoutedNodes }) => {
        applyFinalStyling(layoutedNodes, initialEdges, "force");
      });
      return; // Early return since async
    } else if (layout === "elk") {
      // ELK layout - async
      getELKLayout(initialNodes, initialEdges, elkAlgorithm).then(({ nodes: layoutedNodes }) => {
        applyFinalStyling(layoutedNodes, initialEdges, "elk");
      });
      return; // Early return since async
    } else {
      // Custom layout: use stored positions or initial positions
      finalNodes = initialNodes;
      baseEdges = initialEdges;
      applyFinalStyling(finalNodes, baseEdges, "custom");
    }
  }, [initialNodes, initialEdges, layout, selectedEdgeId, focusedMoveId, focusSortBy, focusSortAsc, focusLevel, connections, moves, graphAnalysis, showComponentColors, elkAlgorithm, applyFinalStyling, connectionPreview]);

  // Sync ReactFlow node selection with selectedMove / focusedMoveId
  // Runs separately from layout effect to avoid expensive re-layouts on every click
  useEffect(() => {
    const activeId = layout === "focus" ? focusedMoveId : selectedMove?.id;
    if (!activeId) {
      setNodes((cur) => {
        if (!cur.some((n) => n.selected)) return cur;
        return cur.map((n) => (n.selected ? { ...n, selected: false } : n));
      });
      return;
    }
    setNodes((cur) =>
      cur.map((node) => {
        const realId = (node.data as Record<string, unknown>).realMoveId as string | undefined;
        const lookupId = realId || node.id;
        const shouldSelect = lookupId === activeId || node.id === activeId;
        if (node.selected === shouldSelect) return node;
        return { ...node, selected: shouldSelect };
      })
    );
  }, [layout, selectedMove?.id, focusedMoveId, setNodes]);

  // Add/remove preview edge when connection preview changes
  useEffect(() => {
    const previewId = "__preview_edge__";

    if (connectionPreview) {
      const { sourceMoveId, targetMoveId } = connectionPreview;

      // Find the rendered nodes for source and target
      setEdges((currentEdges) => {
        // Remove any existing preview edge first
        const withoutPreview = currentEdges.filter((e) => e.id !== previewId);

        return [
          ...withoutPreview,
          {
            id: previewId,
            source: sourceMoveId,
            target: targetMoveId,
            type: "smoothstep",
            animated: true,
            style: {
              stroke: "#e74c3c",
              strokeWidth: 2,
              strokeDasharray: "6 4",
              opacity: 0.8,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "#e74c3c",
            },
          },
        ];
      });
    } else {
      setEdges((currentEdges) => currentEdges.filter((e) => e.id !== previewId));
    }
  }, [connectionPreview, setEdges]);

  // Handle node click - show detail panel (or re-focus in focus mode)
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      // Resolve virtual ID to real move ID (for focus mode duplicate nodes)
      const realMoveId = virtualToRealIdMap.get(node.id) || node.id;
      const move = moves.find((m) => m.id === realMoveId);
      if (move) {
        if (layout === "focus") {
          // In focus mode, clicking a node re-focuses on it
          setFocusedMoveId(realMoveId);
          setSelectedMove(null);
        } else {
          setSelectedMove(move);
        }
        // If edit panel is open, switch it to the newly clicked move
        if (editingMove) {
          setEditingMove(move);
        }
        setAddConnectionMove(null);
        setSelectedEdgeId(null); // Clear edge selection when clicking a node
      }
    },
    [moves, layout, virtualToRealIdMap, editingMove]
  );

  // Helper: transfer selection state when switching layouts
  const switchToLayout = useCallback(
    (newLayout: "dagre" | "force" | "elk" | "custom") => {
      // When leaving focus mode, transfer focused node to selectedMove
      if (layout === "focus" && focusedMoveId) {
        const move = moves.find((m) => m.id === focusedMoveId);
        if (move) setSelectedMove(move);
      }
      setLayout(newLayout);
    },
    [layout, focusedMoveId, moves]
  );

  // Handle edge click - select and animate the edge
  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId((prev) => (prev === edge.id ? null : edge.id));
    setSelectedMove(null);
    setAddConnectionMove(null);
  }, []);

  // Handle node drag end - save position to backend
  const onNodeDragStop = useCallback(
    async (_event: React.MouseEvent, node: Node) => {
      if (layout !== "custom" || !id) return;

      try {
        await client.patch(`/collections/${id}/moves/${node.id}/position`, {
          position_x: node.position.x,
          position_y: node.position.y,
        });
      } catch (error) {
        console.error("Failed to save position:", error);
      }
    },
    [layout, id]
  );

  // Handle new connection via drag
  const onConnect: OnConnect = useCallback(
    async (connection: FlowConnection) => {
      if (!connection.source || !connection.target) return;

      // Resolve virtual IDs to real move IDs (Focus mode uses virtual node IDs)
      const sourceId = virtualToRealIdMap.get(connection.source) || connection.source;
      const targetId = virtualToRealIdMap.get(connection.target) || connection.target;

      // No self-connections (check after resolving virtual IDs)
      if (sourceId === targetId) return;

      // Check if connection already exists
      const exists = connections.some(
        (c) =>
          c.source_move_id === sourceId &&
          c.target_move_id === targetId
      );
      if (exists) return;

      try {
        const res = await client.post("/connections", {
          source_move_id: sourceId,
          target_move_id: targetId,
        });
        setConnections((prev) => [...prev, res.data]);
      } catch (error) {
        console.error("Failed to create connection:", error);
      }
    },
    [connections, virtualToRealIdMap]
  );

  // Handle add connection from panel (with direction support)
  const handleAddConnection = useCallback(
    async (targetMoveId: string, direction: "to" | "from", label: string | null) => {
      if (!addConnectionMove) return;

      const payload =
        direction === "to"
          ? {
              source_move_id: addConnectionMove.id,
              target_move_id: targetMoveId,
              label,
            }
          : {
              source_move_id: targetMoveId,
              target_move_id: addConnectionMove.id,
              label,
            };

      const res = await client.post("/connections", payload);
      setConnections((prev) => [...prev, res.data]);
    },
    [addConnectionMove]
  );

  // Handle adding a new move to the collection
  const handleAddMoveToCollection = useCallback(
    async (moveId: string) => {
      if (!id) return;
      try {
        await client.post(`/collections/${id}/moves`, { move_id: moveId });
      } catch (err: unknown) {
        // Ignore "already in collection" errors - this can happen with default collections
        const axiosError = err as { response?: { status?: number } };
        if (axiosError.response?.status !== 400) {
          throw err;
        }
      }
      // Reload all graph data so new move + its connections are picked up
      const res = await client.get(`/collections/${id}/graph-data`);
      const { collection: col, moves: graphMoves, connections: graphConnections } = res.data;
      setCollection(col);
      setMoves(graphMoves);
      setConnections(graphConnections);
      // Also update allDanceStyleMoves so the new move can be selected in the panel
      const newMove = graphMoves.find((m: Move) => m.id === moveId);
      if (newMove) {
        setAllDanceStyleMoves((prev) => {
          if (prev.some((m) => m.id === newMove.id)) return prev;
          return [...prev, newMove];
        });
      }
    },
    [id]
  );

  // Handle deleting a move (and all its connections)
  const handleDeleteMoveConfirm = useCallback(
    async (moveId: string) => {
      await client.delete(`/moves/${moveId}`);
      // Remove from local state immediately for responsiveness
      setMoves((prev) => prev.filter((m) => m.id !== moveId));
      setConnections((prev) =>
        prev.filter((c) => c.source_move_id !== moveId && c.target_move_id !== moveId)
      );
      // Reload collection to update move count and stubs
      if (id) {
        const res = await client.get(`/collections/${id}/graph-data`);
        setCollection(res.data.collection);
      }
      // Close panel and modal
      setSelectedMove(null);
      setDeleteConfirmMove(null);
    },
    [id]
  );

  // Get the selected connection from selectedEdgeId
  const selectedConnection = useMemo(() => {
    if (!selectedEdgeId) return null;
    // Direct match (non-focus layouts: edge.id === connection.id)
    const direct = connections.find((c) => c.id === selectedEdgeId);
    if (direct) return direct;
    // Focus mode: edge IDs are "${connectionId}_${virtualNodeId}[_...]"
    return connections.find((c) => selectedEdgeId.startsWith(c.id + "_")) || null;
  }, [selectedEdgeId, connections]);

  // Handle connection save (update local state)
  const handleConnectionSave = useCallback((updatedConnection: Connection) => {
    setConnections((prev) =>
      prev.map((c) => (c.id === updatedConnection.id ? updatedConnection : c))
    );
    setSelectedEdgeId(null);
  }, []);

  // Handle connection delete (update local state)
  const handleConnectionDelete = useCallback((connectionId: string) => {
    setConnections((prev) => prev.filter((c) => c.id !== connectionId));
    setSelectedEdgeId(null);
  }, []);

  // Handle closing the connection panel
  const handleConnectionPanelClose = useCallback(() => {
    setSelectedEdgeId(null);
  }, []);

  // Handle edit move button click
  const handleEditMoveClick = useCallback(() => {
    if (selectedMove) {
      setEditingMove(selectedMove);
      setSelectedMove(null);
    }
  }, [selectedMove]);

  // Handle move save from edit panel
  const handleMoveSave = useCallback((updatedMove: Move) => {
    setMoves((prev) =>
      prev.map((m) => (m.id === updatedMove.id ? updatedMove : m))
    );
    setAllDanceStyleMoves((prev) =>
      prev.map((m) => (m.id === updatedMove.id ? updatedMove : m))
    );
    setEditingMove(null);
  }, []);

  // Handle closing edit move panel
  const handleEditMovePanelClose = useCallback(() => {
    setEditingMove(null);
  }, []);

  if (loading) {
    return <div className="loading">Loading graph...</div>;
  }

  if (!collection) {
    return <div className="empty-state">Collection not found</div>;
  }

  const showPanel = selectedMove || addConnectionMove || editingMove || selectedConnection || panelClosing;

  return (
    <div className="graph-page">
      <div className="graph-header">
        <Link to={`/collections/${id}/moves`} className="back-link">
          &larr; {collection.name}
        </Link>
        <div className="layout-selector">
          <button
            className={`layout-btn ${layout === "dagre" ? "active" : ""}`}
            onClick={() => switchToLayout("dagre")}
          >
            Dagre
          </button>
          <button
            className={`layout-btn ${layout === "force" ? "active" : ""}`}
            onClick={() => switchToLayout("force")}
          >
            Force
          </button>
          <button
            className={`layout-btn ${layout === "elk" ? "active" : ""}`}
            onClick={() => switchToLayout("elk")}
          >
            ELK
          </button>
          <button
            className={`layout-btn ${layout === "focus" ? "active" : ""}`}
            onClick={() => {
              setLayout("focus");
              // Use currently selected move as focus target, fall back to first move
              if (selectedMove) {
                setFocusedMoveId(selectedMove.id);
              } else if (!focusedMoveId && moves.length > 0) {
                setFocusedMoveId(moves[0].id);
              }
              setSelectedMove(null);
            }}
          >
            Focus
          </button>
          <button
            className={`layout-btn ${layout === "custom" ? "active" : ""}`}
            onClick={() => switchToLayout("custom")}
          >
            Custom
          </button>
        </div>

        {/* Graph move search */}
        <div className="graph-search" ref={graphSearchRef}>
          <input
            type="text"
            placeholder="Search moves..."
            value={graphSearch}
            onChange={(e) => {
              setGraphSearch(e.target.value);
              setGraphSearchOpen(true);
              setGraphSearchLimit(20);
            }}
            onFocus={() => graphSearch.trim() && setGraphSearchOpen(true)}
            onKeyDown={handleGraphSearchKeyDown}
          />
          {graphSearchOpen && graphSearch.trim() && (
            <div className="graph-search-dropdown">
              {graphSearchResults.length === 0 ? (
                <div className="option disabled">No moves found</div>
              ) : (
                visibleGraphResults.map((move, idx) => (
                  <div
                    key={move.id}
                    className={`option ${idx === graphSearchIndex ? "highlighted" : ""}`}
                    onClick={() => handleGraphSearchSelect(move)}
                  >
                    {highlightTerms(move.name, graphSearch)}
                  </div>
                ))
              )}
              {graphSearchResults.length > graphSearchLimit && (
                <div
                  className="option show-more"
                  onClick={() => setGraphSearchLimit((prev) => prev + 20)}
                >
                  {graphSearchResults.length - graphSearchLimit} more...
                </div>
              )}
            </div>
          )}
        </div>

        {/* ELK algorithm sub-selector */}
        {layout === "elk" && (
          <div className="elk-algorithm-selector">
            <select
              value={elkAlgorithm}
              onChange={(e) => setElkAlgorithm(e.target.value as ELKAlgorithm)}
            >
              <option value="layered">Layered (Hierarchical)</option>
              <option value="stress">Stress (Organic)</option>
            </select>
          </div>
        )}

        {/* Focus mode controls */}
        {layout === "focus" && (
          <div className="focus-controls">
            <div className="focus-level-controls">
              <button
                className="focus-level-btn"
                onClick={() => setFocusLevel(Math.max(1, focusLevel - 1))}
                disabled={focusLevel <= 1}
                title="Decrease level"
              >
                −
              </button>
              <span className="focus-level-display" title="Connection depth level">
                L{focusLevel}
              </span>
              <button
                className="focus-level-btn"
                onClick={() => setFocusLevel(Math.min(5, focusLevel + 1))}
                disabled={focusLevel >= 5}
                title="Increase level"
              >
                +
              </button>
            </div>
            <select
              className="focus-sort-select"
              value={focusSortBy}
              onChange={(e) => setFocusSortBy(e.target.value)}
            >
              {FOCUS_SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              className="focus-sort-dir"
              onClick={() => setFocusSortAsc(!focusSortAsc)}
              title={focusSortAsc ? "Ascending" : "Descending"}
            >
              {focusSortAsc ? "↑" : "↓"}
            </button>
          </div>
        )}

        {/* Disconnected subgraphs warning badge */}
        {graphAnalysis.componentCount > 1 && (
          <button
            className={`disconnected-warning ${showComponentColors ? "active" : ""}`}
            onClick={() => setShowComponentColors(!showComponentColors)}
            title="Click to highlight disconnected groups"
          >
            ⚠️ {graphAnalysis.componentCount} disconnected groups
          </button>
        )}

        <span className="node-count">{moves.length} moves</span>
      </div>
      <div className="graph-container">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          onInit={(instance) => { reactFlowInstance.current = instance; }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={layout === "custom"}
          fitView
        >
          <Background color="#333" gap={20} />
          <Controls />
          <MiniMap
            nodeColor={(n) => {
              const nodeData = n.data as { move?: { is_state?: boolean } } | undefined;
              return nodeData?.move?.is_state ? "#666" : "#e94560";
            }}
            maskColor="rgba(18, 18, 24, 0.8)"
          />
        </ReactFlow>

        {/* Slide-in panels */}
        {showPanel && (
          <div className={`slide-panel-overlay ${panelClosing ? "closing" : ""}`}>
            {selectedMove && !addConnectionMove && !editingMove && (
              <MoveDetailPanel
                move={selectedMove}
                onClose={handlePanelClose}
                onAddConnection={() => {
                  setAddConnectionMove(selectedMove);
                  setSelectedMove(null);
                }}
                onEditMove={handleEditMoveClick}
                onDeleteMove={() => setDeleteConfirmMove(selectedMove)}
                closing={panelClosing}
              />
            )}
            {addConnectionMove && (
              <AddConnectionPanel
                sourceMove={addConnectionMove}
                allDanceStyleMoves={allDanceStyleMoves}
                collectionMoveIds={collectionMoveIds}
                existingConnections={connections}
                collectionDanceStyle={collection.dance_style}
                onSave={handleAddConnection}
                onAddMoveToCollection={handleAddMoveToCollection}
                onPreviewChange={setConnectionPreview}
                onClose={handlePanelClose}
                closing={panelClosing}
              />
            )}
            {editingMove && (
              <EditMovePanel
                move={editingMove}
                onSave={handleMoveSave}
                onClose={handleEditMovePanelClose}
              />
            )}
            {selectedConnection && !selectedMove && !addConnectionMove && !editingMove && (
              <ConnectionEditPanel
                connection={selectedConnection}
                moves={moves}
                onSave={handleConnectionSave}
                onDelete={handleConnectionDelete}
                onClose={handleConnectionPanelClose}
              />
            )}
          </div>
        )}

        {/* Delete Move Confirmation Modal */}
        {deleteConfirmMove && (
          <ConfirmModal
            title="Delete Move"
            message={`Delete "${deleteConfirmMove.name}" and all its connections? This cannot be undone.`}
            confirmLabel="Delete"
            cancelLabel="Cancel"
            confirmVariant="danger"
            onConfirm={() => handleDeleteMoveConfirm(deleteConfirmMove.id)}
            onCancel={() => setDeleteConfirmMove(null)}
          />
        )}
      </div>
    </div>
  );
}
