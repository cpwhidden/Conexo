import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

interface MoveNodeData {
  move: {
    id: string;
    name: string;
    is_state: boolean;
    starting_beat: number;
    beat_count: number;
  };
  hasStoredPosition: boolean;
  onAddConnection?: (move: MoveNodeData["move"]) => void;
  focusPosition?: "left" | "center" | "right" | null;
  onInfoClick?: (move: MoveNodeData["move"]) => void;
  // Graph analysis data
  connectionStatus?: {
    hasIncoming: boolean;
    hasOutgoing: boolean;
  };
  componentIndex?: number;
  showComponentColors?: boolean;
}

function MoveNode({ data, selected }: NodeProps) {
  const [hovered, setHovered] = useState(false);
  const nodeData = data as unknown as MoveNodeData;
  const { move, focusPosition, onInfoClick, connectionStatus, componentIndex, showComponentColors } = nodeData;

  // Show info icon on outer edge in focus mode (always visible, not just on hover)
  const showInfoIcon = focusPosition && onInfoClick;
  const infoIconSide = focusPosition === "left" ? "left" : "right";

  // Build connection status CSS classes
  const connectionClasses: string[] = [];
  if (connectionStatus) {
    const { hasIncoming, hasOutgoing } = connectionStatus;
    if (!hasIncoming && !hasOutgoing) {
      connectionClasses.push("isolated");
    } else {
      if (!hasIncoming) connectionClasses.push("entry-point");
      if (!hasOutgoing) connectionClasses.push("dead-end");
    }
  }

  // Build component color class (only when showComponentColors is active)
  if (showComponentColors && componentIndex !== undefined) {
    connectionClasses.push(`component-${componentIndex % 5}`);
  }

  // Compute timing label
  const timingLabel = move.is_state
    ? `${move.starting_beat}`
    : `${move.starting_beat}-${move.starting_beat + move.beat_count - 1}`;

  return (
    <div
      className={`graph-node ${selected ? "selected" : ""} ${move.is_state ? "state-node" : ""} ${focusPosition ? `focus-${focusPosition}` : ""} ${connectionClasses.join(" ")}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Target handles (incoming connections) on all 4 sides */}
      <Handle type="target" position={Position.Top} id="target-top" />
      <Handle type="target" position={Position.Right} id="target-right" />
      <Handle type="target" position={Position.Bottom} id="target-bottom" />
      <Handle type="target" position={Position.Left} id="target-left" />

      {/* Info icon for Focus mode - on outer edge */}
      {showInfoIcon && infoIconSide === "left" && (
        <button
          className="graph-node-info-btn info-left"
          title="View move details"
          onClick={(e) => {
            e.stopPropagation();
            onInfoClick?.(move);
          }}
        >
          ℹ
        </button>
      )}

      <div className="graph-node-content">
        <div className="graph-node-name">{move.name}</div>
        <span className="graph-node-timing">{timingLabel}</span>
      </div>

      {/* Add connection button (non-focus mode, or center node in focus mode) */}
      {hovered && nodeData.onAddConnection && (!focusPosition || focusPosition === "center") && (
        <button
          className="graph-node-add-btn"
          title="Add connection"
          onClick={(e) => {
            e.stopPropagation();
            nodeData.onAddConnection?.(move);
          }}
        >
          +
        </button>
      )}

      {/* Info icon for Focus mode - on outer edge (right side) */}
      {showInfoIcon && infoIconSide === "right" && (
        <button
          className="graph-node-info-btn info-right"
          title="View move details"
          onClick={(e) => {
            e.stopPropagation();
            onInfoClick?.(move);
          }}
        >
          ℹ
        </button>
      )}

      {/* Source handles (outgoing connections) on all 4 sides */}
      <Handle type="source" position={Position.Top} id="source-top" />
      <Handle type="source" position={Position.Right} id="source-right" />
      <Handle type="source" position={Position.Bottom} id="source-bottom" />
      <Handle type="source" position={Position.Left} id="source-left" />
    </div>
  );
}

export default memo(MoveNode);
