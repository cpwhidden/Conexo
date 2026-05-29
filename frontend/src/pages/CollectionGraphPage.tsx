import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import CollectionTabBar from "../components/CollectionTabBar";
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
import type { CollectionWithMoves, Connection, MediaTagLink, Move, MoveGraphData, Tag } from "../types";
import MoveNode from "../components/graph/MoveNode";
import MoveDetailPanel from "../components/graph/MoveDetailPanel";
import AddConnectionPanel, { type ConnectionPreview } from "../components/graph/AddConnectionPanel";
import ConnectionEditPanel from "../components/graph/ConnectionEditPanel";
import EditMovePanel from "../components/graph/EditMovePanel";
import AdvancedSearchPanel from "../components/graph/AdvancedSearchPanel";
import FilterPanel from "../components/graph/FilterPanel";
import ConfirmModal from "../components/ConfirmModal";
import { type Filters, DEFAULT_FILTERS, applyFilters } from "../utils/moveFilter";
import CurvedEdge from "../components/graph/CurvedEdge";
import AnimatedCurvedEdge from "../components/graph/AnimatedCurvedEdge";
import { analyzeGraph } from "../utils/graphAnalysis";
import { multiTermMatch, highlightTerms } from "../utils/search";
import { useDropdownKeyNav } from "../hooks/useDropdownKeyNav";
import { getD3ForceLayout, getELKLayout, type ELKAlgorithm } from "../utils/layouts";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";

const nodeTypes = { moveNode: MoveNode };
const edgeTypes = {
  curvedEdge: CurvedEdge,
  animatedCurvedEdge: AnimatedCurvedEdge,
};

