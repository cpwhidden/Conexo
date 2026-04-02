import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

/**
 * Edge with gentle smooth-step routing.
 * Uses getSmoothStepPath with a small border radius for slight curves
 * instead of getBezierPath which creates wild arcs with distant nodes.
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
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 20,
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
