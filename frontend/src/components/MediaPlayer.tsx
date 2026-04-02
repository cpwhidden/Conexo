import { useCallback, useEffect, useRef, useState } from "react";
import client from "../api/client";
import type { Media } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8888";

interface MediaPlayerProps {
  media: Media;
  moveId: string;
  isCover: boolean;
  onDelete?: (mediaId: string) => void;
  onRenamed?: (mediaId: string, newFilename: string) => void;
  onSetCover?: (mediaId: string) => void;
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.substring(dot) : "";
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.substring(0, dot) : filename;
}

export default function MediaPlayer({
  media,
  moveId,
  isCover,
  onDelete,
  onRenamed,
  onSetCover,
}: MediaPlayerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    client
      .get(`/media/${media.id}/url`)
      .then((res) => {
        let mediaUrl = res.data.url;
        if (mediaUrl.startsWith("/")) {
          const token = localStorage.getItem("access_token");
          mediaUrl = `${API_BASE_URL}${mediaUrl}${mediaUrl.includes("?") ? "&" : "?"}token=${token}`;
        }
        setUrl(mediaUrl);
      })
      .catch(() => setUrl(null));
  }, [media.id]);

  const startEditing = useCallback(() => {
    setEditValue(stripExtension(media.filename));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [media.filename]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
    setEditValue("");
  }, []);

  const saveFilename = useCallback(async () => {
    const trimmed = editValue.trim();
    if (!trimmed) {
      cancelEditing();
      return;
    }

    const ext = getExtension(media.filename);
    const newFilename = trimmed + ext;

    if (newFilename === media.filename) {
      cancelEditing();
      return;
    }

    setSaving(true);
    try {
      await client.patch(`/media/${media.id}`, { filename: newFilename });
      onRenamed?.(media.id, newFilename);
      setEditing(false);
    } catch {
      // Keep editing open on error
    } finally {
      setSaving(false);
    }
  }, [editValue, media.id, media.filename, onRenamed, cancelEditing]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveFilename();
      } else if (e.key === "Escape") {
        cancelEditing();
      }
    },
    [saveFilename, cancelEditing]
  );

  const handleDelete = async () => {
    await client.delete(`/media/${media.id}`);
    onDelete?.(media.id);
  };

  const handleMakeCover = async () => {
    await client.patch(`/moves/${moveId}/cover-media/${media.id}`);
    onSetCover?.(media.id);
  };

  return (
    <div className="media-player">
      {editing ? (
        <div className="media-filename-edit">
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={saveFilename}
            disabled={saving}
            className="media-filename-input"
          />
          <span className="media-filename-ext">{getExtension(media.filename)}</span>
        </div>
      ) : (
        <div className="media-filename-display">
          <p className="media-filename">{media.filename}</p>
          {onRenamed && (
            <button
              className="btn-icon-small"
              onClick={startEditing}
              title="Rename"
            >
              ✎
            </button>
          )}
        </div>
      )}
      <div className="media-player-content">
        {isCover && <span className="media-cover-badge">Cover</span>}
        {url ? (
          media.content_type.startsWith("image/") ? (
            <img src={url} alt={media.filename} style={{ width: "100%", borderRadius: "6px" }} />
          ) : (
            <video controls width="100%">
              <source src={url} type={media.content_type} />
            </video>
          )
        ) : (
          <p>Loading media...</p>
        )}
      </div>
      <div className="media-player-actions">
        {!isCover && onSetCover && (
          <button onClick={handleMakeCover} className="btn btn-secondary btn-small">
            Make Cover
          </button>
        )}
        {onDelete && (
          <button onClick={handleDelete} className="btn btn-danger btn-small">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
