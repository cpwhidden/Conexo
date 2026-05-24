import { useCallback, useEffect, useRef, useState } from "react";
import client from "../api/client";
import type { Media, Tag } from "../types";
import { useDropdownKeyNav } from "../hooks/useDropdownKeyNav";

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

interface MediaPlayerProps {
  media: Media;
  moveId: string;
  isCover: boolean;
  onDelete?: (mediaId: string) => void;
  onRenamed?: (mediaId: string, newFilename: string) => void;
  onSetCover?: (mediaId: string) => void;
  // Tags that can be attached to this media (the move's collection tags). When
  // provided, the media tag UI is shown. onTagsChanged fires after any change
  // so sibling players can refresh (a tag re-assigns to a single media/move).
  availableTags?: Tag[];
  onTagsChanged?: () => void;
  // Bump to force this player to re-fetch its tags (e.g. after a re-assign on a
  // sibling media item of the same move).
  refreshToken?: number;
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
  availableTags,
  onTagsChanged,
  refreshToken,
}: MediaPlayerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Media tags
  const tagsEnabled = availableTags !== undefined;
  const [mediaTags, setMediaTags] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);

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

  useEffect(() => {
    if (!tagsEnabled) return;
    client
      .get(`/media/${media.id}/tags`)
      .then((res) => setMediaTags(res.data))
      .catch(() => setMediaTags([]));
  }, [media.id, tagsEnabled, refreshToken]);

  const tagSuggestions = (availableTags ?? []).filter(
    (t) =>
      !mediaTags.some((mt) => mt.id === t.id) &&
      t.name.toLowerCase().includes(tagInput.toLowerCase())
  );

  const handleAddTag = useCallback(
    async (tag: Tag) => {
      const res = await client.post(`/media/${media.id}/tags`, { tag_id: tag.id });
      setMediaTags(res.data);
      setTagInput("");
      setShowTagSuggestions(false);
      onTagsChanged?.();
    },
    [media.id, onTagsChanged]
  );

  const handleRemoveTag = useCallback(
    async (tagId: string) => {
      await client.delete(`/media/${media.id}/tags/${tagId}`);
      setMediaTags((prev) => prev.filter((t) => t.id !== tagId));
      onTagsChanged?.();
    },
    [media.id, onTagsChanged]
  );

  const { highlightedIndex: tagHighlight, handleKeyDown: handleTagNavKeyDown } =
    useDropdownKeyNav({
      itemCount: tagSuggestions.length,
      onSelect: (i) => handleAddTag(tagSuggestions[i]),
      onEscape: () => {
        setShowTagSuggestions(false);
        setTagInput("");
      },
      enabled: showTagSuggestions && tagSuggestions.length > 0,
    });

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
            <video controls width="100%" preload="metadata">
              {/* #t=0.1 forces the browser to paint a poster frame instead of black */}
              <source src={`${url}#t=0.1`} type={media.content_type} />
            </video>
          )
        ) : (
          <p>Loading media...</p>
        )}
      </div>
      {tagsEnabled && mediaTags.length > 0 && (
        <div className="media-tags-row">
          {mediaTags.map((tag) => (
            <span key={tag.id} className="theme-tag media-tag">
              {tag.name}
              <button
                className="theme-tag-remove"
                onClick={() => handleRemoveTag(tag.id)}
                title="Remove tag from media"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="media-player-actions">
        {tagsEnabled && (
          <div className="media-tag-search">
            <input
              type="text"
              className="media-tag-input"
              placeholder="Add tag…"
              value={tagInput}
              onChange={(e) => {
                setTagInput(e.target.value);
                setShowTagSuggestions(true);
              }}
              onFocus={() => setShowTagSuggestions(true)}
              onBlur={() => setTimeout(() => setShowTagSuggestions(false), 200)}
              onKeyDown={handleTagNavKeyDown}
            />
            {showTagSuggestions && tagInput && tagSuggestions.length > 0 && (
              <div className="media-tag-suggestions">
                {tagSuggestions.map((tag, idx) => (
                  <div
                    key={tag.id}
                    className={`media-tag-suggestion ${idx === tagHighlight ? "highlighted" : ""}`}
                    onMouseDown={() => handleAddTag(tag)}
                  >
                    {tag.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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