// Edge highlight colors. Blue = incoming (a connection FROM a predecessor),
// orange = outgoing (a connection TO a successor), green = the Level-0 flow
// between two tagged moves (matches the tag chip / tagged-node color).
const EDGE_BLUE = "#4A9EFF";
const EDGE_ORANGE = "#FF8C42";
const TAG_GREEN = "#22c55e";

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

  // Build L1: direct connections to focused move. Skipped at L0 (the focused
  // move is shown alone, with no neighbor expansion).
  if (maxLevel >= 1) {
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
  }

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
        // Top move of every column aligns to a single row (straight line);
        // nodes stack downward within the column.
        const y = START_Y + rowIndex * ROW_GAP;
        positionedNodes.push({
          ...realNode,
          id: virtualId, // Use virtual ID
          position: { x, y },
          data: {
            ...realNode.data,
            focusPosition: "left",
            isColumnFirst: rowIndex === 0,
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
        // Top move of every column aligns to a single row (straight line);
        // nodes stack downward within the column.
        const y = START_Y + rowIndex * ROW_GAP;
        positionedNodes.push({
          ...realNode,
          id: virtualId, // Use virtual ID
          position: { x, y },
          data: {
            ...realNode.data,
            focusPosition: "right",
            isColumnFirst: rowIndex === 0,
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

// ─── Tag Focus Layout ──────────────────────────────────────────────────────
// Tagged moves form a left-to-right BRANCHING tree:
//   - Column (x) = longest path from a root (a tagged move with no tagged
//     predecessor), so every tagged→tagged edge points left→right.
//   - Row (y) is assigned by a left-to-right "barycenter" pass: each tagged
//     move sits at the average y of its tagged parents, so a move's children
//     stack in the next column centered on it, and a move with multiple parents
//     (a merge) is centered among them. Overlaps within a column are pushed
//     apart evenly.
// Non-tagged L1..LX neighbors hang off each tagged move (predecessors fan left,
// successors fan right) and share columns with the tree, resolved together.
// Tagged moves are highlighted green; flow edges green, incoming blue,
// outgoing orange.
function getTagFocusLayoutElements(
  nodes: Node[],
  _edges: Edge[],
  connections: Connection[],
  moves: Move[],
  taggedMoveIds: Set<string>,
  sortBy: string,
  sortAsc: boolean,
  maxLevel: number,
  showPreview: boolean
): {
  nodes: Node[];
  edges: Edge[];
  focusPositions: Map<string, "left" | "center" | "right">;
  virtualToRealId: Map<string, string>;
} {
  const COL_GAP = 280;
  const ROW_GAP = 90;
  // A preview floats ABOVE its node (CSS: bottom: 100% + 8px) capped at 360px,
  // so a preview-showing move needs this much clearance above it.
  const PREVIEW_CLEARANCE = 380;

  // Sorting (mirrors getFocusLayoutElements semantics)
  const getMoveData = (id: string) => moves.find((m) => m.id === id);
  const getSortValue = (moveId: string): number | string => {
    const move = getMoveData(moveId);
    if (!move) return 0;
    switch (sortBy) {
      case "difficulty": return move.difficulty ?? 0;
      case "familiarity": return move.familiarity ?? 0;
      case "mental_availability": return move.mental_availability ?? 0;
      case "beat_energy": return move.beat_energy ?? 0;
      case "sensual_energy": return move.sensual_energy ?? 0;
      case "created_at": return move.created_at ?? "";
      case "has_learning_notes": return move.learning_notes ? 1 : 0;
      default: return move.difficulty ?? 0;
    }
  };
  const compareMoves = (a: string, b: string): number => {
    const valA = getSortValue(a);
    const valB = getSortValue(b);
    if (valA < valB) return sortAsc ? -1 : 1;
    if (valA > valB) return sortAsc ? 1 : -1;
    return 0;
  };

  // A move shows a preview only when it's tagged (the highlighted "center"
  // nodes) — keeps clearance math predictable in the branching layout.
  const showsPreviewFor = (id: string) =>
    !!(showPreview && taggedMoveIds.has(id) && getMoveData(id)?.cover_media_id);

  // Resolve a column: place items at their desired y, then push down to enforce
  // a minimum gap (larger above a preview-showing node), and recenter so the
  // block's mean matches the mean desired y. Writes final y into `out` keyed by
  // each item's id (a move id or an instance key).
  const resolveColumn = (
    items: { id: string; d: number; preview: boolean; sortId: string }[],
    out: Map<string, number>
  ) => {
    if (items.length === 0) return;
    const sorted = [...items].sort((a, b) => a.d - b.d || compareMoves(a.sortId, b.sortId));
    const ys: number[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const gapAbove = ROW_GAP + (sorted[i].preview ? PREVIEW_CLEARANCE : 0);
      let y = sorted[i].d;
      if (i > 0) y = Math.max(y, ys[i - 1] + gapAbove);
      ys.push(y);
    }
    const meanD = sorted.reduce((s, it) => s + it.d, 0) / sorted.length;
    const meanY = ys.reduce((s, v) => s + v, 0) / ys.length;
    const shift = meanD - meanY;
    sorted.forEach((it, i) => out.set(it.id, ys[i] + shift));
  };

  // Full-graph adjacency.
  const succOf = new Map<string, Set<string>>();
  const predOf = new Map<string, Set<string>>();
  const connLookup = new Map<string, Connection>();
  for (const c of connections) {
    if (c.source_move_id === c.target_move_id) continue;
    if (!succOf.has(c.source_move_id)) succOf.set(c.source_move_id, new Set());
    succOf.get(c.source_move_id)!.add(c.target_move_id);
    if (!predOf.has(c.target_move_id)) predOf.set(c.target_move_id, new Set());
    predOf.get(c.target_move_id)!.add(c.source_move_id);
    connLookup.set(`${c.source_move_id}|${c.target_move_id}`, c);
  }

  // Tagged sub-graph (edges between two tagged moves).
  const taggedArr = [...taggedMoveIds];
  const tagSucc = new Map<string, Set<string>>();
  const tagPred = new Map<string, Set<string>>();
  taggedArr.forEach((id) => {
    tagSucc.set(id, new Set());
    tagPred.set(id, new Set());
  });
  for (const c of connections) {
    if (c.source_move_id === c.target_move_id) continue;
    if (taggedMoveIds.has(c.source_move_id) && taggedMoveIds.has(c.target_move_id)) {
      tagSucc.get(c.source_move_id)!.add(c.target_move_id);
      tagPred.get(c.target_move_id)!.add(c.source_move_id);
    }
  }

  // 1. Longest-path columns. Topological order via DFS (back edges in cycles
  //    are skipped), then col = max(parent col)+1.
  const tagColumn = new Map<string, number>();
  {
    const onStack = new Set<string>();
    const done = new Set<string>();
    const topo: string[] = [];
    const visit = (id: string) => {
      if (done.has(id) || onStack.has(id)) return;
      onStack.add(id);
      for (const s of [...(tagSucc.get(id) ?? [])].sort(compareMoves)) visit(s);
      onStack.delete(id);
      done.add(id);
      topo.push(id);
    };
    for (const id of [...taggedArr].sort(compareMoves)) visit(id);
    topo.reverse(); // sources first
    for (const id of topo) {
      let col = 0;
      for (const p of tagPred.get(id) ?? []) {
        if (tagColumn.has(p)) col = Math.max(col, tagColumn.get(p)! + 1);
      }
      tagColumn.set(id, col);
    }
  }

  // 2. Barycenter pass (left→right) to assign tagged y. Each tagged move sits at
  //    the mean y of its tagged parents; roots (column 0) are laid out in order.
  const taggedByCol = new Map<number, string[]>();
  for (const id of taggedArr) {
    const col = tagColumn.get(id) ?? 0;
    if (!taggedByCol.has(col)) taggedByCol.set(col, []);
    taggedByCol.get(col)!.push(id);
  }
  const tagCols = [...taggedByCol.keys()].sort((a, b) => a - b);
  const tagY = new Map<string, number>();
  let rootCursor = 0;
  for (const col of tagCols) {
    const ids = taggedByCol.get(col)!;
    const items = ids.map((id) => {
      const preview = showsPreviewFor(id);
      const parents = [...(tagPred.get(id) ?? [])].filter((p) => tagY.has(p));
      if (parents.length === 0) {
        const d = rootCursor;
        rootCursor += ROW_GAP + (preview ? PREVIEW_CLEARANCE : 0);
        return { id, d, preview, sortId: id };
      }
      const d = parents.reduce((s, p) => s + tagY.get(p)!, 0) / parents.length;
      return { id, d, preview, sortId: id };
    });
    resolveColumn(items, tagY);
  }

  // 3. Expand into INSTANCES, enforcing strict adjacency by duplication. Each
  //    instance is a (moveId, column) pair; a move may appear in several columns
  //    but only once per column. Every drawn edge connects adjacent columns.
  //
  //    Expansion is directional: tagged moves (seeded at their tree column) fan
  //    successors RIGHT and predecessors LEFT. A successor-side node only keeps
  //    fanning right; a predecessor-side node only keeps fanning left — so a
  //    neighbor never pulls in its OWN far connections (no spanning edges).
  //    Tagged→tagged edges always continue the flow (so a backward/long flow
  //    edge duplicates its target into the adjacent column); non-tagged
  //    neighbors are gated by maxLevel. Tagged duplicates are stubs (the move's
  //    own tree instance does the real expansion), preventing runaway growth.
  interface Inst {
    moveId: string;
    col: number;
    side: "left" | "center" | "right";
    desiredY: number;
  }
  const instKey = (moveId: string, col: number) => `${moveId}__c${col}`;
  const instById = new Map<string, Inst>();
  const colOccupant = new Map<number, Set<string>>(); // col → moveIds present
  let minCol = Infinity;
  let maxCol = -Infinity;

  const placeInst = (
    moveId: string,
    col: number,
    side: "left" | "center" | "right",
    desiredY: number
  ): { key: string; isNew: boolean } => {
    const key = instKey(moveId, col);
    if (instById.has(key)) return { key, isNew: false };
    instById.set(key, { moveId, col, side, desiredY });
    if (!colOccupant.has(col)) colOccupant.set(col, new Set());
    colOccupant.get(col)!.add(moveId);
    minCol = Math.min(minCol, col);
    maxCol = Math.max(maxCol, col);
    return { key, isNew: true };
  };

  // Bounds keep cyclic backbones (A→B→A) from duplicating forever.
  const numTagged = taggedArr.length;
  const maxTreeCol = tagCols.length ? Math.max(...tagCols) : 0;
  const COL_MAX = maxTreeCol + numTagged + maxLevel + 2;
  const COL_MIN = -(numTagged + maxLevel + 2);

  // Edges between instances (adjacent columns only).
  const edgeOut: Array<{ srcKey: string; tgtKey: string; conn: Connection; kind: "flow" | "incoming" | "outgoing" }> = [];
  const edgeSeen = new Set<string>();
  const addEdge = (srcKey: string, tgtKey: string, conn: Connection, kind: "flow" | "incoming" | "outgoing") => {
    const k = `${srcKey}->${tgtKey}`;
    if (edgeSeen.has(k)) return;
    edgeSeen.add(k);
    edgeOut.push({ srcKey, tgtKey, conn, kind });
  };

  // Seed every tagged move at its tree position and queue both directions.
  type Task = { moveId: string; col: number; depth: number; dir: "succ" | "pred" };
  const queue: Task[] = [];
  for (const id of taggedArr) {
    const col = tagColumn.get(id) ?? 0;
    placeInst(id, col, "center", tagY.get(id) ?? 0);
    queue.push({ moveId: id, col, depth: 0, dir: "succ" });
    queue.push({ moveId: id, col, depth: 0, dir: "pred" });
  }

  while (queue.length) {
    const { moveId: M, col: c, depth, dir } = queue.shift()!;
    const srcInst = instById.get(instKey(M, c))!;
    if (dir === "succ") {
      const newCol = c + 1;
      if (newCol > COL_MAX) continue;
      for (const S of [...(succOf.get(M) ?? [])].sort(compareMoves)) {
        const sTagged = taggedMoveIds.has(S);
        const newDepth = sTagged ? 0 : depth + 1;
        if (!sTagged && newDepth > maxLevel) continue;
        const { key: tgtKey, isNew } = placeInst(
          S,
          newCol,
          sTagged ? "center" : "right",
          srcInst.desiredY
        );
        const conn = connLookup.get(`${M}|${S}`);
        if (conn) addEdge(instKey(M, c), tgtKey, conn, taggedMoveIds.has(M) && sTagged ? "flow" : "outgoing");
        // Only non-tagged neighbors keep expanding; tagged duplicates are stubs.
        if (isNew && !sTagged) queue.push({ moveId: S, col: newCol, depth: newDepth, dir: "succ" });
      }
    } else {
      const newCol = c - 1;
      if (newCol < COL_MIN) continue;
      for (const P of [...(predOf.get(M) ?? [])].sort(compareMoves)) {
        const pTagged = taggedMoveIds.has(P);
        const newDepth = pTagged ? 0 : depth + 1;
        if (!pTagged && newDepth > maxLevel) continue;
        const { key: srcKey, isNew } = placeInst(
          P,
          newCol,
          pTagged ? "center" : "left",
          srcInst.desiredY
        );
        const conn = connLookup.get(`${P}|${M}`);
        if (conn) addEdge(srcKey, instKey(M, c), conn, pTagged && taggedMoveIds.has(M) ? "flow" : "incoming");
        if (isNew && !pTagged) queue.push({ moveId: P, col: newCol, depth: newDepth, dir: "pred" });
      }
    }
  }

  if (!Number.isFinite(minCol)) {
    minCol = 0;
    maxCol = 0;
  }

  // 4. Per-column overlap resolution over all instances.
  const finalY = new Map<string, number>(); // instance key → y
  for (let col = minCol; col <= maxCol; col++) {
    const occ = colOccupant.get(col);
    if (!occ) continue;
    const items = [...occ].map((moveId) => {
      const inst = instById.get(instKey(moveId, col))!;
      return { id: instKey(moveId, col), d: inst.desiredY, preview: showsPreviewFor(moveId), sortId: moveId };
    });
    resolveColumn(items, finalY);
  }

  // 5. Positioned nodes (one per instance). Topmost instance per column gets
  //    isColumnFirst; tagged moves preview via "center".
  const positionedNodes: Node[] = [];
  const focusPositions = new Map<string, "left" | "center" | "right">();
  const virtualToRealId = new Map<string, string>();

  for (let col = minCol; col <= maxCol; col++) {
    const occ = colOccupant.get(col);
    if (!occ) continue;
    const keys = [...occ].map((moveId) => instKey(moveId, col));
    const topKey = keys.reduce(
      (best, k) => ((finalY.get(k) ?? 0) < (finalY.get(best) ?? 0) ? k : best),
      keys[0]
    );
    for (const moveId of occ) {
      const realNode = nodes.find((n) => n.id === moveId);
      if (!realNode) continue;
      const key = instKey(moveId, col);
      const inst = instById.get(key)!;
      virtualToRealId.set(key, moveId);
      positionedNodes.push({
        ...realNode,
        id: key,
        position: { x: (col - minCol) * COL_GAP, y: finalY.get(key) ?? 0 },
        data: {
          ...realNode.data,
          focusPosition: inst.side,
          isColumnFirst: key === topKey,
          realMoveId: moveId,
        },
      });
      focusPositions.set(key, inst.side);
    }
  }

  // 6. Build edges from the collected adjacent-column instance pairs.
  const placedKeys = new Set(positionedNodes.map((n) => n.id));
  const filteredEdges: Edge[] = [];
  for (const e of edgeOut) {
    if (!placedKeys.has(e.srcKey) || !placedKeys.has(e.tgtKey)) continue;
    filteredEdges.push({
      id: `${e.conn.id}_${e.srcKey}_${e.tgtKey}`,
      source: e.srcKey,
      target: e.tgtKey,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
      label: e.conn.label || undefined,
      data: { connection: e.conn, tagEdgeKind: e.kind },
    });
  }

  return {
    nodes: positionedNodes,
    edges: filteredEdges,
    focusPositions,
    virtualToRealId,
  };
}

// ─── Ring Layout ───────────────────────────────────────────────────────────
// States form a circle; Movements radiate outward in subgraphs per State.
// Movements reachable from multiple States are duplicated (virtual nodes).
function getRingLayoutElements(
  nodes: Node[],
  edges: Edge[],
  connections: Connection[],
  moves: Move[]
): {
  nodes: Node[];
  edges: Edge[];
  virtualToRealId: Map<string, string>;
} {
  const CENTER_X = 500;
  const CENTER_Y = 400;
  const MIN_RING_RADIUS = 200;
  const HOP_GAP = 160;
  const MIN_ARC_GAP = 90;
  const ORPHAN_GAP = 120;

  const stateIds = new Set(moves.filter((m) => m.is_state).map((m) => m.id));
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const virtualToRealId = new Map<string, string>();

  // Build adjacency: moveId → Set<moveId> (bidirectional)
  const adj = new Map<string, Set<string>>();
  for (const conn of connections) {
    if (!adj.has(conn.source_move_id)) adj.set(conn.source_move_id, new Set());
    if (!adj.has(conn.target_move_id)) adj.set(conn.target_move_id, new Set());
    adj.get(conn.source_move_id)!.add(conn.target_move_id);
    adj.get(conn.target_move_id)!.add(conn.source_move_id);
  }

  // Collect State node IDs present in this collection
  const collectionMoveIds = new Set(nodes.map((n) => n.id));
  const statesInCollection = nodes.filter((n) => stateIds.has(n.id));
  const stateCount = statesInCollection.length;

  // Ring radius scales with number of states
  const RING_RADIUS = Math.max(MIN_RING_RADIUS, stateCount * 50);

  // Place states on ring, starting from top (-π/2)
  const stateAngles = new Map<string, number>();
  const ringNodes: Node[] = statesInCollection.map((node, i) => {
    const angle = -Math.PI / 2 + (i / Math.max(stateCount, 1)) * 2 * Math.PI;
    stateAngles.set(node.id, angle);
    virtualToRealId.set(node.id, node.id);
    return {
      ...node,
      position: {
        x: CENTER_X + RING_RADIUS * Math.cos(angle),
        y: CENTER_Y + RING_RADIUS * Math.sin(angle),
      },
      data: { ...node.data },
    };
  });

  // BFS from each State through Movements (stop at other States)
  // stateSubgraphs: stateId → Array<{ moveId, hop }>
  type SubgraphEntry = { moveId: string; hop: number };
  const stateSubgraphs = new Map<string, SubgraphEntry[]>();
  const reachedFromAnyState = new Set<string>();

  for (const stateNode of statesInCollection) {
    const entries: SubgraphEntry[] = [];
    const visited = new Set<string>([stateNode.id]);
    const queue: Array<{ id: string; hop: number }> = [{ id: stateNode.id, hop: 0 }];

    while (queue.length > 0) {
      const { id: currentId, hop } = queue.shift()!;
      const neighbors = adj.get(currentId);
      if (!neighbors) continue;

      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) continue;
        if (!collectionMoveIds.has(neighborId)) continue;
        visited.add(neighborId);

        if (stateIds.has(neighborId)) {
          // Don't traverse through other States, but they're "visited"
          continue;
        }

        // This is a Movement reachable from this State
        entries.push({ moveId: neighborId, hop: hop + 1 });
        reachedFromAnyState.add(neighborId);
        queue.push({ id: neighborId, hop: hop + 1 });
      }
    }

    stateSubgraphs.set(stateNode.id, entries);
  }

  // Position subgraph Movements around each State
  const subgraphNodes: Node[] = [];
  const arcSlice = stateCount > 0 ? (2 * Math.PI) / stateCount : 2 * Math.PI;

  for (const [stateId, entries] of stateSubgraphs) {
    const stateAngle = stateAngles.get(stateId)!;
    if (entries.length === 0) continue;

    // Group entries by hop level
    const hopGroups = new Map<number, SubgraphEntry[]>();
    for (const entry of entries) {
      if (!hopGroups.has(entry.hop)) hopGroups.set(entry.hop, []);
      hopGroups.get(entry.hop)!.push(entry);
    }

    for (const [hop, groupEntries] of hopGroups) {
      const dist = RING_RADIUS + hop * HOP_GAP;
      const count = groupEntries.length;

      // Spread within the State's arc slice, narrower at inner hops
      const maxSpread = arcSlice * 0.8;
      // Compute angular gap needed for MIN_ARC_GAP at this distance
      const angularGapNeeded = count > 1 ? MIN_ARC_GAP / dist : 0;
      const totalAngularSpan = Math.min(maxSpread, angularGapNeeded * (count - 1));
      const startAngle = stateAngle - totalAngularSpan / 2;
      const step = count > 1 ? totalAngularSpan / (count - 1) : 0;

      groupEntries.forEach((entry, idx) => {
        const angle = startAngle + idx * step;
        const virtualId = `${entry.moveId}_ring_${stateId}`;
        const origNode = nodeMap.get(entry.moveId);
        if (!origNode) return;

        virtualToRealId.set(virtualId, entry.moveId);

        subgraphNodes.push({
          ...origNode,
          id: virtualId,
          position: {
            x: CENTER_X + dist * Math.cos(angle),
            y: CENTER_Y + dist * Math.sin(angle),
          },
          data: {
            ...origNode.data,
            realMoveId: entry.moveId,
          },
        });
      });
    }
  }

  // Orphan Movements: not reachable from any State
  const orphanNodes: Node[] = [];
  const orphanMoves = nodes.filter(
    (n) => !stateIds.has(n.id) && !reachedFromAnyState.has(n.id)
  );
  if (orphanMoves.length > 0) {
    const orphanStartY = CENTER_Y + RING_RADIUS + HOP_GAP * 2;
    const orphanStartX = CENTER_X - ((orphanMoves.length - 1) * ORPHAN_GAP) / 2;
    orphanMoves.forEach((node, i) => {
      virtualToRealId.set(node.id, node.id);
      orphanNodes.push({
        ...node,
        position: {
          x: orphanStartX + i * ORPHAN_GAP,
          y: orphanStartY,
        },
        data: { ...node.data },
      });
    });
  }

  const allNodes = [...ringNodes, ...subgraphNodes, ...orphanNodes];

  // Build edges
  // For each connection, find which virtual/real node IDs to use
  const allNodeIds = new Set(allNodes.map((n) => n.id));
  const filteredEdges: Edge[] = [];
  const addedEdgeKeys = new Set<string>();

  for (const conn of connections) {
    const srcReal = conn.source_move_id;
    const tgtReal = conn.target_move_id;
    if (!collectionMoveIds.has(srcReal) || !collectionMoveIds.has(tgtReal)) continue;

    // Find all virtual instances of source and target
    const srcIds = Array.from(allNodeIds).filter(
      (id) => id === srcReal || virtualToRealId.get(id) === srcReal
    );
    const tgtIds = Array.from(allNodeIds).filter(
      (id) => id === tgtReal || virtualToRealId.get(id) === tgtReal
    );

    // Connect nodes that share the same subgraph (same State suffix),
    // or connect back to ring States (which use real IDs)
    for (const sId of srcIds) {
      for (const tId of tgtIds) {
        // Extract State suffix from virtual IDs
        const sSuffix = sId.includes("_ring_") ? sId.split("_ring_")[1] : null;
        const tSuffix = tId.includes("_ring_") ? tId.split("_ring_")[1] : null;

        // Same subgraph (both have same State suffix)
        const sameSubgraph = sSuffix && tSuffix && sSuffix === tSuffix;
        // One is a ring State (no suffix) — cross-edge back to ring
        const crossToRing = stateIds.has(sId) || stateIds.has(tId);
        // Both are orphans (no suffix, not states)
        const bothOrphan = !sSuffix && !tSuffix && !stateIds.has(sId) && !stateIds.has(tId);

        if (sameSubgraph || crossToRing || bothOrphan) {
          const edgeKey = `${sId}_${tId}`;
          if (addedEdgeKeys.has(edgeKey)) continue;
          addedEdgeKeys.add(edgeKey);

          const sourceNode = allNodes.find((n) => n.id === sId);
          const targetNode = allNodes.find((n) => n.id === tId);
          const handles = getSmartHandles(sourceNode, targetNode);

          const origEdge = edges.find((e) => e.id === conn.id);
          filteredEdges.push({
            id: `${conn.id}_${sId}_${tId}`,
            source: sId,
            target: tId,
            sourceHandle: handles.sourceHandle,
            targetHandle: handles.targetHandle,
            type: "smoothstep" as const,
            markerEnd: { type: MarkerType.ArrowClosed },
            label: origEdge?.label || conn.label || undefined,
            data: { connection: conn },
          });
        }
      }
    }
  }

  return { nodes: allNodes, edges: filteredEdges, virtualToRealId };
}

// ─── Core Layout ──────────────────────────────────────────────────────────
// Shows only Core moves. Distance reflects average shortest path length
// through non-Core intermediaries. D3 force simulation positions nodes.
interface CoreSimNode extends SimulationNodeDatum {
  id: string;
}
interface CoreSimLink extends SimulationLinkDatum<CoreSimNode> {
  source: string | CoreSimNode;
  target: string | CoreSimNode;
  weight: number;
}

function getCoreLayoutElements(
  nodes: Node[],
  _edges: Edge[],
  connections: Connection[],
  moves: Move[],
  onExplore?: (move: Move) => void,
  onInfoClick?: (move: Move) => void
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const BASE_DIST = 100;
  const DIST_SCALE = 60;
  const NODE_W = 160;

  const coreIds = new Set(moves.filter((m) => m.is_core).map((m) => m.id));
  const collectionIds = new Set(nodes.map((n) => n.id));

  // Only keep Core nodes that are in this collection
  const coreNodes = nodes.filter((n) => coreIds.has(n.id));
  if (coreNodes.length === 0) {
    return Promise.resolve({ nodes: [], edges: [] });
  }

  // Build directed adjacency from all connections in collection
  const adj = new Map<string, string[]>();
  for (const conn of connections) {
    if (!collectionIds.has(conn.source_move_id) || !collectionIds.has(conn.target_move_id)) continue;
    if (!adj.has(conn.source_move_id)) adj.set(conn.source_move_id, []);
    adj.get(conn.source_move_id)!.push(conn.target_move_id);
  }

  // BFS shortest path from source to target, returning intermediate count (-1 if unreachable)
  function bfsShortestPath(source: string, target: string): number {
    if (source === target) return 0;
    const visited = new Set<string>([source]);
    const queue: Array<{ id: string; intermediates: number }> = [{ id: source, intermediates: 0 }];

    while (queue.length > 0) {
      const { id, intermediates } = queue.shift()!;
      const neighbors = adj.get(id) || [];
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        if (neighbor === target) return intermediates; // don't count target as intermediate
        // Only traverse through non-Core intermediaries (or Core nodes that aren't the target)
        const newIntermediates = coreIds.has(neighbor) ? intermediates : intermediates + 1;
        queue.push({ id: neighbor, intermediates: newIntermediates });
      }
    }
    return -1; // unreachable
  }

  // Compute weighted edges between all Core pairs
  const coreList = Array.from(coreIds).filter((id) => collectionIds.has(id));
  const weightedEdges: Array<{ source: string; target: string; weight: number }> = [];
  const edgeKey = new Set<string>();

  for (let i = 0; i < coreList.length; i++) {
    for (let j = i + 1; j < coreList.length; j++) {
      const a = coreList[i];
      const b = coreList[j];
      const distAB = bfsShortestPath(a, b);
      const distBA = bfsShortestPath(b, a);

      // Use the shorter of the two directions, or whichever is reachable
      let weight = -1;
      if (distAB >= 0 && distBA >= 0) weight = Math.min(distAB, distBA);
      else if (distAB >= 0) weight = distAB;
      else if (distBA >= 0) weight = distBA;

      if (weight >= 0) {
        const key = `${a}_${b}`;
        if (!edgeKey.has(key)) {
          edgeKey.add(key);
          weightedEdges.push({ source: a, target: b, weight });
        }
      }
    }
  }

  // D3 force simulation
  return new Promise((resolve) => {
    const width = 800;
    const height = 600;

    const simNodes: CoreSimNode[] = coreNodes.map((n) => ({
      id: n.id,
      x: Math.random() * width,
      y: Math.random() * height,
    }));

    const simLinks: CoreSimLink[] = weightedEdges.map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
    }));

    const simulation = forceSimulation<CoreSimNode>(simNodes)
      .force(
        "link",
        forceLink<CoreSimNode, CoreSimLink>(simLinks)
          .id((d) => d.id)
          .distance((d) => BASE_DIST + (d as CoreSimLink).weight * DIST_SCALE)
      )
      .force("charge", forceManyBody().strength(-600))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide<CoreSimNode>().radius(NODE_W / 2 + 30));

    simulation.stop();
    for (let i = 0; i < 300; i++) {
      simulation.tick();
    }

    // Map positions back
    const positionedNodes = coreNodes.map((node) => {
      const simNode = simNodes.find((n) => n.id === node.id);
      const moveObj = moves.find((m) => m.id === node.id);
      return {
        ...node,
        position: {
          x: simNode?.x ?? node.position.x,
          y: simNode?.y ?? node.position.y,
        },
        data: {
          ...node.data,
          onAddConnection: undefined, // Hide "+" in Core view
          onExplore: onExplore && moveObj ? () => onExplore(moveObj) : undefined,
          onInfoClick: onInfoClick && moveObj ? () => onInfoClick(moveObj) : undefined,
        },
      };
    });

    // Create ReactFlow edges from weighted edges
    const flowEdges: Edge[] = weightedEdges.map((we, idx) => {
      const sourceNode = positionedNodes.find((n) => n.id === we.source);
      const targetNode = positionedNodes.find((n) => n.id === we.target);
      const handles = getSmartHandles(sourceNode, targetNode);

      return {
        id: `core_${idx}`,
        source: we.source,
        target: we.target,
        sourceHandle: handles.sourceHandle,
        targetHandle: handles.targetHandle,
        type: "smoothstep" as const,
        markerEnd: { type: MarkerType.ArrowClosed },
        data: { connection: { id: `core_${idx}`, source_move_id: we.source, target_move_id: we.target, label: null, notes: null, flow: null, created_at: "" } },
      };
    });

    resolve({ nodes: positionedNodes, edges: flowEdges });
  });
}

