import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import client from "../api/client";
import ConnectionList from "../components/ConnectionList";
import MediaPlayer from "../components/MediaPlayer";
import MediaUpload from "../components/MediaUpload";
import CuesSection from "../components/CuesSection";
import type { Move, Media, Theme, DanceStyle, Cue, Collection } from "../types";
import { useMoves } from "../hooks/useMoves";
import { useDropdownKeyNav } from "../hooks/useDropdownKeyNav";

export default function MoveDetailPage() {
  const { moveId } = useParams();
  const navigate = useNavigate();
  const [move, setMove] = useState<Move | null>(null);
  const [mediaItems, setMediaItems] = useState<Media[]>([]);
  const [cues, setCues] = useState<Cue[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [moveThemes, setMoveThemes] = useState<Theme[]>([]);
  const { moves: allMoves } = useMoves();
  const [defaultCollectionId, setDefaultCollectionId] = useState<string | null>(null);

  // Theme input state
  const [themeInput, setThemeInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pendingThemeName, setPendingThemeName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!moveId) return;
    client.get(`/moves/${moveId}`).then((res) => setMove(res.data));
    client.get(`/moves/${moveId}/media`).then((res) => setMediaItems(res.data));
    client.get(`/moves/${moveId}/cues`).then((res) => setCues(res.data));
    client.get(`/themes/by-move/${moveId}`).then((res) => setMoveThemes(res.data));
  }, [moveId]);

  // Load available themes and find default collection when move's dance style is known
  useEffect(() => {
    if (!move) return;
    client
      .get(`/themes?dance_style=${encodeURIComponent(move.dance_style)}`)
      .then((res) => setThemes(res.data));
    client
      .get(`/collections?dance_style=${encodeURIComponent(move.dance_style)}`)
      .then((res) => {
        const defaultCol = (res.data as Collection[]).find((c) => c.is_default);
        if (defaultCol) setDefaultCollectionId(defaultCol.id);
      });
  }, [move?.dance_style]);

  const handleMediaUploaded = useCallback((media: Media) => {
    setMediaItems((prev) => [...prev, media]);
    // If this is the first media, backend auto-sets it as cover
    setMove((prev) => {
      if (prev && !prev.cover_media_id) {
        return { ...prev, cover_media_id: media.id };
      }
      return prev;
    });
  }, []);

  const handleMediaDeleted = useCallback((mediaId: string) => {
    setMediaItems((prev) => prev.filter((v) => v.id !== mediaId));
    // If deleted media was the cover, clear it
    setMove((prev) => {
      if (prev && prev.cover_media_id === mediaId) {
        return { ...prev, cover_media_id: null };
      }
      return prev;
    });
  }, []);

  const handleSetCover = useCallback((mediaId: string) => {
    setMove((prev) => (prev ? { ...prev, cover_media_id: mediaId } : prev));
  }, []);

  const handleMediaRenamed = useCallback((mediaId: string, newFilename: string) => {
    setMediaItems((prev) =>
      prev.map((v) => (v.id === mediaId ? { ...v, filename: newFilename } : v))
    );
  }, []);

  const handleDelete = async () => {
    if (!confirm("Delete this move? This cannot be undone.")) return;
    await client.delete(`/moves/${moveId}`);
    navigate("/");
  };

  // Filter themes not already assigned to this move
  const availableThemes = themes.filter(
    (t) => !moveThemes.some((mt) => mt.id === t.id)
  );

  // Filter suggestions based on input
  const filteredSuggestions = availableThemes.filter((t) =>
    t.name.toLowerCase().includes(themeInput.toLowerCase())
  );

  // Check if input matches an existing theme exactly
  const exactMatch = availableThemes.find(
    (t) => t.name.toLowerCase() === themeInput.toLowerCase()
  );

  const handleAddExistingTheme = async (theme: Theme) => {
    if (!moveId) return;
    await client.post(`/themes/${theme.id}/moves`, { move_id: moveId });
    setMoveThemes((prev) => [...prev, theme]);
    setThemeInput("");
    setShowSuggestions(false);
  };

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
    if (!move || !moveId || !pendingThemeName) return;
    try {
      const createRes = await client.post("/themes", {
        name: pendingThemeName,
        dance_style: move.dance_style as DanceStyle,
      });
      const newTheme = createRes.data;
      await client.post(`/themes/${newTheme.id}/moves`, { move_id: moveId });
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
    if (!moveId) return;
    await client.delete(`/themes/${themeId}/moves/${moveId}`);
    setMoveThemes((prev) => prev.filter((t) => t.id !== themeId));
  };

  if (!move) return <div className="loading">Loading...</div>;

  return (
    <div className="move-detail-page">
      <div className="move-detail-header">
        <h2>{move.name}</h2>
        <div className="move-detail-actions">
          {defaultCollectionId && (
            <Link to={`/collections/${defaultCollectionId}/graph?node=${moveId}`} className="btn btn-secondary">
              Graph View
            </Link>
          )}
          <Link to={`/moves/${moveId}/edit`} className="btn btn-secondary">
            Edit
          </Link>
          <button onClick={handleDelete} className="btn btn-danger">
            Delete
          </button>
        </div>
      </div>

      <p className="move-style">Style: {move.dance_style}</p>
      {move.description && <p className="move-description">{move.description}</p>}

      <CuesSection moveId={move.id} cues={cues} onCuesChange={setCues} />

      {/* Timing Section */}
      <div className="detail-section">
        <h4 className="detail-section-title">Timing</h4>
        <div className="move-stats">
          <div className="stat">
            <span className="stat-label">Type</span>
            <span className="stat-value">{move.is_state ? "State" : "Movement"}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Starting Beat</span>
            <span className="stat-value">{move.starting_beat ?? "—"}</span>
          </div>
          {!move.is_state && (
            <div className="stat">
              <span className="stat-label">Beat Count</span>
              <span className="stat-value">{move.beat_count}</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats Section - 2x2 grid: Difficulty, Leadability / Familiarity, Mental Availability */}
      <div className="detail-section">
        <h4 className="detail-section-title">Stats</h4>
        <div className="move-stats stats-grid">
          <div className="stat">
            <span className="stat-label">Difficulty</span>
            <span className="stat-value">{move.difficulty}/10</span>
          </div>
          <div className="stat">
            <span className="stat-label">Leadability</span>
            <span className="stat-value">{move.leadability !== null ? `${move.leadability}/10` : "—"}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Familiarity</span>
            <span className="stat-value">{move.familiarity}/10</span>
          </div>
          <div className="stat">
            <span className="stat-label">Mental Avail.</span>
            <span className="stat-value">{move.mental_availability !== null ? `${move.mental_availability}/10` : "—"}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Learn Priority</span>
            <span className="stat-value">{move.learning_priority !== null ? `${move.learning_priority}/10` : "—"}</span>
          </div>
        </div>
      </div>

      {/* Energy Section */}
      <div className="detail-section">
        <h4 className="detail-section-title">Energy</h4>
        <div className="move-stats">
          <div className="stat">
            <span className="stat-label">Impact</span>
            <span className="stat-value">{move.impact !== null ? `${move.impact}/10` : "—"}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Beat</span>
            <span className="stat-value">{move.beat_energy !== null ? `${move.beat_energy}/10` : "—"}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Moderna</span>
            <span className="stat-value">{move.moderna_energy !== null ? `${move.moderna_energy}/10` : "—"}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Sensual</span>
            <span className="stat-value">{move.sensual_energy !== null ? `${move.sensual_energy}/10` : "—"}</span>
          </div>
        </div>
      </div>

      {/* Key move badges */}
      {(move.key_egress || move.key_ingress || move.is_core) && (
        <div className="move-badges">
          {move.is_core && <span className="badge">Core</span>}
          {move.key_egress && <span className="badge">Key Egress</span>}
          {move.key_ingress && <span className="badge">Key Ingress</span>}
        </div>
      )}

      {/* Tags */}
      {move.tags.length > 0 && (
        <div className="move-tags">
          {move.tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Themes - tag-like UI */}
      <div className="move-themes-section">
        <h4>Themes</h4>
        <div className="themes-tag-container">
          {moveThemes.map((theme) => (
            <span key={theme.id} className="theme-tag">
              <Link to={`/themes/${theme.id}`}>{theme.name}</Link>
              <button
                className="theme-tag-remove"
                onClick={() => handleRemoveFromTheme(theme.id)}
                title="Remove from theme"
              >
                ×
              </button>
            </span>
          ))}
          <div className="theme-input-wrapper">
            <input
              ref={inputRef}
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

      {/* Styling Section */}
      <div className="detail-section">
        <h4 className="detail-section-title">Styling</h4>
        <div className="move-styling">
          <h5>Leader</h5>
          <p>{move.leader_styling || "—"}</p>
        </div>
        <div className="move-styling">
          <h5>Follower</h5>
          <p>{move.follower_styling || "—"}</p>
        </div>
      </div>

      {/* Learning Notes */}
      <div className="move-notes">
        <h4>Learning Notes</h4>
        <p>{move.learning_notes || "—"}</p>
      </div>

      <section className="move-section">
        <h3>Media ({mediaItems.length})</h3>
        <MediaUpload moveId={move.id} onUploaded={handleMediaUploaded} />
        <div className="media-grid">
          {mediaItems.map((media) => (
            <MediaPlayer
              key={media.id}
              media={media}
              moveId={move.id}
              isCover={move.cover_media_id === media.id}
              onDelete={handleMediaDeleted}
              onRenamed={handleMediaRenamed}
              onSetCover={handleSetCover}
            />
          ))}
        </div>
      </section>

      <section className="move-section">
        <h3>Connections</h3>
        <ConnectionList moveId={move.id} allMoves={allMoves} />
      </section>

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
