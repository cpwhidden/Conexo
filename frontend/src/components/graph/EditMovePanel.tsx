import { useState, useEffect, useRef, useCallback } from "react";

import type { Move, MoveUpdate, Tag, Cue, Media } from "../../types";
import client from "../../api/client";
import CuesSection from "../CuesSection";
import MediaUpload from "../MediaUpload";
import MediaPlayer from "../MediaPlayer";
import { useDropdownKeyNav } from "../../hooks/useDropdownKeyNav";

interface EditMovePanelProps {
  move: Move;
  collectionId: string;
  onSave: (updatedMove: Move) => void;
  onClose: () => void;
  closing?: boolean;
}

export default function EditMovePanel({
  move,
  collectionId,
  onSave,
  onClose,
  closing,
}: EditMovePanelProps) {
  const [form, setForm] = useState<MoveUpdate>({
    name: move.name,
    description: move.description || "",
    beat_count: move.beat_count,
    difficulty: move.difficulty,
    familiarity: move.familiarity,
    starting_beat: move.starting_beat,
    is_state: move.is_state,
    key_egress: move.key_egress,
    key_ingress: move.key_ingress,
    is_core: move.is_core,
    leadability: move.leadability,
    mental_availability: move.mental_availability,
    beat_energy: move.beat_energy,
    moderna_energy: move.moderna_energy,
    sensual_energy: move.sensual_energy,
    impact: move.impact,
    learning_priority: move.learning_priority,
    leader_styling: move.leader_styling,
    follower_styling: move.follower_styling,
    date_learned: move.date_learned,
    learning_notes: move.learning_notes,
  });
  const [saving, setSaving] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);

  // Cues state
  const [cues, setCues] = useState<Cue[]>([]);

  // Media state
  const [mediaItems, setMediaItems] = useState<Media[]>([]);
  const [coverMediaId, setCoverMediaId] = useState<string | null>(move.cover_media_id ?? null);

  // Tag state (collection-scoped)
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [moveTags, setMoveTags] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl+Enter to save
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Load cues and tags
  useEffect(() => {
    client.get(`/moves/${move.id}/cues`).then((res) => setCues(res.data));
    client.get(`/moves/${move.id}/media`).then((res) => setMediaItems(res.data));
    client.get(`/collections/${collectionId}/moves/${move.id}/tags`).then((res) => setMoveTags(res.data));
    client.get(`/collections/${collectionId}/tags`).then((res) => setAllTags(res.data));
  }, [move.id, collectionId]);

  const availableTags = allTags.filter(
    (t) => !moveTags.some((mt) => mt.id === t.id)
  );

  const filteredTagSuggestions = availableTags.filter((t) =>
    t.name.toLowerCase().includes(tagInput.toLowerCase())
  );

  const tagExactMatch = availableTags.find(
    (t) => t.name.toLowerCase() === tagInput.toLowerCase()
  );

  const handleAddExistingTag = async (tag: Tag) => {
    await client.post(`/collections/${collectionId}/tags/${tag.id}/moves`, { move_id: move.id });
    setMoveTags((prev) => [...prev, tag]);
    setTagInput("");
    setShowTagSuggestions(false);
  };

  const handleCreateTag = async () => {
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
      setShowTagSuggestions(false);
    } catch (err) {
      console.error("Failed to create tag:", err);
    }
  };

  // Tag suggestions keyboard navigation
  const tagItemCount =
    filteredTagSuggestions.length +
    (!tagExactMatch && tagInput.trim() ? 1 : 0);
  const handleTagSelect = useCallback(
    (index: number) => {
      if (index < filteredTagSuggestions.length) {
        handleAddExistingTag(filteredTagSuggestions[index]);
      } else {
        handleCreateTag();
      }
    },
    [filteredTagSuggestions, tagInput, handleAddExistingTag]
  );
  const { highlightedIndex: tagHighlight, handleKeyDown: handleTagNavKeyDown } =
    useDropdownKeyNav({
      itemCount: tagItemCount,
      onSelect: handleTagSelect,
      onEscape: () => {
        setShowTagSuggestions(false);
        setTagInput("");
      },
      enabled: showTagSuggestions && !!tagInput,
    });

  const handleTagInputKeyDown = (e: React.KeyboardEvent) => {
    handleTagNavKeyDown(e);
    if (e.defaultPrevented) return;
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (tagExactMatch) {
        handleAddExistingTag(tagExactMatch);
      } else if (filteredTagSuggestions.length === 1) {
        handleAddExistingTag(filteredTagSuggestions[0]);
      } else {
        handleCreateTag();
      }
    } else if (e.key === "Escape") {
      setShowTagSuggestions(false);
      setTagInput("");
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    await client.delete(`/collections/${collectionId}/tags/${tagId}/moves/${move.id}`);
    setMoveTags((prev) => prev.filter((t) => t.id !== tagId));
  };

  // Reset form when move changes
  useEffect(() => {
    setForm({
      name: move.name,
      description: move.description || "",
      beat_count: move.beat_count,
      difficulty: move.difficulty,
      familiarity: move.familiarity,
      starting_beat: move.starting_beat,
      is_state: move.is_state,
      key_egress: move.key_egress,
      key_ingress: move.key_ingress,
      is_core: move.is_core,
      leadability: move.leadability,
      mental_availability: move.mental_availability,
      beat_energy: move.beat_energy,
      moderna_energy: move.moderna_energy,
      sensual_energy: move.sensual_energy,
      impact: move.impact,
      learning_priority: move.learning_priority,
      leader_styling: move.leader_styling,
      follower_styling: move.follower_styling,
      date_learned: move.date_learned,
      learning_notes: move.learning_notes,
    });
  }, [move]);

  const handleIsStateChange = (checked: boolean) => {
    if (checked) {
      setForm({ ...form, is_state: true, beat_count: 0 });
    } else {
      setForm({ ...form, is_state: false, beat_count: 4 });
    }
  };

  // Check if form has unsaved changes
  const isDirty = useCallback(() => {
    return (
      form.name !== move.name ||
      (form.description || "") !== (move.description || "") ||
      form.beat_count !== move.beat_count ||
      form.difficulty !== move.difficulty ||
      form.familiarity !== move.familiarity ||
      form.starting_beat !== move.starting_beat ||
      form.is_state !== move.is_state ||
      form.key_egress !== move.key_egress ||
      form.key_ingress !== move.key_ingress ||
      form.is_core !== move.is_core ||
      form.leadability !== move.leadability ||
      form.mental_availability !== move.mental_availability ||
      form.beat_energy !== move.beat_energy ||
      form.moderna_energy !== move.moderna_energy ||
      form.sensual_energy !== move.sensual_energy ||
      form.impact !== move.impact ||
      form.learning_priority !== move.learning_priority ||
      (form.leader_styling || "") !== (move.leader_styling || "") ||
      (form.follower_styling || "") !== (move.follower_styling || "") ||
      (form.date_learned || "") !== (move.date_learned || "") ||
      (form.learning_notes || "") !== (move.learning_notes || "")
    );
  }, [form, move]);

  const handleClose = useCallback(() => {
    if (isDirty()) {
      setShowUnsavedModal(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const handleSaveAndClose = useCallback(async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        description: form.description || null,
        leader_styling: form.leader_styling || null,
        follower_styling: form.follower_styling || null,
        date_learned: form.date_learned || null,
        learning_notes: form.learning_notes || null,
      };
      const res = await client.put(`/moves/${move.id}`, payload);
      onSave(res.data);
      onClose();
    } catch (err) {
      console.error("Failed to save move:", err);
    } finally {
      setSaving(false);
      setShowUnsavedModal(false);
    }
  }, [form, move.id, onSave, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        description: form.description || null,
        leader_styling: form.leader_styling || null,
        follower_styling: form.follower_styling || null,
        date_learned: form.date_learned || null,
        learning_notes: form.learning_notes || null,
      };
      const res = await client.put(`/moves/${move.id}`, payload);
      onSave(res.data);
      onClose();
    } catch (err) {
      console.error("Failed to save move:", err);
    } finally {
      setSaving(false);
    }
  };

  const renderOptionalSlider = (
    label: string,
    field: "difficulty" | "familiarity" | "leadability" | "mental_availability" | "beat_energy" | "moderna_energy" | "sensual_energy" | "impact" | "learning_priority"
  ) => {
    const value = form[field];
    return (
      <label>
        {label} (0-10)
        <div className="slider-row">
          <input
            type="range"
            min={0}
            max={10}
            value={value ?? 5}
            onChange={(e) =>
              setForm({ ...form, [field]: parseInt(e.target.value) })
            }
            onPointerDown={() => {
              if (value === null || value === undefined) {
                setForm({ ...form, [field]: 5 });
              }
            }}
          />
          <span className="range-value">{value ?? "—"}</span>
          {value !== null && value !== undefined ? (
            <button
              type="button"
              className="btn-icon"
              onClick={() => setForm({ ...form, [field]: null })}
              title="Clear"
            >
              &times;
            </button>
          ) : (
            <span className="btn-icon-placeholder" />
          )}
        </div>
      </label>
    );
  };

  return (
    <div className={`slide-panel edit-move-panel ${closing ? "closing" : ""}`}>
      <div className="slide-panel-header">
        <h3>Edit Move</h3>
        <button className="btn-icon" onClick={handleClose} title="Close">
          &times;
        </button>
      </div>

      <div className="slide-panel-content">
        <form ref={formRef} onSubmit={handleSubmit} className="edit-move-form">
          {/* Core Identity */}
          <label>
            Name *
            <input
              type="text"
              value={form.name || ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>

          <label>
            Description
            <textarea
              value={form.description || ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
            />
          </label>

          <CuesSection moveId={move.id} cues={cues} onCuesChange={setCues} />

          {/* Timing */}
          <div className="form-section">
            <div className="form-section-title">Timing</div>
            <div className="segmented-control move-type-control">
              <button
                type="button"
                className={!form.is_state ? "active" : ""}
                onClick={() => handleIsStateChange(false)}
              >
                Movement
              </button>
              <button
                type="button"
                className={form.is_state ? "active" : ""}
                onClick={() => handleIsStateChange(true)}
              >
                State
              </button>
            </div>
            <label>
              Starting Beat (1-8) *
              <input
                type="number"
                min={1}
                max={8}
                value={form.starting_beat ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    starting_beat: e.target.value
                      ? parseInt(e.target.value)
                      : null,
                  })
                }
                required
              />
            </label>
            <label>
              Beat Count {!form.is_state && "*"}
              <input
                type="number"
                min={form.is_state ? 0 : 1}
                value={form.beat_count ?? 0}
                onChange={(e) =>
                  setForm({
                    ...form,
                    beat_count: parseInt(e.target.value) || 0,
                  })
                }
                disabled={form.is_state}
                required
              />
            </label>
          </div>

          {/* Stats */}
          <div className="form-section">
            <div className="form-section-title">Stats</div>
            {renderOptionalSlider("Difficulty", "difficulty")}
            {renderOptionalSlider("Leadability", "leadability")}
            {renderOptionalSlider("Familiarity", "familiarity")}
            {renderOptionalSlider("Mental Availability", "mental_availability")}
            {renderOptionalSlider("Learning Priority", "learning_priority")}
          </div>

          {/* Energy */}
          <div className="form-section">
            <div className="form-section-title">Energy</div>
            {renderOptionalSlider("Impact", "impact")}
            {renderOptionalSlider("Beat Energy", "beat_energy")}
            {renderOptionalSlider("Moderna Energy", "moderna_energy")}
            {renderOptionalSlider("Sensual Energy", "sensual_energy")}
          </div>

          {/* Key Move Flags */}
          <div className="form-section">
            <div className="form-section-title">Key Move Flags</div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.key_egress || false}
                onChange={(e) =>
                  setForm({ ...form, key_egress: e.target.checked })
                }
              />
              Key Egress (many successive moves)
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.key_ingress || false}
                onChange={(e) =>
                  setForm({ ...form, key_ingress: e.target.checked })
                }
              />
              Key Ingress (many preceding moves)
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.is_core || false}
                onChange={(e) =>
                  setForm({ ...form, is_core: e.target.checked })
                }
              />
              Core Move
            </label>
          </div>

          {/* Tags (collection-scoped) */}
          <div className="form-section">
            <div className="form-section-title">Tags</div>
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
                    setShowTagSuggestions(true);
                  }}
                  onFocus={() => setShowTagSuggestions(true)}
                  onBlur={() => {
                    setTimeout(() => setShowTagSuggestions(false), 200);
                  }}
                  onKeyDown={handleTagInputKeyDown}
                />
                {showTagSuggestions && tagInput && (
                  <div className="theme-suggestions">
                    {filteredTagSuggestions.map((tag, idx) => (
                      <div
                        key={tag.id}
                        className={`theme-suggestion ${idx === tagHighlight ? "highlighted" : ""}`}
                        onMouseDown={() => handleAddExistingTag(tag)}
                      >
                        {tag.name}
                      </div>
                    ))}
                    {!tagExactMatch && tagInput.trim() && (
                      <div
                        className={`theme-suggestion theme-suggestion-new ${filteredTagSuggestions.length === tagHighlight ? "highlighted" : ""}`}
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

          {/* Media */}
          <div className="form-section">
            <div className="form-section-title">Media ({mediaItems.length})</div>
            <MediaUpload
              moveId={move.id}
              onUploaded={(media) => {
                setMediaItems((prev) => [...prev, media]);
                if (!coverMediaId) setCoverMediaId(media.id);
              }}
            />
            {mediaItems.length > 0 && (
              <div className="media-grid panel-media-grid">
                {mediaItems.map((media) => (
                  <MediaPlayer
                    key={media.id}
                    media={media}
                    moveId={move.id}
                    isCover={coverMediaId === media.id}
                    onDelete={(mediaId) => {
                      setMediaItems((prev) => prev.filter((m) => m.id !== mediaId));
                      if (coverMediaId === mediaId) setCoverMediaId(null);
                    }}
                    onRenamed={(mediaId, newFilename) => {
                      setMediaItems((prev) =>
                        prev.map((m) => (m.id === mediaId ? { ...m, filename: newFilename } : m))
                      );
                    }}
                    onSetCover={(mediaId) => setCoverMediaId(mediaId)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Styling */}
          <div className="form-section">
            <div className="form-section-title">Styling</div>
            <label>
              Leader Styling
              <textarea
                value={form.leader_styling || ""}
                onChange={(e) =>
                  setForm({ ...form, leader_styling: e.target.value })
                }
                maxLength={300}
                rows={2}
                placeholder="Notes on leader styling..."
              />
              <span className="char-count">
                {(form.leader_styling || "").length}/300
              </span>
            </label>
            <label>
              Follower Styling
              <textarea
                value={form.follower_styling || ""}
                onChange={(e) =>
                  setForm({ ...form, follower_styling: e.target.value })
                }
                maxLength={300}
                rows={2}
                placeholder="Notes on follower styling..."
              />
              <span className="char-count">
                {(form.follower_styling || "").length}/300
              </span>
            </label>
          </div>

          {/* Learning */}
          <div className="form-section">
            <div className="form-section-title">Learning</div>
            <div className="date-input-row">
              <span className="date-label">Date Learned</span>
              <div className="date-input-wrapper">
                <input
                  type="date" max="9999-12-31"
                  value={form.date_learned || ""}
                  onChange={(e) =>
                    setForm({ ...form, date_learned: e.target.value || null })
                  }
                  className={form.date_learned ? "" : "date-empty"}
                />
                {!form.date_learned && (
                  <span className="date-placeholder">--/--/----</span>
                )}
              </div>
              {form.date_learned && (
                <button
                  type="button"
                  className="btn-icon btn-clear-date"
                  onClick={() => setForm({ ...form, date_learned: null })}
                  title="Clear date"
                >
                  &times;
                </button>
              )}
            </div>
            <label>
              Learning Notes
              <textarea
                value={form.learning_notes || ""}
                onChange={(e) =>
                  setForm({ ...form, learning_notes: e.target.value })
                }
                rows={2}
                placeholder="Issues to work out or ask a teacher about..."
              />
            </label>
          </div>

          <div className="slide-panel-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClose}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      {/* Unsaved Changes Modal */}
      {showUnsavedModal && (
        <div className="modal-overlay" onClick={() => setShowUnsavedModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Unsaved Changes</h3>
            <p className="modal-message">You have unsaved changes. What would you like to do?</p>
            <div className="modal-actions modal-actions-three">
              <button className="btn btn-secondary" onClick={() => setShowUnsavedModal(false)}>
                Keep Editing
              </button>
              <button className="btn btn-danger" onClick={() => { setShowUnsavedModal(false); onClose(); }}>
                Discard
              </button>
              <button className="btn btn-primary" onClick={handleSaveAndClose} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
