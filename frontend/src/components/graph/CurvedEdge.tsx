import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

/**
 * Bezier curved edge with gentle, consistent curvature.
 * Uses a small fixed curvature so edges are mostly direct with a slight curve.
 */
export default function CurvedEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetPosition,
  targetX,
  targetY,
  style,
  markerEnd,
  data,
}: EdgeProps) {
  const curveFactor = (data?.curveFactor as number) || 0;

  // Gentle fixed curvature: slight curve regardless of distance
  // curveFactor varies from -1 to 1 for minor variation between parallel edges
  const curvature = 25 + curveFactor * 15;

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