// ─── Core Explore Layout ──────────────────────────────────────────────────
// Shows a selected Core move and all moves reachable from it, stopping at
// other Core moves (which become leaf nodes in the subgraph).
function getCoreExploreLayoutElements(
  nodes: Node[],
  _edges: Edge[],
  connections: Connection[],
  moves: Move[],
  exploreId: string,
  onInfoClick?: (move: Move) => void,
  onExplore?: (move: Move) => void
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const coreIds = new Set(moves.filter((m) => m.is_core).map((m) => m.id));
  const collectionIds = new Set(nodes.map((n) => n.id));
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const moveMap = new Map(moves.map((m) => [m.id, m]));

  // Build directed adjacency
  const adj = new Map<string, Array<{ target: string; conn: Connection }>>();
  for (const conn of connections) {
    if (!collectionIds.has(conn.source_move_id) || !collectionIds.has(conn.target_move_id)) continue;
    if (!adj.has(conn.source_move_id)) adj.set(conn.source_move_id, []);
    adj.get(conn.source_move_id)!.push({ target: conn.target_move_id, conn });
  }

  // BFS from exploreId: traverse all moves, stop at other Core moves (include them as leaves)
  const visited = new Set<string>([exploreId]);
  const queue = [exploreId];
  const subgraphNodeIds = new Set<string>([exploreId]);
  const subgraphEdges: Array<{ source: string; target: string; conn: Connection }> = [];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const neighbors = adj.get(currentId) || [];
    for (const { target, conn } of neighbors) {
      if (!visited.has(target)) {
        visited.add(target);
        subgraphNodeIds.add(target);
        subgraphEdges.push({ source: currentId, target, conn });
        // Only continue traversing if target is NOT another Core move (it's a leaf)
        if (!coreIds.has(target) || target === exploreId) {
          queue.push(target);
        }
      } else if (subgraphNodeIds.has(target)) {
        // Edge to already-visited node in subgraph — still include the edge
        subgraphEdges.push({ source: currentId, target, conn });
      }
    }
  }

  // Build nodes
  const subNodes = Array.from(subgraphNodeIds)
    .map((id) => nodeMap.get(id))
    .filter((n): n is Node => n !== undefined);

  if (subNodes.length === 0) {
    return Promise.resolve({ nodes: [], edges: [] });
  }

  // Dagre hierarchical layout — respects edge direction, prevents overlaps
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: "LR",
    nodesep: 60,
    ranksep: 120,
    marginx: 40,
    marginy: 40,
  });

  // Estimate node width from name length (CSS has no max-width, nodes grow with content)
  // ~8px per character + padding/badge space
  subNodes.forEach((node) => {
    const moveObj = moveMap.get(node.id);
    const nameLen = moveObj?.name?.length ?? 10;
    const estimatedWidth = Math.max(NODE_WIDTH, nameLen * 8 + 80);
    dagreGraph.setNode(node.id, { width: estimatedWidth, height: NODE_HEIGHT });
  });

  subgraphEdges.forEach((se) => {
    dagreGraph.setEdge(se.source, se.target);
  });

  dagre.layout(dagreGraph);

  const positionedNodes = subNodes.map((node) => {
    const pos = dagreGraph.node(node.id);
    const moveObj = moveMap.get(node.id);
    const isLeafCore = coreIds.has(node.id) && node.id !== exploreId;
    return {
      ...node,
      position: {
        x: pos.x - pos.width / 2,
        y: pos.y - pos.height / 2,
      },
      data: {
        ...node.data,
        // Leaf Core nodes: hide "+" (they're endpoints). Others: keep "+".
        onAddConnection: isLeafCore ? undefined : (node.data as Record<string, unknown>).onAddConnection,
        onExplore: (isLeafCore || node.id === exploreId) && onExplore && moveObj
          ? () => onExplore(moveObj)
          : undefined,
        onInfoClick: onInfoClick && moveObj ? () => onInfoClick(moveObj) : undefined,
      },
    };
  });

  const flowEdges: Edge[] = subgraphEdges.map((se, idx) => {
    const sourceNode = positionedNodes.find((n) => n.id === se.source);
    const targetNode = positionedNodes.find((n) => n.id === se.target);
    const handles = getSmartHandles(sourceNode, targetNode);

    return {
      id: se.conn.id || `explore_${idx}`,
      source: se.source,
      target: se.target,
      sourceHandle: handles.sourceHandle,
      targetHandle: handles.targetHandle,
      type: "default" as const,
      markerEnd: { type: MarkerType.ArrowClosed },
      label: se.conn.label || undefined,
      data: { connection: se.conn },
    };
  });

  return Promise.resolve({ nodes: positionedNodes, edges: flowEdges });
}

