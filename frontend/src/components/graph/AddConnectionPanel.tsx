import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { Connection, Move, MoveCreate, DanceStyle, Theme } from "../../types";
import client from "../../api/client";
import { multiTermMatch, highlightTerms } from "../../utils/search";
import { useDropdownKeyNav } from "../../hooks/useDropdownKeyNav";

export interface ConnectionPreview {
  sourceMoveId: string;
  targetMoveId: string;
}

interface AddConnectionPanelProps {
  sourceMove: Move;
  allDanceStyleMoves: Move[];
  collectionMoveIds: Set<string>;
  existingConnections: Connection[];
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
}

export default function AddConnectionPanel({
  sourceMove,
  allDanceStyleMoves,
  collectionMoveIds,
  existingConnections,
  collectionDanceStyle,
  onSave,
  onAddMoveToCollection,
  onPreviewChange,
  onClose,
  closing,
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
    difficulty: 5,
    familiarity: 1,
    tags: [],
    dance_style: collectionDanceStyle as DanceStyle,
    starting_beat: 1,
    is_state: false,
    key_egress: false,
    key_ingress: false,
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
  });
  const [tagInput, setTagInput] = useState("");
  const [creatingMove, setCreatingMove] = useState(false);

  // Theme state for new move form
  const [availableThemes, setAvailableThemes] = useState<Theme[]>([]);
  const [selectedThemes, setSelectedThemes] = useState<Theme[]>([]);
  const [newMoveThemeInput, setNewMoveThemeInput] = useState("");
  const [showNewMoveThemeSuggestions, setShowNewMoveThemeSuggestions] = useState(false);
  const [showNewMoveCreateThemeModal, setShowNewMoveCreateThemeModal] = useState(false);
  const [newMovePendingThemeName, setNewMovePendingThemeName] = useState("");
  const newMoveThemeInputRef = useRef<HTMLInputElement>(null);

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

  // Load available themes for the dance style
  useEffect(() => {
    client
      .get(`/themes?dance_style=${encodeURIComponent(collectionDanceStyle)}`)
      .then((res) => setAvailableThemes(res.data));
  }, [collectionDanceStyle]);

  const filteredNewMoveThemes = availableThemes
    .filter((t) => !selectedThemes.some((st) => st.id === t.id))
    .filter((t) => t.name.toLowerCase().includes(newMoveThemeInput.toLowerCase()));

  const newMoveThemeExactMatch = availableThemes
    .filter((t) => !selectedThemes.some((st) => st.id === t.id))
    .find((t) => t.name.toLowerCase() === newMoveThemeInput.toLowerCase());

  const handleSelectTheme = (theme: Theme) => {
    setSelectedThemes((prev) => [...prev, theme]);
    setNewMoveThemeInput("");
    setShowNewMoveThemeSuggestions(false);
  };

  const handleRemoveSelectedTheme = (themeId: string) => {
    setSelectedThemes((prev) => prev.filter((t) => t.id !== themeId));
  };

  // New move theme suggestions keyboard navigation
  const newMoveThemeItemCount =
    filteredNewMoveThemes.length +
    (!newMoveThemeExactMatch && newMoveThemeInput.trim() ? 1 : 0);
  const handleNewMoveThemeSelect = useCallback(
    (index: number) => {
      if (index < filteredNewMoveThemes.length) {
        handleSelectTheme(filteredNewMoveThemes[index]);
      } else {
        setNewMovePendingThemeName(newMoveThemeInput.trim());
        setShowNewMoveCreateThemeModal(true);
      }
    },
    [filteredNewMoveThemes, newMoveThemeInput]
  );
  const {
    highlightedIndex: newMoveThemeHighlight,
    handleKeyDown: handleNewMoveThemeNavKeyDown,
  } = useDropdownKeyNav({
    itemCount: newMoveThemeItemCount,
    onSelect: handleNewMoveThemeSelect,
    onEscape: () => {
      setShowNewMoveThemeSuggestions(false);
      setNewMoveThemeInput("");
    },
    enabled: showNewMoveThemeSuggestions && !!newMoveThemeInput,
  });

  const handleNewMoveThemeKeyDown = (e: React.KeyboardEvent) => {
    handleNewMoveThemeNavKeyDown(e);
    if (e.defaultPrevented) return;
    if (e.key === "Enter" && newMoveThemeInput.trim()) {
      e.preventDefault();
      if (newMoveThemeExactMatch) {
        handleSelectTheme(newMoveThemeExactMatch);
      } else if (filteredNewMoveThemes.length === 1) {
        handleSelectTheme(filteredNewMoveThemes[0]);
      } else {
        setNewMovePendingThemeName(newMoveThemeInput.trim());
        setShowNewMoveCreateThemeModal(true);
      }
    } else if (e.key === "Escape") {
      setShowNewMoveThemeSuggestions(false);
      setNewMoveThemeInput("");
    }
  };

  const handleCreateThemeForNewMove = async () => {
    if (!newMovePendingThemeName) return;
    try {
      const createRes = await client.post("/themes", {
        name: newMovePendingThemeName,
        dance_style: collectionDanceStyle as DanceStyle,
      });
      const newTheme = createRes.data;
      setAvailableThemes((prev) => [...prev, newTheme]);
      setSelectedThemes((prev) => [...prev, newTheme]);
      setNewMoveThemeInput("");
      setShowNewMoveCreateThemeModal(false);
      setNewMovePendingThemeName("");
    } catch (err) {
      console.error("Failed to create theme:", err);
    }
  };

  // Filter moves based on direction and existing connections
  const filteredMoves = useMemo(() => {
    // Get IDs of moves already connected in this direction
    const connectedIds = new Set(
      existingConnections
        .filter((c) =>
          direction === "to"
            ? c.source_move_id === sourceMove.id
            : c.target_move_id === sourceMove.id
        )
        .map((c) =>
          direction === "to" ? c.target_move_id : c.source_move_id
        )
    );

    // Filter ALL moves of this dance style: not self, not already connected, matches search
    return allDanceStyleMoves.filter(
      (m) =>
        m.id !== sourceMove.id &&
        !connectedIds.has(m.id) &&
        multiTermMatch(m.name, searchQuery)
    );
  }, [allDanceStyleMoves, existingConnections, sourceMove.id, direction, searchQuery]);

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
  const selectedMove = allDanceStyleMoves.find((m) => m.id === targetMoveId);
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

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !newMoveForm.tags?.includes(tag)) {
      setNewMoveForm({
        ...newMoveForm,
        tags: [...(newMoveForm.tags || []), tag],
      });
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setNewMoveForm({
      ...newMoveForm,
      tags: (newMoveForm.tags || []).filter((t) => t !== tag),
    });
  };

  const handleCreateMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMoveForm.name.trim()) return;

    setCreatingMove(true);
    try {
      const payload = {
        ...newMoveForm,
        description: newMoveForm.description || null,
        leader_styling: newMoveForm.leader_styling || null,
        follower_styling: newMoveForm.follower_styling || null,
        learning_notes: newMoveForm.learning_notes || null,
      };
      const res = await client.post("/moves", payload);
      const newMoveId = res.data.id;

      // Assign selected themes to the new move
      for (const theme of selectedThemes) {
        await client.post(`/themes/${theme.id}/moves`, { move_id: newMoveId });
      }

      // Add to collection
      await onAddMoveToCollection(newMoveId);

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
        tags: [],
        dance_style: collectionDanceStyle as DanceStyle,
        starting_beat: 1,
        is_state: false,
        key_egress: false,
        key_ingress: false,
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
      });
      setSelectedThemes([]);
    } finally {
      setCreatingMove(false);
    }
  };

  const renderOptionalSlider = (
    label: string,
    field: "leadability" | "mental_availability" | "beat_energy" | "moderna_energy" | "sensual_energy" | "impact" | "learning_priority"
  ) => {
    const value = newMoveForm[field];
    // All optional scores are now 0-10
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
    setTimeout(() => {
      setShowNewMoveForm(false);
      setClosingNewMoveForm(false);
    }, 200); // Match animation duration
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
            <label>
              Difficulty (0-10) *
              <div className="slider-row">
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={newMoveForm.difficulty}
                  onChange={(e) =>
                    setNewMoveForm({
                      ...newMoveForm,
                      difficulty: parseInt(e.target.value),
                    })
                  }
                />
                <span className="range-value">{newMoveForm.difficulty}</span>
                <span className="btn-icon-placeholder" />
              </div>
            </label>
            {renderOptionalSlider("Leadability", "leadability")}
            <label>
              Familiarity (0-10) *
              <div className="slider-row">
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={newMoveForm.familiarity}
                  onChange={(e) =>
                    setNewMoveForm({
                      ...newMoveForm,
                      familiarity: parseInt(e.target.value),
                    })
                  }
                />
                <span className="range-value">{newMoveForm.familiarity}</span>
                <span className="btn-icon-placeholder" />
              </div>
            </label>
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
          </div>

          {/* Notes */}
          <div className="form-section">
            <div className="form-section-title">Notes</div>
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
          <div className="tag-input-group">
            <label>Tags</label>
            <div className="tag-input-row">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add a tag"
              />
              <button type="button" onClick={addTag} className="btn btn-secondary">
                Add
              </button>
            </div>
            <div className="tags-display">
              {newMoveForm.tags?.map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)}>
                    &times;
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Themes */}
          <div className="form-section">
            <div className="form-section-title">Themes</div>
            <div className="themes-tag-container">
              {selectedThemes.map((theme) => (
                <span key={theme.id} className="theme-tag">
                  {theme.name}
                  <button
                    type="button"
                    className="theme-tag-remove"
                    onClick={() => handleRemoveSelectedTheme(theme.id)}
                    title="Remove theme"
                  >
                    &times;
                  </button>
                </span>
              ))}
              <div className="theme-input-wrapper">
                <input
                  ref={newMoveThemeInputRef}
                  type="text"
                  className="theme-input"
                  placeholder="Add theme..."
                  value={newMoveThemeInput}
                  onChange={(e) => {
                    setNewMoveThemeInput(e.target.value);
                    setShowNewMoveThemeSuggestions(true);
                  }}
                  onFocus={() => setShowNewMoveThemeSuggestions(true)}
                  onBlur={() => {
                    setTimeout(() => setShowNewMoveThemeSuggestions(false), 200);
                  }}
                  onKeyDown={handleNewMoveThemeKeyDown}
                />
                {showNewMoveThemeSuggestions && newMoveThemeInput && (
                  <div className="theme-suggestions">
                    {filteredNewMoveThemes.map((theme, idx) => (
                      <div
                        key={theme.id}
                        className={`theme-suggestion ${idx === newMoveThemeHighlight ? "highlighted" : ""}`}
                        onMouseDown={() => handleSelectTheme(theme)}
                      >
                        {theme.name}
                      </div>
                    ))}
                    {!newMoveThemeExactMatch && newMoveThemeInput.trim() && (
                      <div
                        className={`theme-suggestion theme-suggestion-new ${filteredNewMoveThemes.length === newMoveThemeHighlight ? "highlighted" : ""}`}
                        onMouseDown={() => {
                          setNewMovePendingThemeName(newMoveThemeInput.trim());
                          setShowNewMoveCreateThemeModal(true);
                        }}
                      >
                        Create "{newMoveThemeInput.trim()}"
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="slide-panel-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={creatingMove || !newMoveForm.name.trim()}
            >
              {creatingMove ? "Creating..." : "Create Move"}
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
            {/* Show either the search input OR the selected move chip, not both */}
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
                {/* Show dropdown when searching */}
                {searchQuery && (
                  <div className="options">
                    {filteredMoves.length === 0 ? (
                      <div className="option disabled">No moves found</div>
                    ) : (
                      visibleMoves.map((move, idx) => (
                        <div
                          key={move.id}
                          className={`option ${idx === moveSearchIndex ? "highlighted" : ""}`}
                          onClick={() => {
                            setTargetMoveId(move.id);
                            setSearchQuery("");
                          }}
                        >
                          <span>{highlightTerms(move.name, searchQuery)}</span>
                          {!isInCollection(move.id) && (
                            <span className="add-to-collection-badge">Add to Collection</span>
                          )}
                        </div>
                      ))
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

    {/* Create Theme Modal for New Move */}
    {showNewMoveCreateThemeModal && (
      <div className="modal-overlay" onClick={() => setShowNewMoveCreateThemeModal(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3>Create New Theme</h3>
          <p>
            Create a new theme called "<strong>{newMovePendingThemeName}</strong>" for{" "}
            {collectionDanceStyle}?
          </p>
          <div className="modal-actions">
            <button
              className="btn btn-secondary"
              onClick={() => {
                setShowNewMoveCreateThemeModal(false);
                setNewMovePendingThemeName("");
              }}
            >
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleCreateThemeForNewMove}>
              Create Theme
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
  );
}
