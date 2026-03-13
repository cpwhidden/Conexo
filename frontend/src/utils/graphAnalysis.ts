import type { Node, Edge } from "@xyflow/react";

export interface NodeConnectionStatus {
  hasIncoming: boolean;
  hasOutgoing: boolean;
}

export interface GraphAnalysis {
  componentCount: number;
  nodeToComponent: Map<string, string>; // nodeId -> componentId (root)
  nodeComponentIndex: Map<string, number>; // nodeId -> 0,1,2... (for color assignment)
  connectionStatus: Map<string, NodeConnectionStatus>;
  entryPoints: string[]; // in-degree = 0
  deadEnds: string[]; // out-degree = 0
  isolatedNodes: string[]; // no connections at all
}

/**
 * Analyze graph structure using Union-Find for connected components
 * and degree tracking for entry/dead-end identification.
 *
 * Time: O(n + e) where n = nodes, e = edges
 * Space: O(n)
 */
export function analyzeGraph(nodes: Node[], edges: Edge[]): GraphAnalysis {
  // Early return for empty graph
  if (nodes.length === 0) {
    return {
      componentCount: 0,
      nodeToComponent: new Map(),
      nodeComponentIndex: new Map(),
      connectionStatus: new Map(),
      entryPoints: [],
      deadEnds: [],
      isolatedNodes: [],
    };
  }

  // ===== Union-Find Data Structures =====
  const parent = new Map<string, string>();
  const rank = new Map<string, number>();

  // Initialize each node as its own parent
  nodes.forEach((node) => {
    parent.set(node.id, node.id);
    rank.set(node.id, 0);
  });

  // Find with path compression
  function find(x: string): string {
    if (parent.get(x) !== x) {
      parent.set(x, find(parent.get(x)!));
    }
    return parent.get(x)!;
  }

  // Union by rank
  function union(x: string, y: string): void {
    const rootX = find(x);
    const rootY = find(y);

    if (rootX === rootY) return;

    const rankX = rank.get(rootX) || 0;
    const rankY = rank.get(rootY) || 0;

    if (rankX < rankY) {
      parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      parent.set(rootY, rootX);
    } else {
      parent.set(rootY, rootX);
      rank.set(rootX, rankX + 1);
    }
  }

  // ===== Degree Tracking =====
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();

  // Initialize degrees to 0
  nodes.forEach((node) => {
    inDegree.set(node.id, 0);
    outDegree.set(node.id, 0);
  });

  // Process edges: union connected nodes and track degrees
  edges.forEach((edge) => {
    // Union for connectivity (treat as undirected for component detection)
    if (parent.has(edge.source) && parent.has(edge.target)) {
      union(edge.source, edge.target);
    }

    // Track directed degrees
    const currentOut = outDegree.get(edge.source) || 0;
    outDegree.set(edge.source, currentOut + 1);

    const currentIn = inDegree.get(edge.target) || 0;
    inDegree.set(edge.target, currentIn + 1);
  });

  // ===== Build Component Mapping =====
  const nodeToComponent = new Map<string, string>();
  const componentNodes = new Map<string, string[]>();

  nodes.forEach((node) => {
    const root = find(node.id);
    nodeToComponent.set(node.id, root);

    if (!componentNodes.has(root)) {
      componentNodes.set(root, []);
    }
    componentNodes.get(root)!.push(node.id);
  });

  // Assign stable indices to components (sorted by first node id for consistency)
  const componentRoots = Array.from(componentNodes.keys()).sort();
  const componentIndexMap = new Map<string, number>();
  componentRoots.forEach((root, index) => {
    componentIndexMap.set(root, index);
  });

  // Map each node to its component index
  const nodeComponentIndex = new Map<string, number>();
  nodes.forEach((node) => {
    const root = nodeToComponent.get(node.id)!;
    const index = componentIndexMap.get(root) || 0;
    nodeComponentIndex.set(node.id, index);
  });

  // ===== Build Connection Status =====
  const connectionStatus = new Map<string, NodeConnectionStatus>();
  const entryPoints: string[] = [];
  const deadEnds: string[] = [];
  const isolatedNodes: string[] = [];

  nodes.forEach((node) => {
    const hasIn = (inDegree.get(node.id) || 0) > 0;
    const hasOut = (outDegree.get(node.id) || 0) > 0;

    connectionStatus.set(node.id, {
      hasIncoming: hasIn,
      hasOutgoing: hasOut,
    });

    if (!hasIn && !hasOut) {
      isolatedNodes.push(node.id);
    } else if (!hasIn) {
      entryPoints.push(node.id);
    } else if (!hasOut) {
      deadEnds.push(node.id);
    }
  });

  return {
    componentCount: componentNodes.size,
    nodeToComponent,
    nodeComponentIndex,
    connectionStatus,
    entryPoints,
    deadEnds,
    isolatedNodes,
  };
}
