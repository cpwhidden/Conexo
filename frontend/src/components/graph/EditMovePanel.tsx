import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import type { Move, MoveUpdate, DanceStyle, Theme } from "../../types";
import client from "../../api/client";
import { useDropdownKeyNav } from "../../hooks/useDropdownKeyNav";

interface EditMovePanelProps {
  move: Move;
  onSave: (updatedMove: Move) => void;
  onClose: () => void;
  closing?: boolean;
}

export default function EditMovePanel({
  move,
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
    tags: move.tags,
    dance_style: move.dance_style as DanceStyle,
    starting_beat: move.starting_beat,
    is_state: move.is_state,
    key_egress: move.key_egress,
    key_ingress: move.key_ingress,
    leadability: move.leadability,
    mental_availability: move.mental_availability,
    beat_energy: move.beat_energy,
    moderna_energy: move.moderna_energy,
    sensual_energy: move.sensual_energy,
    impact: move.impact,
    learning_priority: move.learning_priority,
    leader_styling: move.leader_styling,
    follower_styling: move.follower_styling,
    learning_notes: move.learning_notes,
  });
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);

  // Theme state
  const [themes, setThemes] = useState<Theme[]>([]);
  const [moveThemes, setMoveThemes] = useState<Theme[]>([]);
  const [themeInput, setThemeInput] = useState("");
  const [showThemeSuggestions, setShowThemeSuggestions] = useState(false);
  const [showCreateThemeModal, setShowCreateThemeModal] = useState(false);
  const [pendingThemeName, setPendingThemeName] = useState("");
  const themeInputRef = useRef<HTMLInputElement>(null);

  // Load themes
  useEffect(() => {
    client.get(`/themes/by-move/${move.id}`).then((res) => setMoveThemes(res.data));
    client
      .get(`/themes?dance_style=${encodeURIComponent(move.dance_style)}`)
      .then((res) => setThemes(res.data));
  }, [move.id, move.dance_style]);

  const availableThemes = themes.filter(
    (t) => !moveThemes.some((mt) => mt.id === t.id)
  );

  const filteredThemeSuggestions = availableThemes.filter((t) =>
    t.name.toLowerCase().includes(themeInput.toLowerCase())
  );

  const themeExactMatch = availableThemes.find(
    (t) => t.name.toLowerCase() === themeInput.toLowerCase()
  );

  const handleAddExistingTheme = async (theme: Theme) => {
    await client.post(`/themes/${theme.id}/moves`, { move_id: move.id });
    setMoveThemes((prev) => [...prev, theme]);
    setThemeInput("");
    setShowThemeSuggestions(false);
  };

  // Theme suggestions keyboard navigation
  const themeItemCount =
    filteredThemeSuggestions.length +
    (!themeExactMatch && themeInput.trim() ? 1 : 0);
  const handleThemeSelect = useCallback(
    (index: number) => {
      if (index < filteredThemeSuggestions.length) {
        handleAddExistingTheme(filteredThemeSuggestions[index]);
      } else {
        setPendingThemeName(themeInput.trim());
        setShowCreateThemeModal(true);
      }
    },
    [filteredThemeSuggestions, themeInput, handleAddExistingTheme]
  );
  const { highlightedIndex: themeHighlight, handleKeyDown: handleThemeNavKeyDown } =
    useDropdownKeyNav({
      itemCount: themeItemCount,
      onSelect: handleThemeSelect,
      onEscape: () => {
        setShowThemeSuggestions(false);
        setThemeInput("");
      },
      enabled: showThemeSuggestions && !!themeInput,
    });

  const handleThemeInputKeyDown = (e: React.KeyboardEvent) => {
    handleThemeNavKeyDown(e);
    if (e.defaultPrevented) return;
    if (e.key === "Enter" && themeInput.trim()) {
      e.preventDefault();
      if (themeExactMatch) {
        handleAddExistingTheme(themeExactMatch);
      } else if (filteredThemeSuggestions.length === 1) {
        handleAddExistingTheme(filteredThemeSuggestions[0]);
      } else {
        setPendingThemeName(themeInput.trim());
        setShowCreateThemeModal(true);
      }
    } else if (e.key === "Escape") {
      setShowThemeSuggestions(false);
      setThemeInput("");
    }
  };

  const handleCreateTheme = async () => {
    if (!pendingThemeName) return;
    try {
      const createRes = await client.post("/themes", {
        name: pendingThemeName,
        dance_style: move.dance_style as DanceStyle,
      });
      const newTheme = createRes.data;
      await client.post(`/themes/${newTheme.id}/moves`, { move_id: move.id });
      setThemes((prev) => [...prev, newTheme]);
      setMoveThemes((prev) => [...prev, newTheme]);
      setThemeInput("");
      setShowCreateThemeModal(false);
      setPendingThemeName("");
    } catch (err) {
      console.error("Failed to create theme:", err);
    }
  };

  const handleRemoveFromTheme = async (themeId: string) => {
    await client.delete(`/themes/${themeId}/moves/${move.id}`);
    setMoveThemes((prev) => prev.filter((t) => t.id !== themeId));
  };

  // Reset form when move changes
  useEffect(() => {
    setForm({
      name: move.name,
      description: move.description || "",
      beat_count: move.beat_count,
      difficulty: move.difficulty,
      familiarity: move.familiarity,
      tags: move.tags,
      dance_style: move.dance_style as DanceStyle,
      starting_beat: move.starting_beat,
      is_state: move.is_state,
      key_egress: move.key_egress,
      key_ingress: move.key_ingress,
      leadability: move.leadability,
      mental_availability: move.mental_availability,
      beat_energy: move.beat_energy,
      moderna_energy: move.moderna_energy,
      sensual_energy: move.sensual_energy,
      impact: move.impact,
      learning_priority: move.learning_priority,
      leader_styling: move.leader_styling,
      follower_styling: move.follower_styling,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        description: form.description || null,
        leader_styling: form.leader_styling || null,
        follower_styling: form.follower_styling || null,
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

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !form.tags?.includes(tag)) {
      setForm({ ...form, tags: [...(form.tags || []), tag] });
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setForm({ ...form, tags: (form.tags || []).filter((t) => t !== tag) });
  };

  const renderOptionalSlider = (
    label: string,
    field: "leadability" | "mental_availability" | "beat_energy" | "moderna_energy" | "sensual_energy" | "impact" | "learning_priority"
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
        <button className="btn-icon" onClick={onClose} title="Close">
          &times;
        </button>
      </div>

      <div className="slide-panel-content">
        <form onSubmit={handleSubmit} className="edit-move-form">
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

          <label>
            Dance Style
            <input type="text" value={form.dance_style} disabled />
          </label>

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
            <label>
              Difficulty (0-10) *
              <div className="slider-row">
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={form.difficulty ?? 5}
                  onChange={(e) =>
                    setForm({ ...form, difficulty: parseInt(e.target.value) })
                  }
                />
                <span className="range-value">{form.difficulty}</span>
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
                  value={form.familiarity ?? 1}
                  onChange={(e) =>
                    setForm({ ...form, familiarity: parseInt(e.target.value) })
                  }
                />
                <span className="range-value">{form.familiarity}</span>
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
          </div>

          {/* Tags */}
          <div className="form-section">
            <div className="form-section-title">Tags</div>
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
                placeholder="Add a tag and press Enter"
              />
              <button type="button" onClick={addTag} className="btn btn-secondary btn-sm">
                Add
              </button>
            </div>
            <div className="tags-display">
              {form.tags?.map((tag) => (
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
              {moveThemes.map((theme) => (
                <span key={theme.id} className="theme-tag">
                  <Link to={`/themes/${theme.id}`}>{theme.name}</Link>
                  <button
                    className="theme-tag-remove"
                    onClick={() => handleRemoveFromTheme(theme.id)}
                    title="Remove from theme"
                  >
                    &times;
                  </button>
                </span>
              ))}
              <div className="theme-input-wrapper">
                <input
                  ref={themeInputRef}
                  type="text"
                  className="theme-input"
                  placeholder="Add theme..."
                  value={themeInput}
                  onChange={(e) => {
                    setThemeInput(e.target.value);
                    setShowThemeSuggestions(true);
                  }}
                  onFocus={() => setShowThemeSuggestions(true)}
                  onBlur={() => {
                    setTimeout(() => setShowThemeSuggestions(false), 200);
                  }}
                  onKeyDown={handleThemeInputKeyDown}
                />
                {showThemeSuggestions && themeInput && (
                  <div className="theme-suggestions">
                    {filteredThemeSuggestions.map((theme, idx) => (
                      <div
                        key={theme.id}
                        className={`theme-suggestion ${idx === themeHighlight ? "highlighted" : ""}`}
                        onMouseDown={() => handleAddExistingTheme(theme)}
                      >
                        {theme.name}
                      </div>
                    ))}
                    {!themeExactMatch && themeInput.trim() && (
                      <div
                        className={`theme-suggestion theme-suggestion-new ${filteredThemeSuggestions.length === themeHighlight ? "highlighted" : ""}`}
                        onMouseDown={() => {
                          setPendingThemeName(themeInput.trim());
                          setShowCreateThemeModal(true);
                        }}
                      >
                        Create "{themeInput.trim()}"
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
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

          {/* Learning Notes */}
          <div className="form-section">
            <div className="form-section-title">Notes</div>
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
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      {/* Create Theme Modal */}
      {showCreateThemeModal && (
        <div className="modal-overlay" onClick={() => setShowCreateThemeModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create New Theme</h3>
            <p>
              Create a new theme called "<strong>{pendingThemeName}</strong>" for{" "}
              {move.dance_style}?
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowCreateThemeModal(false);
                  setPendingThemeName("");
                }}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleCreateTheme}>
                Create Theme
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
