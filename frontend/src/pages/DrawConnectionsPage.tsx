import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  type Node,
  type Edge,
  type Connection as RFConnection,
  useNodesState,
  useEdgesState,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import client from "../api/client";
import type { MoveGraphData, Connection } from "../types";
import MoveNode from "../components/graph/MoveNode";

interface CollectionInfo {
  id: string;
  name: string;
  dance_style: string;
}

const nodeTypes = { moveNode: MoveNode };

// Smart handle selection based on relative node positions (same as CollectionGraphPage)
function getSmartHandles(
  sourceNode: Node | undefined,
  targetNode: Node | undefined
): { sourceHandle: string; targetHandle: string } {
  if (!sourceNode || !targetNode) {
    return { sourceHandle: "source-right", targetHandle: "target-left" };
  }
  const dx = targetNode.position.x - sourceNode.position.x;
  const dy = targetNode.position.y - sourceNode.position.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 0) {
      return { sourceHandle: "source-right", targetHandle: "target-left" };
    } else {
      return { sourceHandle: "source-left", targetHandle: "target-right" };
    }
  } else {
    if (dy > 0) {
      return { sourceHandle: "source-bottom", targetHandle: "target-top" };
    } else {
      return { sourceHandle: "source-top", targetHandle: "target-bottom" };
    }
  }
}

