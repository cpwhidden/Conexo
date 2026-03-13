import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import ELK from "elkjs/lib/elk.bundled.js";
import type { Node, Edge } from "@xyflow/react";

const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;

// ============ D3-FORCE LAYOUT ============

interface SimNode extends SimulationNodeDatum {
  id: string;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
}

export function getD3ForceLayout(
  nodes: Node[],
  edges: Edge[],
  width = 800,
  height = 600
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  return new Promise((resolve) => {
    // Create simulation nodes with initial positions
    const simNodes: SimNode[] = nodes.map((node) => ({
      id: node.id,
      x: node.position.x || Math.random() * width,
      y: node.position.y || Math.random() * height,
    }));

    // Create simulation links
    const simLinks: SimLink[] = edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
    }));

    const simulation = forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(150)
      )
      .force("charge", forceManyBody().strength(-400))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide<SimNode>().radius(NODE_WIDTH / 2 + 20));

    // Run simulation to completion
    simulation.stop();
    for (let i = 0; i < 300; i++) {
      simulation.tick();
    }

    // Map positions back to nodes
    const layoutedNodes = nodes.map((node) => {
      const simNode = simNodes.find((n) => n.id === node.id);
      return {
        ...node,
        position: {
          x: simNode?.x ?? node.position.x,
          y: simNode?.y ?? node.position.y,
        },
      };
    });

    resolve({ nodes: layoutedNodes, edges });
  });
}

// ============ ELK LAYOUT ============

const elk = new ELK();

export type ELKAlgorithm = "layered" | "stress";

const ELK_OPTIONS: Record<ELKAlgorithm, Record<string, string>> = {
  layered: {
    "elk.algorithm": "layered",
    "elk.direction": "RIGHT",
    "elk.spacing.nodeNode": "60",
    "elk.layered.spacing.nodeNodeBetweenLayers": "100",
    "elk.layered.cycleBreaking.strategy": "GREEDY",
    "elk.edgeRouting": "SPLINES",
    "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  },
  stress: {
    "elk.algorithm": "stress",
    "elk.spacing.nodeNode": "80",
    "elk.stress.desiredEdgeLength": "150",
  },
};

export async function getELKLayout(
  nodes: Node[],
  edges: Edge[],
  algorithm: ELKAlgorithm = "layered"
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const graph = {
    id: "root",
    layoutOptions: ELK_OPTIONS[algorithm],
    children: nodes.map((node) => ({
      id: node.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const layoutedGraph = await elk.layout(graph);

  const layoutedNodes = nodes.map((node) => {
    const elkNode = layoutedGraph.children?.find((n) => n.id === node.id);
    return {
      ...node,
      position: {
        x: elkNode?.x ?? node.position.x,
        y: elkNode?.y ?? node.position.y,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}
