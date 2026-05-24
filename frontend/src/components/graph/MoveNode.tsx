import { memo, useEffect, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import client from "../../api/client";

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

interface MoveNodeData {
  move: {
    id: string;
    name: string;
    is_state: boolean;
    starting_beat: number;
    beat_count: number;
    cover_media_id?: string | null;
  };
  hasStoredPosition: boolean;
  onAddConnection?: (move: MoveNodeData["move"]) => void;
  onExplore?: (move: MoveNodeData["move"]) => void;
  focusPosition?: "left" | "center" | "right" | null;
  isColumnFirst?: boolean;
  onInfoClick?: (move: MoveNodeData["move"]) => void;
  showPreview?: boolean;
  // Graph analysis data
  connectionStatus?: {
    hasIncoming: boolean;
    hasOutgoing: boolean;
  };
  componentIndex?: number;
  showComponentColors?: boolean;
  tagged?: boolean;
  // When a tag is active, the media item to preview instead of the cover.
  previewMediaId?: string;
}

function MoveNode({ data, selected }: NodeProps) {
  const [hovered, setHovered] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const nodeData = data as unknown as MoveNodeData;
  const { move, focusPosition, isColumnFirst, onInfoClick, connectionStatus, componentIndex, showComponentColors, showPreview, tagged, previewMediaId } = nodeData;

  // Fetch media URL for preview. When a tag is active and this move has a media
  // item marked with it, prefer that media; otherwise fall back to the cover.
  // Show on the center node OR on the first move in any column.
  const effectiveMediaId = previewMediaId ?? move.cover_media_id;
  const shouldShowPreview = showPreview && (focusPosition === "center" || isColumnFirst) && effectiveMediaId;
  useEffect(() => {
    if (!shouldShowPreview) {
      setPreviewUrl(null);
      setPreviewType(null);
      return;
    }
    client.get(`/media/${effectiveMediaId}/url`).then((res) => {
      let url = res.data.url as string;
      if (url.startsWith("/")) {
        const token = localStorage.getItem("access_token");
        url = `${API_BASE_URL}${url}${url.includes("?") ? "&" : "?"}token=${token}`;
      }
      setPreviewUrl(url);
      setPreviewType(res.data.content_type || null);
    }).catch(() => { setPreviewUrl(null); setPreviewType(null); });
  }, [shouldShowPreview, effectiveMediaId]);

  // Show info icon on outer edge in focus mode (always visible, not just on hover)
  const showFocusInfoIcon = focusPosition && onInfoClick;
  const infoIconSide = focusPosition === "left" ? "left" : "right";

  // Show info icon in Core view (on hover, right side)
  const showCoreInfoIcon = hovered && nodeData.onExplore && onInfoClick;

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

  // Component coloring for disconnected subgraph visualization
  const componentStyle = showComponentColors && componentIndex !== undefined
    ? { borderColor: `hsl(${(componentIndex * 137) % 360}, 60%, 50%)` }
    : undefined;

  // Compute timing label based on is_state
  const timingLabel = move.is_state
    ? `${move.starting_beat}`
    : `${move.starting_beat}-${move.starting_beat + move.beat_count - 1}`;

  return (
    <div
      className={`graph-node ${move.is_state ? "state-node" : ""} ${selected ? "selected" : ""} ${
        focusPosition ? `focus-${focusPosition}` : ""
      } ${tagged ? "tagged" : ""} ${connectionClasses.join(" ")}`}
      style={componentStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {previewUrl && (
        <div className="graph-node-preview nodrag nopan">
          {previewType?.startsWith("video/") ? (
            <>
              <video
                muted={isMuted}
                playsInline
                loop
                preload="metadata"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onClick={(e) => {
                  e.stopPropagation();
                  const vid = e.currentTarget;
                  if (vid.paused) vid.play().catch(() => {}); else vid.pause();
                }}
              >
                {/* #t=0.1 seeks to 0.1s on load so the browser paints a real
                    frame as a poster instead of a blank/black box. */}
                <source src={`${previewUrl}#t=0.1`} type={previewType || "video/mp4"} />
              </video>
              {!isPlaying && (
                <button
                  className="preview-play-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    const vid = e.currentTarget.parentElement?.querySelector("video");
                    if (vid) vid.play().catch(() => {});
                  }}
                >
                  ▶
                </button>
              )}
              {isPlaying && (
                <button
                  className="preview-mute-btn"
                  title={isMuted ? "Unmute" : "Mute"}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMuted((m) => !m);
                  }}
                >
                  {isMuted ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 5L6 9H2v6h4l5 4V5z" />
                      <line x1="23" y1="9" x2="17" y2="15" />
                      <line x1="17" y1="9" x2="23" y2="15" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 5L6 9H2v6h4l5 4V5z" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    </svg>
                  )}
                </button>
              )}
            </>
          ) : (
            <img src={previewUrl} alt="" />
          )}
        </div>
      )}
      {/* Target handles (incoming connections) on all 4 sides */}
      <Handle type="target" position={Position.Top} id="target-top" />
      <Handle type="target" position={Position.Right} id="target-right" />
      <Handle type="target" position={Position.Bottom} id="target-bottom" />
      <Handle type="target" position={Position.Left} id="target-left" />

      <div className="graph-node-content">
        <div className="graph-node-name">{move.name}</div>
        <span className="graph-node-timing">{timingLabel}</span>
      </div>

      {/* Explore button — upper left (Core view) */}
      {hovered && nodeData.onExplore && (
        <button
          className="graph-node-explore-btn"
          title="Explore connections"
          onClick={(e) => {
            e.stopPropagation();
            nodeData.onExplore?.(move);
          }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="6.5" cy="6.5" r="5" />
            <line x1="10" y1="10" x2="14.5" y2="14.5" />
          </svg>
        </button>
      )}

      {/* Add connection button — upper right (non-focus, non-core views) */}
      {hovered && !nodeData.onExplore && nodeData.onAddConnection && (!focusPosition || focusPosition === "center") && (
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

      {/* Info icon — right side, Core view (on hover) */}
      {showCoreInfoIcon && (
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

      {/* Info icon for Focus mode — on outer edge (always visible) */}
      {showFocusInfoIcon && infoIconSide === "right" && (
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

      {/* Info icon for Focus mode — left side */}
      {showFocusInfoIcon && infoIconSide === "left" && (
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

      {/* Source handles (outgoing connections) on all 4 sides */}
      <Handle type="source" position={Position.Top} id="source-top" />
      <Handle type="source" position={Position.Right} id="source-right" />
      <Handle type="source" position={Position.Bottom} id="source-bottom" />
      <Handle type="source" position={Position.Left} id="source-left" />
    </div>
  );
}

export default memo(MoveNode);
