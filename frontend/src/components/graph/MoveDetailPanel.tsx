import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Move, Theme, DanceStyle } from "../../types";
import client from "../../api/client";
import { useDropdownKeyNav } from "../../hooks/useDropdownKeyNav";

interface MoveDetailPanelProps {
  move: Move;
  onClose: () => void;
  onAddConnection: () => void;
  onEditMove: () => void;
  onDeleteMove?: () => void;
  closing?: boolean;
}

export default function MoveDetailPanel({
  move,
  onClose,
  onAddConnection,
  onEditMove,
  onDeleteMove,
  closing,
}: MoveDetailPanelProps) {
  // Theme state
  const [themes, setThemes] = useState<Theme[]>([]);
  const [moveThemes, setMoveThemes] = useState<Theme[]>([]);
  const [themeInput, setThemeInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pendingThemeName, setPendingThemeName] = useState("");
  const themeInputRef = useRef<HTMLInputElement>(null);

  // Load themes for this move and available themes for the dance style
  useEffect(() => {
    client.get(`/themes/by-move/${move.id}`).then((res) => setMoveThemes(res.data));
    client
      .get(`/themes?dance_style=${encodeURIComponent(move.dance_style)}`)
      .then((res) => setThemes(res.data));
  }, [move.id, move.dance_style]);

  const availableThemes = themes.filter(
    (t) => !moveThemes.some((mt) => mt.id === t.id)
  );

  const filteredSuggestions = availableThemes.filter((t) =>
    t.name.toLowerCase().includes(themeInput.toLowerCase())
  );

  const exactMatch = availableThemes.find(
    (t) => t.name.toLowerCase() === themeInput.toLowerCase()
  );

  const handleAddExistingTheme = useCallback(
    async (theme: Theme) => {
      await client.post(`/themes/${theme.id}/moves`, { move_id: move.id });
      setMoveThemes((prev) => [...prev, theme]);
      setThemeInput("");
      setShowSuggestions(false);
    },
    [move.id]
  );

  // Theme suggestions keyboard navigation
  const themeItemCount =
    filteredSuggestions.length +
    (!exactMatch && themeInput.trim() ? 1 : 0);
  const handleThemeSelect = useCallback(
    (index: number) => {
      if (index < filteredSuggestions.length) {
        handleAddExistingTheme(filteredSuggestions[index]);
      } else {
        setPendingThemeName(themeInput.trim());
        setShowCreateModal(true);
      }
    },
    [filteredSuggestions, themeInput, handleAddExistingTheme]
  );
  const { highlightedIndex: themeHighlight, handleKeyDown: handleThemeNavKeyDown } =
    useDropdownKeyNav({
      itemCount: themeItemCount,
      onSelect: handleThemeSelect,
      onEscape: () => {
        setShowSuggestions(false);
        setThemeInput("");
      },
      enabled: showSuggestions && !!themeInput,
    });

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    handleThemeNavKeyDown(e);
    if (e.defaultPrevented) return;
    if (e.key === "Enter" && themeInput.trim()) {
      e.preventDefault();
      if (exactMatch) {
        handleAddExistingTheme(exactMatch);
      } else if (filteredSuggestions.length === 1) {
        handleAddExistingTheme(filteredSuggestions[0]);
      } else {
        setPendingThemeName(themeInput.trim());
        setShowCreateModal(true);
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
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
      setShowCreateModal(false);
      setPendingThemeName("");
    } catch (err) {
      console.error("Failed to create theme:", err);
    }
  };

  const handleRemoveFromTheme = async (themeId: string) => {
    await client.delete(`/themes/${themeId}/moves/${move.id}`);
    setMoveThemes((prev) => prev.filter((t) => t.id !== themeId));
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
          <span className="badge">{move.dance_style}</span>
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

        {/* Stats - ordered: Difficulty, Leadability, Familiarity, Mental Availability */}
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

        {move.tags && move.tags.length > 0 && (
          <div className="panel-tags">
            {move.tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Themes */}
        <div className="move-themes-section">
          <div className="panel-section-title">Themes</div>
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
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => {
                  setTimeout(() => setShowSuggestions(false), 200);
                }}
                onKeyDown={handleInputKeyDown}
              />
              {showSuggestions && themeInput && (
                <div className="theme-suggestions">
                  {filteredSuggestions.map((theme, idx) => (
                    <div
                      key={theme.id}
                      className={`theme-suggestion ${idx === themeHighlight ? "highlighted" : ""}`}
                      onMouseDown={() => handleAddExistingTheme(theme)}
                    >
                      {theme.name}
                    </div>
                  ))}
                  {!exactMatch && themeInput.trim() && (
                    <div
                      className={`theme-suggestion theme-suggestion-new ${filteredSuggestions.length === themeHighlight ? "highlighted" : ""}`}
                      onMouseDown={() => {
                        setPendingThemeName(themeInput.trim());
                        setShowCreateModal(true);
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

      {/* Create Theme Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
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
                  setShowCreateModal(false);
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
