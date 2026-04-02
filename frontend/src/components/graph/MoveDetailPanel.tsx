import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Collection, Move, Tag } from "../../types";
import client from "../../api/client";
import { useDropdownKeyNav } from "../../hooks/useDropdownKeyNav";

interface MoveDetailPanelProps {
  move: Move;
  collectionId: string;
  onClose: () => void;
  onAddConnection: () => void;
  onEditMove: () => void;
  onDeleteMove?: () => void;
  closing?: boolean;
}

export default function MoveDetailPanel({
  move,
  collectionId,
  onClose,
  onAddConnection,
  onEditMove,
  onDeleteMove,
  closing,
}: MoveDetailPanelProps) {
  // Collection membership state
  const [moveCollections, setMoveCollections] = useState<Collection[]>([]);

  // Tag state (collection-scoped)
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [moveTags, setMoveTags] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Load tags for this move and available tags for the collection
  useEffect(() => {
    client.get(`/collections/${collectionId}/moves/${move.id}/tags`).then((res) => setMoveTags(res.data));
    client.get(`/collections/${collectionId}/tags`).then((res) => setAllTags(res.data));
    client.get(`/collections/by-move/${move.id}`).then((res) => setMoveCollections(res.data));
  }, [move.id, collectionId]);

  const availableTags = allTags.filter(
    (t) => !moveTags.some((mt) => mt.id === t.id)
  );

  const filteredSuggestions = availableTags.filter((t) =>
    t.name.toLowerCase().includes(tagInput.toLowerCase())
  );

  const exactMatch = availableTags.find(
    (t) => t.name.toLowerCase() === tagInput.toLowerCase()
  );

  const handleAddExistingTag = useCallback(
    async (tag: Tag) => {
      await client.post(`/collections/${collectionId}/tags/${tag.id}/moves`, { move_id: move.id });
      setMoveTags((prev) => [...prev, tag]);
      setTagInput("");
      setShowSuggestions(false);
    },
    [move.id, collectionId]
  );

  const handleCreateTag = useCallback(async () => {
    if (!tagInput.trim()) return;
    try {
      const createRes = await client.post(`/collections/${collectionId}/tags`, {
        name: tagInput.trim(),
      });
      const newTag = createRes.data;
      await client.post(`/collections/${collectionId}/tags/${newTag.id}/moves`, { move_id: move.id });
      setAllTags((prev) => [...prev, newTag]);
      setMoveTags((prev) => [...prev, newTag]);
      setTagInput("");
      setShowSuggestions(false);
    } catch (err) {
      console.error("Failed to create tag:", err);
    }
  }, [tagInput, collectionId, move.id]);

  // Tag suggestions keyboard navigation
  const tagItemCount =
    filteredSuggestions.length +
    (!exactMatch && tagInput.trim() ? 1 : 0);
  const handleTagSelect = useCallback(
    (index: number) => {
      if (index < filteredSuggestions.length) {
        handleAddExistingTag(filteredSuggestions[index]);
      } else {
        handleCreateTag();
      }
    },
    [filteredSuggestions, tagInput, handleAddExistingTag, handleCreateTag]
  );
  const { highlightedIndex: tagHighlight, handleKeyDown: handleTagNavKeyDown } =
    useDropdownKeyNav({
      itemCount: tagItemCount,
      onSelect: handleTagSelect,
      onEscape: () => {
        setShowSuggestions(false);
        setTagInput("");
      },
      enabled: showSuggestions && !!tagInput,
    });

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    handleTagNavKeyDown(e);
    if (e.defaultPrevented) return;
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (exactMatch) {
        handleAddExistingTag(exactMatch);
      } else if (filteredSuggestions.length === 1) {
        handleAddExistingTag(filteredSuggestions[0]);
      } else {
        handleCreateTag();
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setTagInput("");
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    await client.delete(`/collections/${collectionId}/tags/${tagId}/moves/${move.id}`);
    setMoveTags((prev) => prev.filter((t) => t.id !== tagId));
  };

  return (
    <div className={`slide-panel ${closing ? "closing" : ""}`}>
      <div className="slide-panel-header">
        <h3>{move.name}</h3>
        <button className="btn-icon" onClick={onClose}>
          &times;
        </button>
      </div>
      <div className="slide-panel-content">
        <div className="panel-badges">
          {move.is_state && <span className="badge">State</span>}
        </div>

        {move.description && (
          <p className="panel-description">{move.description}</p>
        )}

        {/* Timing */}
        <div className="panel-section-title">Timing</div>
        <div className="panel-stats">
          <div className="panel-stat">
            <span className="panel-stat-label">Type</span>
            <span className="panel-stat-value">{move.is_state ? "State" : "Movement"}</span>
          </div>
          <div className="panel-stat">
            <span className="panel-stat-label">Starting Beat</span>
            <span className="panel-stat-value">{move.starting_beat ?? "—"}</span>
          </div>
          {!move.is_state && (
            <div className="panel-stat">
              <span className="panel-stat-label">Beats</span>
              <span className="panel-stat-value">{move.beat_count}</span>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="panel-section-title">Stats</div>
        <div className="panel-stats">
          <div className="panel-stat">
            <span className="panel-stat-label">Difficulty</span>
            <span className="panel-stat-value">{move.difficulty}/10</span>
          </div>
          <div className="panel-stat">
            <span className="panel-stat-label">Leadability</span>
            <span className="panel-stat-value">{move.leadability !== null ? `${move.leadability}/10` : "—"}</span>
          </div>
          <div className="panel-stat">
            <span className="panel-stat-label">Familiarity</span>
            <span className="panel-stat-value">{move.familiarity}/10</span>
          </div>
          <div className="panel-stat">
            <span className="panel-stat-label">Mental Avail.</span>
            <span className="panel-stat-value">{move.mental_availability !== null ? `${move.mental_availability}/10` : "—"}</span>
          </div>
          <div className="panel-stat">
            <span className="panel-stat-label">Learn Priority</span>
            <span className="panel-stat-value">{move.learning_priority !== null ? `${move.learning_priority}/10` : "—"}</span>
          </div>
        </div>

        {/* Energy */}
        <div className="panel-section-title">Energy</div>
        <div className="panel-stats">
          <div className="panel-stat">
            <span className="panel-stat-label">Impact</span>
            <span className="panel-stat-value">{move.impact !== null ? `${move.impact}/10` : "—"}</span>
          </div>
          <div className="panel-stat">
            <span className="panel-stat-label">Beat</span>
            <span className="panel-stat-value">{move.beat_energy !== null ? `${move.beat_energy}/10` : "—"}</span>
          </div>
          <div className="panel-stat">
            <span className="panel-stat-label">Moderna</span>
            <span className="panel-stat-value">{move.moderna_energy !== null ? `${move.moderna_energy}/10` : "—"}</span>
          </div>
          <div className="panel-stat">
            <span className="panel-stat-label">Sensual</span>
            <span className="panel-stat-value">{move.sensual_energy !== null ? `${move.sensual_energy}/10` : "—"}</span>
          </div>
        </div>

        {/* Key move flags */}
        {(move.key_egress || move.key_ingress) && (
          <div className="panel-badges" style={{ marginTop: "0.75rem" }}>
            {move.key_egress && <span className="badge badge-accent">Key Egress</span>}
            {move.key_ingress && <span className="badge badge-accent">Key Ingress</span>}
          </div>
        )}

        {/* Tags (collection-scoped) */}
        <div className="move-themes-section">
          <div className="panel-section-title">Tags</div>
          <div className="themes-tag-container">
            {moveTags.map((tag) => (
              <span key={tag.id} className="theme-tag">
                {tag.name}
                <button
                  className="theme-tag-remove"
                  onClick={() => handleRemoveTag(tag.id)}
                  title="Remove tag"
                >
                  &times;
                </button>
              </span>
            ))}
            <div className="theme-input-wrapper">
              <input
                ref={tagInputRef}
                type="text"
                className="theme-input"
                placeholder="Add tag..."
                value={tagInput}
                onChange={(e) => {
                  setTagInput(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => {
                  setTimeout(() => setShowSuggestions(false), 200);
                }}
                onKeyDown={handleInputKeyDown}
              />
              {showSuggestions && tagInput && (
                <div className="theme-suggestions">
                  {filteredSuggestions.map((tag, idx) => (
                    <div
                      key={tag.id}
                      className={`theme-suggestion ${idx === tagHighlight ? "highlighted" : ""}`}
                      onMouseDown={() => handleAddExistingTag(tag)}
                    >
                      {tag.name}
                    </div>
                  ))}
                  {!exactMatch && tagInput.trim() && (
                    <div
                      className={`theme-suggestion theme-suggestion-new ${filteredSuggestions.length === tagHighlight ? "highlighted" : ""}`}
                      onMouseDown={() => handleCreateTag()}
                    >
                      Create "{tagInput.trim()}"
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Collections */}
        {moveCollections.length > 0 && (
          <div className="form-section">
            <div className="panel-section-title">Collections</div>
            <div className="themes-tag-container">
              {moveCollections.map((col) => (
                <Link key={col.id} to={`/collections/${col.id}/graph?layout=focus&node=${move.id}`} className="theme-tag" style={{ textDecoration: "none" }}>
                  {col.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="slide-panel-actions">
          <button className="btn btn-primary" onClick={onAddConnection}>
            Add Connection
          </button>
          <button className="btn btn-secondary" onClick={onEditMove}>
            Edit Move
          </button>
          <Link to={`/moves/${move.id}`} className="btn btn-secondary">
            View Details
          </Link>
          {onDeleteMove && (
            <button className="btn btn-danger" onClick={onDeleteMove}>
              Delete Move
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
