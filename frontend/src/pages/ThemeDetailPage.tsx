import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import client from "../api/client";
import type { ThemeWithMoves, Move, ThemeMoveAdd } from "../types";

export default function ThemeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<ThemeWithMoves | null>(null);
  const [availableMoves, setAvailableMoves] = useState<Move[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedMoveId, setSelectedMoveId] = useState("");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "" });

  useEffect(() => {
    loadTheme();
    loadMoves();
  }, [id]);

  const loadTheme = async () => {
    try {
      const res = await client.get(`/themes/${id}`);
      setTheme(res.data);
      setEditForm({
        name: res.data.name,
        description: res.data.description || "",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadMoves = async () => {
    const res = await client.get("/moves");
    setAvailableMoves(res.data);
  };

  const handleAddMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMoveId) return;

    const payload: ThemeMoveAdd = {
      move_id: selectedMoveId,
    };

    await client.post(`/themes/${id}/moves`, payload);
    setSelectedMoveId("");
    setShowAddForm(false);
    loadTheme();
  };

  const handleRemoveMove = async (moveId: string) => {
    await client.delete(`/themes/${id}/moves/${moveId}`);
    loadTheme();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    await client.patch(`/themes/${id}`, {
      name: editForm.name,
      description: editForm.description || null,
    });
    setEditing(false);
    loadTheme();
  };

  const handleDelete = async () => {
    if (!confirm("Delete this theme?")) return;
    await client.delete(`/themes/${id}`);
    navigate("/themes");
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (!theme) return <div className="loading">Theme not found</div>;

  // Filter moves to only show same dance style that aren't already in theme
  const moveIdsInTheme = new Set(theme.moves.map((m) => m.move_id));
  const eligibleMoves = availableMoves.filter(
    (m) =>
      m.dance_style === theme.dance_style &&
      !moveIdsInTheme.has(m.id)
  );

  return (
    <div className="theme-detail-page">
      <div className="detail-header">
        {editing ? (
          <form onSubmit={handleUpdate} className="edit-form">
            <input
              type="text"
              value={editForm.name}
              onChange={(e) =>
                setEditForm({ ...editForm, name: e.target.value })
              }
              required
            />
            <input
              type="text"
              placeholder="Description"
              value={editForm.description}
              onChange={(e) =>
                setEditForm({ ...editForm, description: e.target.value })
              }
            />
            <button type="submit" className="btn btn-primary">
              Save
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </form>
        ) : (
          <>
            <div>
              <h2>{theme.name}</h2>
              <span className="detail-style">{theme.dance_style}</span>
              {theme.description && (
                <p className="detail-description">{theme.description}</p>
              )}
            </div>
            <div className="detail-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
              <button className="btn btn-danger" onClick={handleDelete}>
                Delete
              </button>
            </div>
          </>
        )}
      </div>

      <div className="theme-moves-section">
        <div className="section-header">
          <h3>Moves ({theme.moves.length})</h3>
          <button
            className="btn btn-secondary"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? "Cancel" : "Add Move"}
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleAddMove} className="inline-form">
            <select
              value={selectedMoveId}
              onChange={(e) => setSelectedMoveId(e.target.value)}
              required
            >
              <option value="">Select a move...</option>
              {eligibleMoves.map((move) => (
                <option key={move.id} value={move.id}>
                  {move.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary">
              Add
            </button>
          </form>
        )}

        {theme.moves.length === 0 ? (
          <div className="empty">No moves in this theme yet</div>
        ) : (
          <ul className="theme-moves-list">
            {theme.moves.map((tm) => (
              <li key={tm.id} className="theme-move-item">
                <Link to={`/moves/${tm.move_id}`} className="move-link">
                  {tm.move_name}
                </Link>
                <button
                  className="btn-icon"
                  onClick={() => handleRemoveMove(tm.move_id)}
                  title="Remove from theme"
                >
                  &times;
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link to="/themes" className="back-link">
        &larr; Back to Themes
      </Link>
    </div>
  );
}
