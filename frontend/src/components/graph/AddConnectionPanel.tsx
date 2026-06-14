import { useState, useMemo, useEffect, useCallback } from "react";
import type { Connection, Move, MoveCreate, Tag, Cue } from "../../types";
import CuesSection from "../CuesSection";
import MediaStaging from "../MediaStaging";
import client from "../../api/client";
import { multiTermMatch, highlightTerms } from "../../utils/search";
import { useDropdownKeyNav } from "../../hooks/useDropdownKeyNav";

export interface ConnectionPreview {
  sourceMoveId: string;
  targetMoveId: string;
}

interface AddConnectionPanelProps {
  sourceMove: Move;
  allMoves: Move[];
  collectionMoveIds: Set<string>;
  existingConnections: Connection[];
  collectionId: string;
  collectionDanceStyle: string;
  onSave: (
    targetMoveId: string,
    direction: "to" | "from",
    label: string | null
  ) => Promise<void>;
  onAddMoveToCollection: (moveId: string) => Promise<void>;
  onPreviewChange?: (preview: ConnectionPreview | null) => void;
  onClose: () => void;
  closing?: boolean;
  /** When set (a tag chip is active), new moves created here inherit this tag
   *  by default — pre-applied to the move and its cover media. */
  autoTag?: Tag | null;
}

