import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

/**
 * Animated bezier edge with variable curvature for selected connections.
 * Combines dash animation + pulsing arrow with curved path.
 */
export default function AnimatedCurvedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  data,
}: EdgeProps) {
  // Get curve factor from edge data
  const curveFactor = (data?.curveFactor as number) || 0;

  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const distance = Math.sqrt(dx * dx + dy * dy);

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

  const markerId = `pulsing-arrow-curved-${id}`;

  return (
    <>
      <defs>
        <marker
          id={markerId}
          markerWidth="12"
          markerHeight="12"
          refX="10"
          refY="6"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            d="M2,2 L10,6 L2,10 L4,6 Z"
            fill="#e94560"
          >
            <animateTransform
              attributeName="transform"
              type="scale"
              values="1;1.3;1"
              dur="0.8s"
              repeatCount="indefinite"
              additive="sum"
            />
          </path>
        </marker>
      </defs>

      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          stroke: "#e94560",
          strokeWidth: 2.5,
          strokeDasharray: 5,
          animation: "dashdraw 0.5s linear infinite",
        }}
        markerEnd={`url(#${markerId})`}
      />
    </>
  );
}