export default function DrawConnectionsPage() {
  const { id } = useParams();
  const [collection, setCollection] = useState<CollectionInfo | null>(null);
  const [allMoves, setAllMoves] = useState<MoveGraphData[]>([]);
  const [allConnections, setAllConnections] = useState<Connection[]>([]);
  const [nodeCount, setNodeCount] = useState(6);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [score, setScore] = useState({ correct: 0, incorrect: 0, remaining: 0 });
  const [generated, setGenerated] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; type: "correct" | "incorrect" } | null>(null);
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout>>();
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);

  // Load collection data
  useEffect(() => {
    if (!id) return;
    client.get(`/collections/${id}/graph-data`).then((res) => {
      setCollection(res.data.collection);
      setAllMoves(res.data.moves);
      setAllConnections(res.data.connections);
    });
  }, [id]);

  // Get the true connections between the selected nodes
  const trueConnections = useMemo(() => {
    const nodeIds = new Set(nodes.map((n) => n.id));
    return allConnections.filter(
      (c) => nodeIds.has(c.source_move_id) && nodeIds.has(c.target_move_id)
    );
  }, [nodes, allConnections]);

  const showFeedback = useCallback((text: string, type: "correct" | "incorrect") => {
    if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
    setFeedback({ text, type });
    feedbackTimeout.current = setTimeout(() => setFeedback(null), 1500);
  }, []);

  const generate = useCallback(() => {
    if (allMoves.length === 0) return;

    const count = Math.min(nodeCount, allMoves.length);

    // Pick a connected subgraph via BFS from a random seed
    const adjacency = new Map<string, Set<string>>();
    for (const c of allConnections) {
      if (!adjacency.has(c.source_move_id)) adjacency.set(c.source_move_id, new Set());
      if (!adjacency.has(c.target_move_id)) adjacency.set(c.target_move_id, new Set());
      adjacency.get(c.source_move_id)!.add(c.target_move_id);
      adjacency.get(c.target_move_id)!.add(c.source_move_id);
    }

    // Start BFS from a random move that has connections
    const connectedMoveIds = allMoves
      .filter((m) => adjacency.has(m.id) && adjacency.get(m.id)!.size > 0)
      .map((m) => m.id);

    if (connectedMoveIds.length === 0) return;

    const seedId = connectedMoveIds[Math.floor(Math.random() * connectedMoveIds.length)];
    const visited = new Set<string>([seedId]);
    const queue = [seedId];

    while (queue.length > 0 && visited.size < count) {
      const current = queue.shift()!;
      const neighbors = [...(adjacency.get(current) || [])].sort(() => Math.random() - 0.5);
      for (const neighbor of neighbors) {
        if (visited.size >= count) break;
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    const moveMap = new Map(allMoves.map((m) => [m.id, m]));
    const selected = [...visited].map((id) => moveMap.get(id)!).filter(Boolean);

    // Place nodes in a non-overlapping grid with generous spacing
    const cols = Math.ceil(Math.sqrt(count));
    const spacingX = 350;
    const spacingY = 150;

    const newNodes: Node[] = selected.map((move, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const jitterX = (Math.random() - 0.5) * 80;
      const jitterY = (Math.random() - 0.5) * 50;
      return {
        id: move.id,
        type: "moveNode",
        position: { x: col * spacingX + jitterX + 50, y: row * spacingY + jitterY + 50 },
        data: { move, hasStoredPosition: false },
      };
    });

    // Count true connections for these nodes
    const nodeIds = new Set(selected.map((m) => m.id));
    const trueCount = allConnections.filter(
      (c) => nodeIds.has(c.source_move_id) && nodeIds.has(c.target_move_id)
    ).length;

    setNodes(newNodes);
    setEdges([]);
    setScore({ correct: 0, incorrect: 0, remaining: trueCount });
    setGenerated(true);
    setFeedback(null);

    // Fit view after render
    setTimeout(() => reactFlowInstance.current?.fitView({ padding: 0.2 }), 100);
  }, [allMoves, allConnections, nodeCount, setNodes, setEdges]);

  const onConnect = useCallback(
    (connection: RFConnection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) return;

      // Check if this edge already exists
      const alreadyDrawn = edges.some(
        (e) => e.source === connection.source && e.target === connection.target
      );
      if (alreadyDrawn) return;

      // Check against true connections
      const isCorrect = trueConnections.some(
        (c) =>
          c.source_move_id === connection.source &&
          c.target_move_id === connection.target
      );

      if (isCorrect) {
        // Use smart handles based on node positions
        const sourceNode = nodes.find((n) => n.id === connection.source);
        const targetNode = nodes.find((n) => n.id === connection.target);
        const handles = getSmartHandles(sourceNode, targetNode);

        const newEdge: Edge = {
          id: `${connection.source}-${connection.target}`,
          source: connection.source,
          target: connection.target,
          sourceHandle: handles.sourceHandle,
          targetHandle: handles.targetHandle,
          style: { stroke: "#4ade80", strokeWidth: 2 },
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed, color: "#4ade80" },
        };
        setEdges((prev) => [...prev, newEdge]);
        setScore((s) => ({ ...s, correct: s.correct + 1, remaining: s.remaining - 1 }));
        showFeedback("Correct!", "correct");
      } else {
        setScore((s) => ({ ...s, incorrect: s.incorrect + 1 }));
        showFeedback("Incorrect", "incorrect");
      }
    },
    [edges, nodes, trueConnections, setEdges, showFeedback]
  );

  if (!collection) return <div className="loading">Loading...</div>;

  return (
    <div className="graph-page">
      <div className="graph-header">
        <Link to={`/collections/${id}/learn`} className="back-link">
          &larr; Learn
        </Link>

        <label className="draw-connections-setting">
          <span>Nodes</span>
          <input
            type="number"
            min={2}
            max={Math.min(allMoves.length, 30)}
            value={nodeCount}
            onChange={(e) => setNodeCount(parseInt(e.target.value) || 2)}
            className="draw-connections-input"
          />
        </label>

        <button className="btn btn-primary btn-sm" onClick={generate}>
          Generate
        </button>

        {generated && (
          <div className="draw-connections-score">
            <span className="score-correct">{score.correct} correct</span>
            <span className="score-incorrect">{score.incorrect} incorrect</span>
            <span className="score-remaining">{score.remaining} remaining</span>
          </div>
        )}
      </div>

      <div className="graph-container">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={(instance) => { reactFlowInstance.current = instance; }}
          nodeTypes={nodeTypes}
          nodesDraggable
          fitView
        >
          <Background color="#333" gap={20} />
          <Controls />
          <MiniMap
            nodeColor={() => "#e94560"}
            maskColor="rgba(18, 18, 24, 0.8)"
          />
        </ReactFlow>

        {feedback && (
          <div className={`draw-connections-feedback ${feedback.type}`}>
            {feedback.text}
          </div>
        )}

        {generated && score.remaining === 0 && (
          <div className="draw-connections-complete">
            All connections found! {score.incorrect === 0 ? "Perfect score!" : `${score.incorrect} mistake${score.incorrect > 1 ? "s" : ""}.`}
          </div>
        )}
      </div>
    </div>
  );
}