export default function AddConnectionPanel({
  sourceMove,
  allMoves,
  collectionMoveIds,
  existingConnections,
  collectionId,
  collectionDanceStyle,
  onSave,
  onAddMoveToCollection,
  onPreviewChange,
  onClose,
  closing,
  autoTag,
}: AddConnectionPanelProps) {
  // Connection form state
  const [direction, setDirection] = useState<"to" | "from">("to");
  const [targetMoveId, setTargetMoveId] = useState("");
  const [label, setLabel] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLimit, setSearchLimit] = useState(20);
  const [saving, setSaving] = useState(false);

  // New move form state
  const [showNewMoveForm, setShowNewMoveForm] = useState(false);
  const [newMoveForm, setNewMoveForm] = useState<MoveCreate>({
    name: "",
    description: "",
    beat_count: 4,
    difficulty: null,
    familiarity: null,
    starting_beat: 1,
    is_state: false,
    key_egress: false,
    key_ingress: false,
    is_core: false,
    leadability: null,
    mental_availability: null,
    beat_energy: null,
    moderna_energy: null,
    sensual_energy: null,
    impact: null,
    learning_priority: null,
    leader_styling: null,
    follower_styling: null,
    learning_notes: null,
    collection_id: collectionId,
  });
  const [creatingMove, setCreatingMove] = useState(false);

  // Cues state for new move form
  const [newMoveCues, setNewMoveCues] = useState<Cue[]>([]);

  // Media staged locally, uploaded after the move is created.
  const [newMoveMedia, setNewMoveMedia] = useState<File[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  // Set once the move row exists, so a retry doesn't recreate it.
  const [createdMoveId, setCreatedMoveId] = useState<string | null>(null);

  // Tag state for new move form
  // pendingTagNames tracks tags typed by the user that don't exist yet.
  // They are only created in the DB when the move is actually submitted.
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [pendingTagNames, setPendingTagNames] = useState<Set<string>>(new Set());
  const [newMoveTagInput, setNewMoveTagInput] = useState("");
  const [showNewMoveTagSuggestions, setShowNewMoveTagSuggestions] = useState(false);

  // Notify parent of preview connection changes
  useEffect(() => {
    if (targetMoveId) {
      const preview: ConnectionPreview =
        direction === "to"
          ? { sourceMoveId: sourceMove.id, targetMoveId }
          : { sourceMoveId: targetMoveId, targetMoveId: sourceMove.id };
      onPreviewChange?.(preview);
    } else {
      onPreviewChange?.(null);
    }
  }, [targetMoveId, direction, sourceMove.id, onPreviewChange]);

  // Clear preview on unmount
  useEffect(() => {
    return () => onPreviewChange?.(null);
  }, [onPreviewChange]);

  // Load available tags for the collection
  useEffect(() => {
    client
      .get(`/collections/${collectionId}/tags`)
      .then((res) => setAvailableTags(res.data));
  }, [collectionId]);

  // When invoked with an active tag, pre-apply it to each new move (the user
  // can still remove the chip). Re-seeds whenever the new-move form opens so a
  // series of moves all inherit the tag.
  useEffect(() => {
    if (showNewMoveForm && autoTag) {
      setSelectedTags((prev) =>
        prev.some((t) => t.id === autoTag.id) ? prev : [autoTag, ...prev]
      );
    }
  }, [showNewMoveForm, autoTag]);

  const filteredNewMoveTags = availableTags
    .filter((t) => !selectedTags.some((st) => st.id === t.id))
    .filter((t) => t.name.toLowerCase().includes(newMoveTagInput.toLowerCase()));

  const newMoveTagExactMatch = availableTags
    .filter((t) => !selectedTags.some((st) => st.id === t.id))
    .find((t) => t.name.toLowerCase() === newMoveTagInput.toLowerCase())
    || selectedTags.find((t) => t.name.toLowerCase() === newMoveTagInput.trim().toLowerCase());

  const handleSelectTag = (tag: Tag) => {
    setSelectedTags((prev) => [...prev, tag]);
    setNewMoveTagInput("");
    setShowNewMoveTagSuggestions(false);
  };

  const handleRemoveSelectedTag = (tagId: string) => {
    setSelectedTags((prev) => prev.filter((t) => t.id !== tagId));
  };

  const handleCreateTagForNewMove = () => {
    const name = newMoveTagInput.trim();
    if (!name) return;
    // Create a local-only placeholder tag. It will be persisted to the DB
    // only when the move is actually submitted (in handleCreateMove).
    const placeholder: Tag = {
      id: `pending-${name}`,
      collection_id: collectionId,
      name,
      created_at: "",
      updated_at: "",
    };
    setSelectedTags((prev) => [...prev, placeholder]);
    setPendingTagNames((prev) => new Set(prev).add(name));
    setNewMoveTagInput("");
    setShowNewMoveTagSuggestions(false);
  };

  // New move tag suggestions keyboard navigation
  const newMoveTagItemCount =
    filteredNewMoveTags.length +
    (!newMoveTagExactMatch && newMoveTagInput.trim() ? 1 : 0);
  const handleNewMoveTagSelect = useCallback(
    (index: number) => {
      if (index < filteredNewMoveTags.length) {
        handleSelectTag(filteredNewMoveTags[index]);
      } else {
        handleCreateTagForNewMove();
      }
    },
    [filteredNewMoveTags, newMoveTagInput]
  );
  const {
    highlightedIndex: newMoveTagHighlight,
    handleKeyDown: handleNewMoveTagNavKeyDown,
  } = useDropdownKeyNav({
    itemCount: newMoveTagItemCount,
    onSelect: handleNewMoveTagSelect,
    onEscape: () => {
      setShowNewMoveTagSuggestions(false);
      setNewMoveTagInput("");
    },
    enabled: showNewMoveTagSuggestions && !!newMoveTagInput,
  });

  const handleNewMoveTagKeyDown = (e: React.KeyboardEvent) => {
    handleNewMoveTagNavKeyDown(e);
    if (e.defaultPrevented) return;
    if (e.key === "Enter" && newMoveTagInput.trim()) {
      e.preventDefault();
      if (newMoveTagExactMatch) {
        handleSelectTag(newMoveTagExactMatch);
      } else if (filteredNewMoveTags.length === 1) {
        handleSelectTag(filteredNewMoveTags[0]);
      } else {
        handleCreateTagForNewMove();
      }
    } else if (e.key === "Escape") {
      setShowNewMoveTagSuggestions(false);
      setNewMoveTagInput("");
    }
  };

  // Get IDs of moves already connected in this direction
  const connectedIds = useMemo(() => new Set(
    existingConnections
      .filter((c) =>
        direction === "to"
          ? c.source_move_id === sourceMove.id
          : c.target_move_id === sourceMove.id
      )
      .map((c) =>
        direction === "to" ? c.target_move_id : c.source_move_id
      )
  ), [existingConnections, sourceMove.id, direction]);

  // Filter moves: unconnected first, already-connected at the bottom
  const filteredMoves = useMemo(() => {
    const matching = allMoves.filter(
      (m) => m.id !== sourceMove.id && multiTermMatch(m.name, searchQuery)
    );
    const unconnected = matching.filter((m) => !connectedIds.has(m.id));
    const connected = matching.filter((m) => connectedIds.has(m.id));
    return [...unconnected, ...connected];
  }, [allMoves, connectedIds, sourceMove.id, searchQuery]);

  // Move search keyboard navigation
  const visibleMoves = filteredMoves.slice(0, searchLimit);
  const handleMoveSearchSelect = useCallback(
    (index: number) => {
      const move = visibleMoves[index];
      if (move) {
        setTargetMoveId(move.id);
        setSearchQuery("");
      }
    },
    [visibleMoves]
  );
  const { highlightedIndex: moveSearchIndex, handleKeyDown: handleMoveSearchKeyDown } =
    useDropdownKeyNav({
      itemCount: visibleMoves.length,
      onSelect: handleMoveSearchSelect,
      onEscape: () => setSearchQuery(""),
      enabled: !!searchQuery,
    });

  // Get selected move and check if it's in collection
  const selectedMove = allMoves.find((m) => m.id === targetMoveId);
  const isInCollection = (moveId: string) => collectionMoveIds.has(moveId);
  const selectedMoveInCollection = selectedMove ? isInCollection(selectedMove.id) : true;

  // Handle connection submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetMoveId) return;

    setSaving(true);
    try {
      // Add to collection first if not already in it
      if (!isInCollection(targetMoveId)) {
        await onAddMoveToCollection(targetMoveId);
      }
      await onSave(targetMoveId, direction, label || null);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // Handle new move form
  const handleIsStateChange = (checked: boolean) => {
    if (checked) {
      setNewMoveForm({ ...newMoveForm, is_state: true, beat_count: 0 });
    } else {
      setNewMoveForm({ ...newMoveForm, is_state: false, beat_count: 4 });
    }
  };

  const handleCreateMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMoveForm.name.trim()) return;

    setCreatingMove(true);
    setMediaError(null);
    try {
      // If a previous attempt already created the move (e.g. media upload
      // failed and the user is retrying), reuse it instead of duplicating.
      let newMoveId: string | null = createdMoveId;
      if (!newMoveId) {
        const payload = {
          ...newMoveForm,
          description: newMoveForm.description || null,
          leader_styling: newMoveForm.leader_styling || null,
          follower_styling: newMoveForm.follower_styling || null,
          learning_notes: newMoveForm.learning_notes || null,
          collection_id: collectionId,
        };
        const res = await client.post("/moves", payload);
        newMoveId = res.data.id as string;
        setCreatedMoveId(newMoveId);

        // Assign selected tags to the new move.
        // Pending tags (created locally) are persisted to the DB here.
        for (const tag of selectedTags) {
          let tagId = tag.id;
          if (pendingTagNames.has(tag.name)) {
            const createRes = await client.post(`/collections/${collectionId}/tags`, {
              name: tag.name,
            });
            tagId = createRes.data.id;
          }
          await client.post(`/collections/${collectionId}/tags/${tagId}/moves`, { move_id: newMoveId });
        }

        // Create cues for the new move
        for (const cue of newMoveCues) {
          await client.post(`/moves/${newMoveId}/cues`, {
            beat: cue.beat,
            person: cue.person,
            body_part: cue.body_part,
            description: cue.description,
          });
        }

        // Add to collection
        await onAddMoveToCollection(newMoveId);
      }

      if (!newMoveId) return; // unreachable; satisfies the type narrowing

      // Upload staged media now that the move exists. Keep any that fail so
      // a resubmit retries only those without recreating the move.
      const failed: File[] = [];
      let firstUploadedMediaId: string | null = null;
      for (const file of newMoveMedia) {
        try {
          const formData = new FormData();
          formData.append("file", file);
          const { data: uploaded } = await client.post(
            `/moves/${newMoveId}/media`,
            formData,
            { headers: { "Content-Type": "multipart/form-data" } }
          );
          if (firstUploadedMediaId === null) firstUploadedMediaId = uploaded.id;
        } catch {
          failed.push(file);
        }
      }
      if (failed.length > 0) {
        setNewMoveMedia(failed);
        setMediaError(
          `These files failed to upload: ${failed
            .map((f) => f.name)
            .join(", ")}. Retry, or cancel to keep the move without them.`
        );
        return;
      }

      // Mark the cover media (first uploaded) with the active tag so the
      // tag-focus view previews it — unless the user removed the tag chip.
      // Only one media per tag per move is allowed, so the cover is chosen.
      if (
        autoTag &&
        firstUploadedMediaId &&
        selectedTags.some((t) => t.id === autoTag.id)
      ) {
        try {
          await client.post(`/media/${firstUploadedMediaId}/tags`, {
            tag_id: autoTag.id,
          });
        } catch {
          // Non-fatal: the move still carries the tag; preview falls back to cover.
        }
      }

      // Auto-select the new move
      setTargetMoveId(newMoveId);
      setShowNewMoveForm(false);

      // Reset form
      setNewMoveForm({
        name: "",
        description: "",
        beat_count: 4,
        difficulty: 5,
        familiarity: 1,
        starting_beat: 1,
        is_state: false,
        key_egress: false,
        key_ingress: false,
        is_core: false,
        leadability: null,
        mental_availability: null,
        beat_energy: null,
        moderna_energy: null,
        sensual_energy: null,
        impact: null,
        learning_priority: null,
        leader_styling: null,
        follower_styling: null,
        learning_notes: null,
        collection_id: collectionId,
      });
      setSelectedTags([]);
      setNewMoveCues([]);
      setNewMoveMedia([]);
      setCreatedMoveId(null);
    } finally {
      setCreatingMove(false);
    }
  };

  const renderOptionalSlider = (
    label: string,
    field: "difficulty" | "familiarity" | "leadability" | "mental_availability" | "beat_energy" | "moderna_energy" | "sensual_energy" | "impact" | "learning_priority"
  ) => {
    const value = newMoveForm[field];
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
              setNewMoveForm({ ...newMoveForm, [field]: parseInt(e.target.value) })
            }
            onPointerDown={() => {
              if (value === null || value === undefined) {
                setNewMoveForm({ ...newMoveForm, [field]: 5 });
              }
            }}
          />
          <span className="range-value">{value ?? "—"}</span>
          {value !== null && value !== undefined ? (
            <button
              type="button"
              className="btn-icon"
              onClick={() => setNewMoveForm({ ...newMoveForm, [field]: null })}
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

  // State for closing the new move overlay
  const [closingNewMoveForm, setClosingNewMoveForm] = useState(false);

  const handleCloseNewMoveForm = () => {
    setClosingNewMoveForm(true);
    setMediaError(null);
    setNewMoveMedia([]);
    setCreatedMoveId(null);
    setTimeout(() => {
      setShowNewMoveForm(false);
      setClosingNewMoveForm(false);
    }, 200);
  };

  // Render the New Move Form overlay
  const renderNewMoveForm = () => (
    <div className={`slide-panel slide-panel-overlay-inner ${closingNewMoveForm ? "closing" : ""}`}>
      <div className="slide-panel-header">
        <h3>New Move</h3>
        <button className="btn-icon" onClick={handleCloseNewMoveForm}>
          &times;
        </button>
      </div>
      <div className="slide-panel-content">
        <div className="dance-style-badge">{collectionDanceStyle}</div>

        <form onSubmit={handleCreateMove} className="new-move-panel-form">
          {/* Core Identity */}
          <label>
            Name *
            <input
              type="text"
              value={newMoveForm.name}
              onChange={(e) =>
                setNewMoveForm({ ...newMoveForm, name: e.target.value })
              }
              required
            />
          </label>
          <label>
            Description
            <textarea
              value={newMoveForm.description || ""}
              onChange={(e) =>
                setNewMoveForm({ ...newMoveForm, description: e.target.value })
              }
              rows={2}
            />
          </label>

          {/* Cues */}
          <CuesSection
            cues={newMoveCues}
            onCuesChange={setNewMoveCues}
            localMode
            defaultExpanded={false}
          />

          {/* Media */}
          <div className="form-section">
            <div className="form-section-title">Media</div>
            <MediaStaging files={newMoveMedia} onFilesChange={setNewMoveMedia} />
          </div>

          {/* Timing */}
          <div className="form-section">
            <div className="form-section-title">Timing</div>
            <div className="segmented-control move-type-control">
              <button
                type="button"
                className={!newMoveForm.is_state ? "active" : ""}
                onClick={() => handleIsStateChange(false)}
              >
                Movement
              </button>
              <button
                type="button"
                className={newMoveForm.is_state ? "active" : ""}
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
                value={newMoveForm.starting_beat ?? ""}
                onChange={(e) =>
                  setNewMoveForm({
                    ...newMoveForm,
                    starting_beat: e.target.value
                      ? parseInt(e.target.value)
                      : null,
                  })
                }
                required
              />
            </label>
            <label>
              Beat Count {!newMoveForm.is_state && "*"}
              <input
                type="number"
                min={newMoveForm.is_state ? 0 : 1}
                value={newMoveForm.beat_count}
                onChange={(e) =>
                  setNewMoveForm({
                    ...newMoveForm,
                    beat_count: parseInt(e.target.value) || 0,
                  })
                }
                disabled={newMoveForm.is_state}
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
                checked={newMoveForm.key_egress || false}
                onChange={(e) =>
                  setNewMoveForm({ ...newMoveForm, key_egress: e.target.checked })
                }
              />
              Key Egress (many successive moves)
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={newMoveForm.key_ingress || false}
                onChange={(e) =>
                  setNewMoveForm({ ...newMoveForm, key_ingress: e.target.checked })
                }
              />
              Key Ingress (many preceding moves)
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={newMoveForm.is_core || false}
                onChange={(e) =>
                  setNewMoveForm({ ...newMoveForm, is_core: e.target.checked })
                }
              />
              Core Move
            </label>
          </div>

          {/* Styling */}
          <div className="form-section">
            <div className="form-section-title">Styling</div>
            <label>
              Follower Styling
              <textarea
                value={newMoveForm.follower_styling || ""}
                onChange={(e) =>
                  setNewMoveForm({ ...newMoveForm, follower_styling: e.target.value })
                }
                maxLength={300}
                rows={2}
                placeholder="Notes on follower styling..."
              />
              <span className="char-count">
                {(newMoveForm.follower_styling || "").length}/300
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
                  value={newMoveForm.date_learned || ""}
                  onChange={(e) =>
                    setNewMoveForm({ ...newMoveForm, date_learned: e.target.value || null })
                  }
                  className={newMoveForm.date_learned ? "" : "date-empty"}
                />
                {!newMoveForm.date_learned && (
                  <span className="date-placeholder">--/--/----</span>
                )}
              </div>
              {newMoveForm.date_learned && (
                <button
                  type="button"
                  className="btn-icon btn-clear-date"
                  onClick={() => setNewMoveForm({ ...newMoveForm, date_learned: null })}
                  title="Clear date"
                >
                  &times;
                </button>
              )}
            </div>
            <label>
              Learning Notes
              <textarea
                value={newMoveForm.learning_notes || ""}
                onChange={(e) =>
                  setNewMoveForm({ ...newMoveForm, learning_notes: e.target.value })
                }
                rows={2}
                placeholder="Issues to work out..."
              />
            </label>
          </div>

          {/* Tags */}
          <div className="form-section">
            <div className="form-section-title">Tags</div>
            <div className="themes-tag-container">
              {selectedTags.map((tag) => (
                <span key={tag.id} className="theme-tag">
                  {tag.name}
                  <button
                    type="button"
                    className="theme-tag-remove"
                    onClick={() => handleRemoveSelectedTag(tag.id)}
                    title="Remove tag"
                  >
                    &times;
                  </button>
                </span>
              ))}
              <div className="theme-input-wrapper">
                <input
                  type="text"
                  className="theme-input"
                  placeholder="Add tag..."
                  value={newMoveTagInput}
                  onChange={(e) => {
                    setNewMoveTagInput(e.target.value);
                    setShowNewMoveTagSuggestions(true);
                  }}
                  onFocus={() => setShowNewMoveTagSuggestions(true)}
                  onBlur={() => {
                    setTimeout(() => setShowNewMoveTagSuggestions(false), 200);
                  }}
                  onKeyDown={handleNewMoveTagKeyDown}
                />
                {showNewMoveTagSuggestions && newMoveTagInput && (
                  <div className="theme-suggestions">
                    {filteredNewMoveTags.map((tag, idx) => (
                      <div
                        key={tag.id}
                        className={`theme-suggestion ${idx === newMoveTagHighlight ? "highlighted" : ""}`}
                        onMouseDown={() => handleSelectTag(tag)}
                      >
                        {tag.name}
                      </div>
                    ))}
                    {!newMoveTagExactMatch && newMoveTagInput.trim() && (
                      <div
                        className={`theme-suggestion theme-suggestion-new ${filteredNewMoveTags.length === newMoveTagHighlight ? "highlighted" : ""}`}
                        onMouseDown={() => handleCreateTagForNewMove()}
                      >
                        Create "{newMoveTagInput.trim()}"
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {mediaError && <p className="media-upload-error">{mediaError}</p>}

          <div className="slide-panel-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={creatingMove || !newMoveForm.name.trim()}
            >
              {creatingMove
                ? "Creating..."
                : createdMoveId
                  ? "Retry Upload"
                  : "Create Move"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleCloseNewMoveForm}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // Main Add Connection View (always rendered as base)
  return (
    <div className="slide-panel-container">
      <div className={`slide-panel ${closing ? "closing" : ""}`}>
      <div className="slide-panel-header">
        <h3>Add Connection</h3>
        <button className="btn-icon" onClick={onClose}>
          &times;
        </button>
      </div>
      <div className="slide-panel-content">
        {/* Source Move Title */}
        <div className="connection-source-title">
          {sourceMove.name}
        </div>

        {/* Grouped Controls: Segmented Control, New Move Button, Search */}
        <div className="connection-controls-group">
          {/* Direction Segmented Control */}
          <div className="segmented-control">
            <button
              type="button"
              className={direction === "to" ? "active" : ""}
              onClick={() => {
                setDirection("to");
                setTargetMoveId("");
                setSearchQuery("");
              }}
            >
              Connect To
            </button>
            <button
              type="button"
              className={direction === "from" ? "active" : ""}
              onClick={() => {
                setDirection("from");
                setTargetMoveId("");
                setSearchQuery("");
              }}
            >
              Connect From
            </button>
          </div>

          {/* New Move Button */}
          <button
            type="button"
            className="btn btn-secondary new-move-btn"
            onClick={() => setShowNewMoveForm(true)}
          >
            + New Move
          </button>

          {/* Searchable Move Select */}
          <div className="searchable-select">
            {selectedMove ? (
              <div
                className="selected-move-chip"
                onClick={() => {
                  setTargetMoveId("");
                  setSearchQuery("");
                }}
                title="Click to change selection"
              >
                <span>{selectedMove.name}</span>
                {!selectedMoveInCollection && (
                  <span className="add-to-collection-badge">Add to Collection</span>
                )}
                <span className="chip-close">&times;</span>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Type to search existing moves..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSearchLimit(20);
                  }}
                  onKeyDown={handleMoveSearchKeyDown}
                />
                {searchQuery && (
                  <div className="options">
                    {filteredMoves.length === 0 ? (
                      <div className="option disabled">No moves found</div>
                    ) : (
                      visibleMoves.map((move, idx) => {
                        const alreadyConnected = connectedIds.has(move.id);
                        return (
                          <div
                            key={move.id}
                            className={`option ${idx === moveSearchIndex ? "highlighted" : ""} ${alreadyConnected ? "disabled" : ""}`}
                            onClick={() => {
                              if (alreadyConnected) return;
                              setTargetMoveId(move.id);
                              setSearchQuery("");
                            }}
                          >
                            <span>{highlightTerms(move.name, searchQuery)}</span>
                            {alreadyConnected ? (
                              <span className="already-connected-badge">Connected</span>
                            ) : !isInCollection(move.id) ? (
                              <span className="add-to-collection-badge">Add to Collection</span>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                    {filteredMoves.length > searchLimit && (
                      <div
                        className="option show-more"
                        onClick={() => setSearchLimit((prev) => prev + 20)}
                      >
                        {filteredMoves.length - searchLimit} more...
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Label Input */}
          <label>
            Label (optional):
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., 'to the right', 'on 5'"
            />
          </label>

          {/* Connection Summary */}
          <div className="connection-summary">
            <div className="from-to">
              <div>
                <span className="label">From: </span>
                <span className={direction === "to" ? "value" : selectedMove ? "value" : "placeholder"}>
                  {direction === "to"
                    ? sourceMove.name
                    : selectedMove?.name || "Select a move..."}
                </span>
                {direction === "from" && selectedMove && !selectedMoveInCollection && (
                  <span className="add-to-collection-badge">Add to Collection</span>
                )}
              </div>
              <div>
                <span className="label">To: </span>
                <span className={direction === "from" ? "value" : selectedMove ? "value" : "placeholder"}>
                  {direction === "from"
                    ? sourceMove.name
                    : selectedMove?.name || "Select a move..."}
                </span>
                {direction === "to" && selectedMove && !selectedMoveInCollection && (
                  <span className="add-to-collection-badge">Add to Collection</span>
                )}
              </div>
            </div>
          </div>

          <div className="slide-panel-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!targetMoveId || saving}
            >
              {saving ? "Creating..." : "Create Connection"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>

    {/* New Move Form Overlay - slides in on top */}
    {showNewMoveForm && renderNewMoveForm()}
  </div>
  );
}
