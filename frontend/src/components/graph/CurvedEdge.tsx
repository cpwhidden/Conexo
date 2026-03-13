import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

/**
 * Bezier curved edge with variable curvature based on edge index.
 * Each edge gets a unique curve to minimize overlap.
 */
export default function CurvedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps) {
  // Get curve factor from edge data (set during edge creation)
  // This varies the curvature for each edge
  const curveFactor = (data?.curveFactor as number) || 0;

  // Calculate base curvature (distance-based)
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Base curvature proportional to distance, modified by curveFactor
  // curveFactor ranges from -1 to 1, affecting curve direction and magnitude
  // Increased multipliers for more visible curve variation
  const baseCurvature = Math.min(distance * 0.5, 150);
  const curvature = baseCurvature * (1 + curveFactor * 0.8);

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={style}
      markerEnd={markerEnd}
    />
  );
}
