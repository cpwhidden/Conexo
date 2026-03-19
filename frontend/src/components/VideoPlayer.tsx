import { useCallback, useEffect, useRef, useState } from "react";
import client from "../api/client";
import type { Video } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8888";

interface VideoPlayerProps {
  video: Video;
  onDelete?: (videoId: string) => void;
  onRenamed?: (videoId: string, newFilename: string) => void;
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.substring(dot) : "";
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.substring(0, dot) : filename;
}

export default function VideoPlayer({ video, onDelete, onRenamed }: VideoPlayerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    client
      .get(`/videos/${video.id}/url`)
      .then((res) => {
        const videoUrl = res.data.url;
        if (videoUrl.startsWith("/")) {
          setUrl(`${API_BASE_URL}${videoUrl}`);
        } else {
          setUrl(videoUrl);
        }
      })
      .catch(() => setUrl(null));
  }, [video.id]);

  const startEditing = useCallback(() => {
    setEditValue(stripExtension(video.filename));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [video.filename]);

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

    const ext = getExtension(video.filename);
    const newFilename = trimmed + ext;

    if (newFilename === video.filename) {
      cancelEditing();
      return;
    }

    setSaving(true);
    try {
      await client.patch(`/videos/${video.id}`, { filename: newFilename });
      onRenamed?.(video.id, newFilename);
      setEditing(false);
    } catch {
      // Keep editing open on error
    } finally {
      setSaving(false);
    }
  }, [editValue, video.id, video.filename, onRenamed, cancelEditing]);

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
    await client.delete(`/videos/${video.id}`);
    onDelete?.(video.id);
  };

  return (
    <div className="video-player">
      {editing ? (
        <div className="video-filename-edit">
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={saveFilename}
            disabled={saving}
            className="video-filename-input"
          />
          <span className="video-filename-ext">{getExtension(video.filename)}</span>
        </div>
      ) : (
        <div className="video-filename-display">
          <p className="video-filename">{video.filename}</p>
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
      {url ? (
        <video controls width="100%">
          <source src={url} type={video.content_type} />
        </video>
      ) : (
        <p>Loading video...</p>
      )}
      {onDelete && (
        <button onClick={handleDelete} className="btn btn-danger btn-small">
          Delete
        </button>
      )}
    </div>
  );
}