export default function CollectionGraphPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const mode: "flow" | "graph" = location.pathname.endsWith("/flow") ? "flow" : "graph";
  const [collection, setCollection] = useState<CollectionWithMoves | null>(
    null
  );
  const [moves, setMoves] = useState<MoveGraphData[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [mediaTags, setMediaTags] = useState<MediaTagLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Read initial layout and node from URL (once, on mount)
  const initialParams = useRef(new URLSearchParams(window.location.search));
  const [layout, setLayout] = useState<"dagre" | "custom" | "focus" | "force" | "elk" | "ring" | "core">(() => {
    if (mode === "flow") return "focus";
    const urlLayout = initialParams.current.get("layout");
    const graphLayouts = ["dagre", "custom", "force", "elk", "ring", "core"] as const;
    if (urlLayout && (graphLayouts as readonly string[]).includes(urlLayout)) {
      return urlLayout as typeof graphLayouts[number];
    }
    return "dagre";
  });
  const [elkAlgorithm, setElkAlgorithm] = useState<ELKAlgorithm>("layered");

  // Focus mode state
  const [focusedMoveId, setFocusedMoveId] = useState<string | null>(null);
  const [focusSortBy, setFocusSortBy] = useState<string>("difficulty");
  const [focusSortAsc, setFocusSortAsc] = useState(true);

  // Sync layout to route mode (handles tab switching without remount)
  useEffect(() => {
    if (mode === "flow" && layout !== "focus") {
      setLayout("focus");
    } else if (mode === "graph" && layout === "focus") {
      setLayout("dagre");
    }
  }, [mode, layout]);

  // Auto-select node when focus layout opens with no focused node
  // Prefer URL param, fall back to random
  useEffect(() => {
    if (layout === "focus" && !focusedMoveId && moves.length > 0) {
      const urlNode = initialParams.current.get("node");
      if (urlNode && moves.some((m) => m.id === urlNode)) {
        setFocusedMoveId(urlNode);
      } else {
        const randomIndex = Math.floor(Math.random() * moves.length);
        setFocusedMoveId(moves[randomIndex].id);
      }
    }
  }, [layout, focusedMoveId, moves]);
  const [focusLevel, setFocusLevel] = useState(() => {
    const urlLevel = initialParams.current.get("level");
    const parsed = urlLevel ? parseInt(urlLevel, 10) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 5 ? parsed : 1;
  });
  const [virtualToRealIdMap, setVirtualToRealIdMap] = useState<Map<string, string>>(new Map());

  // Core explore state: when set, Core view shows this move's reachable subgraph
  const [coreExploreId, setCoreExploreId] = useState<string | null>(null);
  // Core detail: tracks whether the detail panel was opened via the info button (not node click)
  const [coreShowDetail, setCoreShowDetail] = useState(false);

  // Focus preview state
  const [showPreview, setShowPreview] = useState(() => initialParams.current.get("preview") === "1");

  // Active tag filter (Flow mode): when set, focus locks to a tagged move
  // and tagged moves are visually highlighted in the graph.
  const [activeTagId, setActiveTagId] = useState<string | null>(() => initialParams.current.get("tag"));

  // Panel state
  const [selectedMove, setSelectedMove] = useState<Move | null>(null);
  const [addConnectionMove, setAddConnectionMove] = useState<Move | null>(null);
  const [editingMove, setEditingMove] = useState<Move | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [panelClosing, setPanelClosing] = useState(false);
  const [deleteConfirmMove, setDeleteConfirmMove] = useState<Move | null>(null);
  const [deleteSequenceWarnings, setDeleteSequenceWarnings] = useState<string[]>([]);
  const [connectionPreview, setConnectionPreview] = useState<ConnectionPreview | null>(null);

  // Sync selected node, layout, level, preview, and active tag to URL (via replaceState, no React re-renders)
  useEffect(() => {
    const nodeId = layout === "focus" ? focusedMoveId : selectedMove?.id;
    const params = new URLSearchParams();
    if (nodeId) params.set("node", nodeId);
    if (layout !== "focus") params.set("layout", layout);
    if (focusLevel !== 1) params.set("level", String(focusLevel));
    if (showPreview) params.set("preview", "1");
    if (activeTagId) params.set("tag", activeTagId);
    const newSearch = params.toString();
    const newUrl = newSearch ? `${window.location.pathname}?${newSearch}` : window.location.pathname;
    if (window.location.search !== (newSearch ? `?${newSearch}` : "")) {
      window.history.replaceState(null, "", newUrl);
    }
  }, [selectedMove?.id, focusedMoveId, layout, focusLevel, showPreview, activeTagId]);

  // Derived: the currently active tag object (null if no tag or tag was deleted)
  const activeTag = useMemo(
    () => (activeTagId ? tags.find((t) => t.id === activeTagId) ?? null : null),
    [tags, activeTagId]
  );

  // Derived: set of move IDs that carry the active tag
  const taggedMoveIds = useMemo(() => {
    if (!activeTag) return new Set<string>();
    return new Set(
      moves.filter((m) => m.tag_names?.includes(activeTag.name)).map((m) => m.id)
    );
  }, [activeTag, moves]);

  // Derived: for the active tag, which media item each move's preview should
  // use (the media marked with that tag). Moves without one fall back to cover.
  const tagPreviewMediaByMove = useMemo(() => {
    const map = new Map<string, string>();
    if (!activeTagId) return map;
    for (const mt of mediaTags) {
      if (mt.tag_id === activeTagId) map.set(mt.move_id, mt.media_id);
    }
    return map;
  }, [activeTagId, mediaTags]);

  // Clear the active tag if it was deleted (e.g. user removed the tag in another tab)
  useEffect(() => {
    if (activeTagId && tags.length > 0 && !tags.some((t) => t.id === activeTagId)) {
      setActiveTagId(null);
    }
  }, [activeTagId, tags]);

  // Ensure a focused move exists while a tag is active (the tag layout needs
  // one to render). Only seeds a default when nothing is focused — it must NOT
  // override an explicit click, which may select a non-tagged neighbor that
  // becomes the focus when the tag chip is cleared.
  useEffect(() => {
    if (!activeTagId || taggedMoveIds.size === 0) return;
    if (focusedMoveId) return;
    const firstTagged = moves.find((m) => taggedMoveIds.has(m.id));
    if (firstTagged) setFocusedMoveId(firstTagged.id);
  }, [activeTagId, taggedMoveIds, focusedMoveId, moves]);

  // Graph analysis state - toggle for showing component colors
  const [showComponentColors, setShowComponentColors] = useState(false);

  // Graph search state
  const [graphSearch, setGraphSearch] = useState("");
  const [graphSearchOpen, setGraphSearchOpen] = useState(false);
  const [graphSearchLimit, setGraphSearchLimit] = useState(20);
  const graphSearchRef = useRef<HTMLDivElement>(null);
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);

  // Collection filter state
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<Filters>({ ...DEFAULT_FILTERS });
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [activeFilterName, setActiveFilterName] = useState<string | null>(null);

  // Handle panel close with animation
  const handlePanelClose = useCallback(() => {
    setPanelClosing(true);
    setCoreShowDetail(false);
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
  // Tracks the last layout "structure" we auto-centered on. In tag mode the
  // structure doesn't change when the focused node changes (clicking just
  // re-selects), so we use this to avoid re-centering the view on every click.
  const lastFitKeyRef = useRef<string>("");

  // Sort by last-updated datetime, most recent first. updated_at is an ISO
  // string (naive UTC), so lexicographic compare matches chronological order.
  const byUpdatedDesc = (a: { updated_at: string }, b: { updated_at: string }) =>
    (b.updated_at ?? "").localeCompare(a.updated_at ?? "");

  // Graph search: filtered results, newest-updated first
  const graphSearchResults = useMemo(() => {
    if (!graphSearch.trim()) return [];
    return moves.filter((m) => multiTermMatch(m.name, graphSearch)).sort(byUpdatedDesc);
  }, [moves, graphSearch]);

  // Tag search results (Flow mode only — Graph mode keeps moves-only search)
  const tagSearchResults = useMemo(() => {
    if (mode !== "flow" || !graphSearch.trim()) return [];
    return tags.filter((t) => multiTermMatch(t.name, graphSearch)).sort(byUpdatedDesc);
  }, [tags, graphSearch, mode]);

  // Graph search: select a move from results
  const handleGraphSearchSelect = useCallback(
    (move: Move) => {
      setGraphSearch("");
      setGraphSearchOpen(false);
      if (layout === "focus") {
        if (activeTagId) {
          // In tag mode: if the move is already shown in the tag layout, focus
          // it (stay in tag mode) and center on it. Otherwise exit the tag view
          // and show the move as the focused node in regular Flow.
          const displayedNode = nodes.find((n) => {
            const realId = (n.data as Record<string, unknown>).realMoveId as string | undefined;
            return (realId ?? n.id) === move.id;
          });
          if (displayedNode) {
            setFocusedMoveId(move.id);
            setSelectedMove(null);
            requestAnimationFrame(() => {
              reactFlowInstance.current?.fitView({
                nodes: [{ id: displayedNode.id }],
                duration: 300,
                maxZoom: 1.2,
                padding: 0.5,
              });
            });
          } else {
            setActiveTagId(null);
            setFocusedMoveId(move.id);
            setSelectedMove(null);
          }
          return;
        }
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
    [layout, setNodes, activeTagId, nodes]
  );

  // Graph search: select a tag from results
  const handleTagSearchSelect = useCallback(
    (tag: Tag) => {
      setGraphSearch("");
      setGraphSearchOpen(false);
      setActiveTagId(tag.id);
      const firstTagged = moves.find((m) => m.tag_names?.includes(tag.name));
      if (firstTagged) setFocusedMoveId(firstTagged.id);
      setSelectedMove(null);
    },
    [moves]
  );

  const handleClearTag = useCallback(() => {
    setActiveTagId(null);
  }, []);

  // Clicking a tag in the move detail panel activates that tag in the Flow view.
  // If we're in Graph mode, switch to Flow (the fresh URL carries ?tag= so it
  // works whether or not the route remounts).
  const handleTagClickFromPanel = useCallback(
    (tag: Tag) => {
      setActiveTagId(tag.id);
      handlePanelClose();
      if (mode !== "flow") {
        navigate(`/collections/${id}/flow?tag=${tag.id}`);
      }
    },
    [mode, id, navigate, handlePanelClose]
  );

  // Graph search: keyboard navigation — tags first, then moves
  const visibleTagResults = tagSearchResults.slice(0, 10);
  const visibleGraphResults = graphSearchResults.slice(0, graphSearchLimit);
  const combinedItemCount = visibleTagResults.length + visibleGraphResults.length;
  const handleCombinedSelect = useCallback(
    (i: number) => {
      if (i < visibleTagResults.length) {
        handleTagSearchSelect(visibleTagResults[i]);
      } else {
        handleGraphSearchSelect(visibleGraphResults[i - visibleTagResults.length]);
      }
    },
    [visibleTagResults, visibleGraphResults, handleTagSearchSelect, handleGraphSearchSelect]
  );
  const { highlightedIndex: graphSearchIndex, handleKeyDown: handleGraphSearchKeyDown } =
    useDropdownKeyNav({
      itemCount: combinedItemCount,
      onSelect: handleCombinedSelect,
      onEscape: () => setGraphSearchOpen(false),
      enabled: graphSearchOpen && graphSearch.trim().length > 0,
    });

  // Graph search: click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        graphSearchRef.current &&
        !graphSearchRef.current.contains(e.target as globalThis.Node)
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
    setLoadError(null);
    try {
      const res = await client.get(`/collections/${id}/graph-data`);
      const { collection: col, moves: graphMoves, connections: graphConnections, tags: graphTags, media_tags: graphMediaTags } = res.data;
      setCollection(col);
      setMoves(graphMoves);
      setConnections(graphConnections);
      setTags(graphTags || []);
      setMediaTags(graphMediaTags || []);
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 404) {
        setLoadError("This collection doesn't seem to exist. Maybe it was deleted, or the link is wrong.");
      } else {
        setLoadError("Something went wrong loading this collection. Try refreshing — if it keeps happening, it's a bug on our end.");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadGraphData();
  }, [loadGraphData]);

  // Restore selected node from URL param after data loads (for non-focus layouts)
  const restoredFromUrl = useRef(false);
  useEffect(() => {
    if (restoredFromUrl.current || moves.length === 0) return;
    restoredFromUrl.current = true;
    const urlNode = initialParams.current.get("node");
    if (urlNode && layout !== "focus") {
      const move = moves.find((m) => m.id === urlNode);
      if (move) setSelectedMove(move);
    }
  }, [moves, layout]);

  // Fetch ALL moves (for Add Connection panel - moves are no longer dance-style-scoped)
  const [allMoves, setAllMoves] = useState<Move[]>([]);
  useEffect(() => {
    if (!collection) return;
    client
      .get("/moves")
      .then((res) => setAllMoves(res.data))
      .catch(console.error);
  }, [collection]);

  // Create set of move IDs in this collection
  const collectionMoveIds = useMemo(
    () => new Set(moves.map((m) => m.id)),
    [moves]
  );

  // Apply collection filter to moves
  const isFilterActive = JSON.stringify(activeFilter) !== JSON.stringify(DEFAULT_FILTERS);
  const filteredMoves = useMemo(() => {
    if (!isFilterActive) return moves;
    return applyFilters(moves, activeFilter);
  }, [moves, activeFilter, isFilterActive]);
  const filteredMoveIds = useMemo(
    () => new Set(filteredMoves.map((m) => m.id)),
    [filteredMoves]
  );

  // When filter hides the focused/selected move, BFS to find nearest visible move
  useEffect(() => {
    if (!isFilterActive || filteredMoveIds.size === 0) return;

    const currentId = layout === "focus" ? focusedMoveId : selectedMove?.id;
    if (!currentId || filteredMoveIds.has(currentId)) return;

    // Build adjacency from all connections (not just filtered)
    const adj = new Map<string, Set<string>>();
    for (const c of connections) {
      if (!adj.has(c.source_move_id)) adj.set(c.source_move_id, new Set());
      if (!adj.has(c.target_move_id)) adj.set(c.target_move_id, new Set());
      adj.get(c.source_move_id)!.add(c.target_move_id);
      adj.get(c.target_move_id)!.add(c.source_move_id);
    }

    // BFS from currentId to find first visible move
    const visited = new Set<string>([currentId]);
    const queue = [currentId];
    let found: string | null = null;

    while (queue.length > 0) {
      const node = queue.shift()!;
      if (filteredMoveIds.has(node) && node !== currentId) {
        found = node;
        break;
      }
      for (const neighbor of adj.get(node) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    // Fallback to first filtered move if BFS found nothing
    const targetId = found || filteredMoves[0]?.id;
    if (!targetId) return;

    if (layout === "focus") {
      setFocusedMoveId(targetId);
    } else {
      const move = moves.find((m) => m.id === targetId);
      if (move) setSelectedMove(move);
    }
  }, [filteredMoveIds, isFilterActive]);

  // Convert data to React Flow nodes and edges
  const { initialNodes, initialEdges } = useMemo(() => {
    if (!collection) return { initialNodes: [], initialEdges: [] };

    const moveIdSet = new Set(
      collection.moves
        .filter((m) => filteredMoveIds.has(m.move_id))
        .map((m) => m.move_id)
    );

    // Create nodes from moves (filtered by collection filter)
    const filteredCollectionMoves = collection.moves.filter((cm) => moveIdSet.has(cm.move_id));
    const flowNodes: Node[] = filteredCollectionMoves.map((cm, index) => {
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
          showPreview,
          onAddConnection: (moveData: Move) => {
            setAddConnectionMove(moveData);
            setEditingMove(null);
          },
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
  }, [collection, moves, connections, showPreview, filteredMoveIds]);

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
      const useSimpleEdges = layoutMode === "force" || layoutMode === "elk" || layoutMode === "core";

      // Apply edge styling and handles
      const finalEdges = baseEdges.map((edge) => {
        const sourceNode = layoutedNodes.find((n) => n.id === edge.source);
        const targetNode = layoutedNodes.find((n) => n.id === edge.target);
        const handles = layoutMode === "focus"
          ? getFocusHandles(sourceNode, targetNode)
          : getSmartHandles(sourceNode, targetNode);
        const isSelected = edge.id === selectedEdgeId;
        const curveFactor = curveFactors.get(edge.id) || 0;

        const edgeType = layoutMode === "core"
          ? (isSelected ? "animatedCurvedEdge" : "default")
          : useSimpleEdges
            ? (isSelected ? "animatedCurvedEdge" : "smoothstep")
            : (isSelected ? "animatedCurvedEdge" : "curvedEdge");

        // Tag layout: color every edge structurally by its kind so all tagged
        // moves (not just the focused one) show highlighted connections.
        const tagKind = (edge.data as Record<string, unknown> | undefined)?.tagEdgeKind as
          | "flow"
          | "incoming"
          | "outgoing"
          | undefined;
        let tagStyle: React.CSSProperties | undefined;
        let tagMarkerColor: string | undefined;
        if (tagKind === "flow") {
          tagStyle = { stroke: TAG_GREEN, strokeWidth: 2.5 };
          tagMarkerColor = TAG_GREEN;
        } else if (tagKind === "incoming") {
          tagStyle = { stroke: EDGE_BLUE, strokeWidth: 2.5 };
          tagMarkerColor = EDGE_BLUE;
        } else if (tagKind === "outgoing") {
          tagStyle = { stroke: EDGE_ORANGE, strokeWidth: 2.5 };
          tagMarkerColor = EDGE_ORANGE;
        }

        return {
          ...edge,
          sourceHandle: handles.sourceHandle,
          targetHandle: handles.targetHandle,
          type: edgeType,
          markerEnd: isSelected
            ? undefined
            : { type: MarkerType.ArrowClosed, color: tagMarkerColor },
          ...(tagStyle ? { style: tagStyle } : {}),
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
            tagged: taggedMoveIds.has(lookupId),
            // When a tag is active, prefer the media marked with it (else cover).
            previewMediaId: tagPreviewMediaByMove.get(lookupId),
          },
        };
      });

      setNodes(nodesWithAnalysis);
      setEdges(finalEdges);

      // Center the view on the selected node after layout completes.
      // In tag mode the layout structure is independent of the focused node, so
      // we only auto-center when the structure (tag / level / sort) changes —
      // clicking a node to re-select it should NOT pan the whole view.
      const isTagMode = layoutMode === "focus" && !!activeTagId;
      const fitKey = isTagMode
        ? `tag:${activeTagId}:${focusLevel}:${focusSortBy}:${focusSortAsc}`
        : `${layoutMode}:${activeId ?? ""}`;
      const shouldCenter = !isTagMode || fitKey !== lastFitKeyRef.current;
      lastFitKeyRef.current = fitKey;

      if (shouldCenter && activeId && reactFlowInstance.current) {
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
    // Note: selectedMove?.id intentionally excluded — selection sync is handled
    // by a separate useEffect to avoid triggering expensive re-layouts on click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedEdgeId, graphAnalysis, showComponentColors, setNodes, setEdges, layout, focusedMoveId, taggedMoveIds, activeTagId, focusLevel, focusSortBy, focusSortAsc, tagPreviewMediaByMove]
  );

  // Apply layout when data changes
  useEffect(() => {
    if (initialNodes.length === 0) return;

    let finalNodes: Node[];
    let baseEdges: Edge[];

    if (layout === "focus" && focusedMoveId) {
      // When a tag is active, use the multi-column tag-focus layout where each
      // tagged move owns its own column and L-neighbors fan into the columns
      // to either side. Otherwise use the standard single-center focus.
      const focusResult = activeTagId && taggedMoveIds.size > 0
        ? getTagFocusLayoutElements(
            initialNodes,
            initialEdges,
            connections,
            moves,
            taggedMoveIds,
            focusSortBy,
            focusSortAsc,
            focusLevel,
            showPreview
          )
        : getFocusLayoutElements(
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
    } else if (layout === "ring") {
      const ringResult = getRingLayoutElements(initialNodes, initialEdges, connections, moves);
      finalNodes = ringResult.nodes;
      baseEdges = ringResult.edges;
      setVirtualToRealIdMap(ringResult.virtualToRealId);
      applyFinalStyling(finalNodes, baseEdges, "ring");
    } else if (layout === "core") {
      setVirtualToRealIdMap(new Map());
      const exploreHandler = (move: Move) => setCoreExploreId(move.id);
      const coreInfoHandler = (move: Move) => {
        setCoreShowDetail(true);
        setSelectedMove(move);
      };
      if (coreExploreId) {
        getCoreExploreLayoutElements(initialNodes, initialEdges, connections, moves, coreExploreId, coreInfoHandler, exploreHandler).then((result) => {
          applyFinalStyling(result.nodes, result.edges, "core");
          // Center view on the explore root node
          requestAnimationFrame(() => {
            reactFlowInstance.current?.fitView({
              nodes: [{ id: coreExploreId }],
              duration: 400,
              maxZoom: 1.2,
              padding: 0.5,
            });
          });
        });
      } else {
        getCoreLayoutElements(initialNodes, initialEdges, connections, moves, exploreHandler, coreInfoHandler).then((result) => {
          applyFinalStyling(result.nodes, result.edges, "core");
        });
      }
      return; // Early return since async
    } else {
      // Custom layout: use stored positions or initial positions
      finalNodes = initialNodes;
      baseEdges = initialEdges;
      applyFinalStyling(finalNodes, baseEdges, "custom");
    }
  // Note: selectedEdgeId intentionally excluded — edge selection styling is handled
  // by applyFinalStyling callback, not by re-running the full layout.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNodes, initialEdges, layout, focusedMoveId, focusSortBy, focusSortAsc, focusLevel, connections, moves, graphAnalysis, showComponentColors, elkAlgorithm, applyFinalStyling, connectionPreview, coreExploreId, activeTagId, taggedMoveIds, showPreview]);

  // Sync ReactFlow node selection + edge highlighting with selectedMove / focusedMoveId
  // Runs separately from layout effect to avoid expensive re-layouts on every click
  useEffect(() => {
    const activeId = layout === "focus" ? focusedMoveId : selectedMove?.id;

    // Tag mode: edges are colored structurally by applyFinalStyling (green
    // flow / blue incoming / orange outgoing) for ALL tagged moves. Here we
    // only sync the focused node's selection ring — don't recolor edges.
    if (activeTagId && layout === "focus") {
      setNodes((cur) =>
        cur.map((node) => {
          const realId = (node.data as Record<string, unknown>).realMoveId as string | undefined;
          const lookupId = realId || node.id;
          const shouldSelect = activeId ? (lookupId === activeId || node.id === activeId) : false;
          if (node.selected === shouldSelect) return node;
          return { ...node, selected: shouldSelect };
        })
      );
      return;
    }

    if (!activeId) {
      // Clear node selection
      setNodes((cur) => {
        if (!cur.some((n) => n.selected)) return cur;
        return cur.map((n) => (n.selected ? { ...n, selected: false } : n));
      });
      // Reset edge styles (remove highlighting)
      setEdges((cur) =>
        cur.map((e) => {
          if (!e.style || Object.keys(e.style).length === 0) return e;
          return { ...e, style: {} };
        })
      );
      return;
    }

    // Resolve all node IDs (including virtual) that map to the active move
    const activeNodeIds = new Set<string>();
    activeNodeIds.add(activeId);
    for (const [virtualId, realId] of virtualToRealIdMap.entries()) {
      if (realId === activeId) activeNodeIds.add(virtualId);
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

    // Highlight edges: blue incoming, orange outgoing, dim unrelated
    // Skip if an edge is directly selected (keep its existing red-pink style)
    setNodes((curNodes) => {
      // Read current node positions to determine edge direction in focus mode
      const nodePositions = new Map(curNodes.map((n) => [n.id, n.position]));
      const centerPos = activeId ? nodePositions.get(activeId) : undefined;

      setEdges((cur) =>
        cur.map((e) => {
          if (e.id === selectedEdgeId) return e;

          if (layout === "focus" && centerPos) {
            const sourcePos = nodePositions.get(e.source);
            const targetPos = nodePositions.get(e.target);

            if (sourcePos && targetPos) {
              const edgeMidX = (sourcePos.x + targetPos.x) / 2;
              if (edgeMidX >= centerPos.x) {
                return { ...e, style: { stroke: "#FF8C42", strokeWidth: 2.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#FF8C42" } };
              } else {
                return { ...e, style: { stroke: "#4A9EFF", strokeWidth: 2.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#4A9EFF" } };
              }
            }
            return { ...e, style: { stroke: "#FF8C42", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#FF8C42" } };
          }

          const isOutgoing = activeNodeIds.has(e.source);
          const isIncoming = activeNodeIds.has(e.target);

          if (isOutgoing && isIncoming) {
            return { ...e, style: { stroke: "#FF8C42", strokeWidth: 2.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#FF8C42" } };
          } else if (isOutgoing) {
            return { ...e, style: { stroke: "#FF8C42", strokeWidth: 2.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#FF8C42" } };
          } else if (isIncoming) {
            return { ...e, style: { stroke: "#4A9EFF", strokeWidth: 2.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#4A9EFF" } };
          } else {
            return { ...e, style: { stroke: "#555", strokeWidth: 1, opacity: 0.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#555" } };
          }
        })
      );
      return curNodes; // Don't modify nodes
    });
  }, [layout, selectedMove?.id, focusedMoveId, setNodes, setEdges, virtualToRealIdMap, selectedEdgeId, activeTagId]);

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
          // In focus mode (including tag mode) clicking a node makes it the
          // focused/selected node. In tag mode the layout itself stays put;
          // when the tag chip is cleared, this focused node anchors the
          // regular Flow view.
          setFocusedMoveId(realMoveId);
          setSelectedMove(null);
        } else if (layout === "core") {
          // In Core view, clicking a node only highlights for edge coloring
          // The detail panel is only opened via the info "i" button
          setCoreShowDetail(false);
          setSelectedMove((prev) => prev?.id === move.id ? null : move);
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
    (newLayout: "dagre" | "force" | "elk" | "custom" | "ring" | "core") => {
      // When leaving focus mode, transfer focused node to selectedMove
      if (layout === "focus" && focusedMoveId) {
        const move = moves.find((m) => m.id === focusedMoveId);
        if (move) setSelectedMove(move);
      }
      setCoreExploreId(null); // Clear core explore when switching layouts
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

  // Handle pane click (background) - deselect everything
  const onPaneClick = useCallback(() => {
    setSelectedMove(null);
    setSelectedEdgeId(null);
    setAddConnectionMove(null);
    setCoreShowDetail(false);
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
          collection_id: id,
          source_move_id: sourceId,
          target_move_id: targetId,
        });
        setConnections((prev) => [...prev, res.data]);
      } catch (error) {
        console.error("Failed to create connection:", error);
      }
    },
    [connections, virtualToRealIdMap, id]
  );

  // Handle add connection from panel (with direction support)
  const handleAddConnection = useCallback(
    async (targetMoveId: string, direction: "to" | "from", label: string | null) => {
      if (!addConnectionMove) return;

      const payload =
        direction === "to"
          ? {
              collection_id: id,
              source_move_id: addConnectionMove.id,
              target_move_id: targetMoveId,
              label,
            }
          : {
              collection_id: id,
              source_move_id: targetMoveId,
              target_move_id: addConnectionMove.id,
              label,
            };

      const res = await client.post("/connections", payload);
      setConnections((prev) => [...prev, res.data]);
    },
    [addConnectionMove, id]
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
      const { collection: col, moves: graphMoves, connections: graphConnections, tags: graphTags, media_tags: graphMediaTags } = res.data;
      setCollection(col);
      setMoves(graphMoves);
      setConnections(graphConnections);
      setTags(graphTags || []);
      setMediaTags(graphMediaTags || []);
      // Also update allMoves so the new move can be selected in the panel
      const newMove = graphMoves.find((m: Move) => m.id === moveId);
      if (newMove) {
        setAllMoves((prev) => {
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
      setAllMoves((prev) => prev.filter((m) => m.id !== moveId));
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
      prev.map((m) => (m.id === updatedMove.id ? { ...m, ...updatedMove } : m))
    );
    setAllMoves((prev) =>
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

  if (loadError) {
    return (
      <div className="error-page">
        <div className="error-emoji">🫠</div>
        <h2>Oops</h2>
        <p>{loadError}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Try Again
        </button>
      </div>
    );
  }

  if (!collection) {
    return <div className="empty-state">Collection not found</div>;
  }

  const showPanel = selectedMove || addConnectionMove || editingMove || selectedConnection || panelClosing;

  const toolbar = (
    <>
      {mode === "graph" && (
        <select
          className="layout-dropdown"
          value={layout === "focus" ? "dagre" : layout}
          onChange={(e) => {
            const newLayout = e.target.value as "dagre" | "custom" | "force" | "elk" | "ring" | "core";
            if (newLayout === "core") {
              setCoreExploreId(null);
              switchToLayout("core");
            } else {
              switchToLayout(newLayout);
            }
          }}
        >
          <option value="core">Core</option>
          <option value="custom">Custom</option>
          <option value="ring">Ring</option>
          <option value="dagre">Dagre</option>
          <option value="force">Force</option>
          <option value="elk">ELK</option>
        </select>
      )}

      {/* Graph move/tag search */}
        <div className="graph-search" ref={graphSearchRef}>
          <input
            type="text"
            placeholder={mode === "flow" ? "Search moves and tags..." : "Search moves..."}
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
              {combinedItemCount === 0 ? (
                <div className="option disabled">
                  {mode === "flow" ? "No moves or tags found" : "No moves found"}
                </div>
              ) : (
                <>
                  {visibleTagResults.length > 0 && (
                    <>
                      <div className="option-section-header">Tags</div>
                      {visibleTagResults.map((tag, idx) => (
                        <div
                          key={`tag-${tag.id}`}
                          className={`option option-tag ${idx === graphSearchIndex ? "highlighted" : ""}`}
                          onClick={() => handleTagSearchSelect(tag)}
                        >
                          <span className="option-tag-marker">#</span>
                          {/* Wrap in one span so the flex gap doesn't fall
                              between the highlightTerms text segments. */}
                          <span className="option-tag-name">{highlightTerms(tag.name, graphSearch)}</span>
                        </div>
                      ))}
                    </>
                  )}
                  {visibleGraphResults.length > 0 && (
                    <>
                      {visibleTagResults.length > 0 && (
                        <div className="option-section-header">Moves</div>
                      )}
                      {visibleGraphResults.map((move, idx) => {
                        const combinedIdx = visibleTagResults.length + idx;
                        return (
                          <div
                            key={move.id}
                            className={`option ${combinedIdx === graphSearchIndex ? "highlighted" : ""}`}
                            onClick={() => handleGraphSearchSelect(move)}
                          >
                            {highlightTerms(move.name, graphSearch)}
                          </div>
                        );
                      })}
                    </>
                  )}
                </>
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

        <button
          className={`btn-icon filter-toggle ${filterPanelOpen ? "active" : ""} ${isFilterActive ? "filter-active" : ""}`}
          onClick={() => setFilterPanelOpen(!filterPanelOpen)}
          title="Collection Filter"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="1,1 19,1 12,10 12,16 8,18 8,10" />
          </svg>
        </button>

        <button
          className={`btn-icon adv-search-toggle ${advancedSearchOpen ? "active" : ""}`}
          onClick={() => setAdvancedSearchOpen(!advancedSearchOpen)}
          title="Advanced Search"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="6" />
            <line x1="13" y1="13" x2="18" y2="18" />
            <line x1="5" y1="8" x2="11" y2="8" />
            <line x1="8" y1="5" x2="8" y2="11" />
          </svg>
        </button>

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
                onClick={() => setFocusLevel(Math.max(0, focusLevel - 1))}
                disabled={focusLevel <= 0}
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
            <label className="preview-toggle">
              <input
                type="checkbox"
                checked={showPreview}
                onChange={(e) => setShowPreview(e.target.checked)}
              />
              Preview
            </label>
          </div>
        )}

        {/* Disconnected subgraphs warning badge */}
        {graphAnalysis.componentCount > 1 && !isFilterActive && (
          <button
            className={`disconnected-warning ${showComponentColors ? "active" : ""}`}
            onClick={() => setShowComponentColors(!showComponentColors)}
            title="Click to highlight disconnected groups"
          >
            ⚠️ {graphAnalysis.componentCount} disconnected groups
          </button>
        )}

        <span className="node-count">
          {isFilterActive ? (
            <span className="filter-count">{filteredMoves.length} of {moves.length}</span>
          ) : (
            moves.length
          )}{" "}
          moves
        </span>
    </>
  );

  return (
    <div className="graph-page">
      <CollectionTabBar
        collectionId={id!}
        collectionName={collection.name}
        active={mode}
        toolbar={toolbar}
      />
      <div className="graph-container">
        {/* Active tag chip (Flow mode only) */}
        {mode === "flow" && activeTag && (
          <div className="tag-chip">
            <span className="tag-chip-name">{activeTag.name}</span>
            <button
              className="tag-chip-close"
              onClick={handleClearTag}
              aria-label={`Clear tag ${activeTag.name}`}
              title="Clear tag filter"
            >
              ×
            </button>
          </div>
        )}
        {/* Empty state warnings */}
        {moves.length === 0 && (
          <div className="graph-empty-state">
            Add moves to this collection to use the graph view.
          </div>
        )}
        {layout === "core" && moves.length > 0 && !moves.some((m) => m.is_core) && (
          <div className="graph-empty-state">
            No Core moves in this collection. Mark moves as Core in the Edit Move panel to use the Core graph view.
          </div>
        )}
        {layout === "core" && coreExploreId && (
          <button
            className="core-back-btn"
            onClick={() => setCoreExploreId(null)}
            title="Back to all Core moves"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="11,3 5,9 11,15" />
            </svg>
          </button>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
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
            {selectedMove && !addConnectionMove && !editingMove && (layout !== "core" || coreShowDetail) && (
              <MoveDetailPanel
                move={selectedMove}
                collectionId={id!}
                onClose={handlePanelClose}
                onAddConnection={() => {
                  setAddConnectionMove(selectedMove);
                  setSelectedMove(null);
                }}
                onEditMove={handleEditMoveClick}
                onDeleteMove={() => {
                  if (selectedMove) {
                    setDeleteConfirmMove(selectedMove);
                    client.get(`/moves/${selectedMove.id}/usage`).then((res) =>
                      setDeleteSequenceWarnings(res.data.sequence_names || [])
                    ).catch(() => setDeleteSequenceWarnings([]));
                  }
                }}
                onTagClick={handleTagClickFromPanel}
                closing={panelClosing}
              />
            )}
            {addConnectionMove && (
              <AddConnectionPanel
                sourceMove={addConnectionMove}
                allMoves={allMoves}
                collectionMoveIds={collectionMoveIds}
                existingConnections={connections}
                collectionId={id!}
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
                collectionId={id!}
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

        {/* Advanced Search Panel */}
        {advancedSearchOpen && (
          <AdvancedSearchPanel
            moves={filteredMoves}
            onSelectMove={(move) => {
              setAdvancedSearchOpen(false);
              if (layout === "focus") {
                setFocusedMoveId(move.id);
              } else {
                setSelectedMove(move);
                // Pan to the selected node
                const node = nodes.find(
                  (n) => n.id === move.id || virtualToRealIdMap.get(n.id) === move.id
                );
                if (node && node.position && reactFlowInstance.current) {
                  reactFlowInstance.current.setCenter(
                    node.position.x + 80,
                    node.position.y + 20,
                    { zoom: 1.2, duration: 300 }
                  );
                }
              }
            }}
            onClose={() => setAdvancedSearchOpen(false)}
          />
        )}

        {/* Collection Filter Panel */}
        {filterPanelOpen && (
          <FilterPanel
            moves={moves}
            collectionId={id!}
            collectionTags={tags}
            activeFilter={activeFilter}
            activeFilterId={activeFilterId}
            activeFilterName={activeFilterName}
            onFilterChange={setActiveFilter}
            onFilterIdChange={(fid, fname) => {
              setActiveFilterId(fid);
              setActiveFilterName(fname);
            }}
            onClose={() => setFilterPanelOpen(false)}
          />
        )}

        {/* Delete Move Confirmation Modal */}
        {deleteConfirmMove && (
          <ConfirmModal
            title="Delete Move"
            message={
              <>
                <p>Delete "{deleteConfirmMove.name}" and all its connections? This cannot be undone.</p>
                {deleteSequenceWarnings.length > 0 && (
                  <div className="modal-warning">
                    <strong>This move is used in {deleteSequenceWarnings.length} sequence{deleteSequenceWarnings.length > 1 ? "s" : ""}:</strong>
                    <ul>{deleteSequenceWarnings.map((name, i) => <li key={i}>{name}</li>)}</ul>
                    <p>Deleting will remove it from these sequences.</p>
                  </div>
                )}
              </>
            }
            confirmLabel="Delete"
            cancelLabel="Cancel"
            confirmVariant="danger"
            onConfirm={() => handleDeleteMoveConfirm(deleteConfirmMove.id)}
            onCancel={() => { setDeleteConfirmMove(null); setDeleteSequenceWarnings([]); }}
          />
        )}
      </div>
    </div>
  );
}
