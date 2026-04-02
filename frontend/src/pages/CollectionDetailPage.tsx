import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import client from "../api/client";
import type { CollectionWithMoves, Move, CollectionMoveAdd } from "../types";

export default function CollectionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [collection, setCollection] = useState<CollectionWithMoves | null>(null);
  const [availableMoves, setAvailableMoves] = useState<Move[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedMoveId, setSelectedMoveId] = useState("");
  const [moveNotes, setMoveNotes] = useState("");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "" });

  useEffect(() => {
    loadCollection();
    loadMoves();
  }, [id]);

  const loadCollection = async () => {
    try {
      const res = await client.get(`/collections/${id}`);
      setCollection(res.data);
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

    const payload: CollectionMoveAdd = {
      move_id: selectedMoveId,
      notes: moveNotes || null,
    };

    await client.post(`/collections/${id}/moves`, payload);
    setSelectedMoveId("");
    setMoveNotes("");
    setShowAddForm(false);
    loadCollection();
  };

  const handleRemoveMove = async (moveId: string) => {
    await client.delete(`/collections/${id}/moves/${moveId}`);
    loadCollection();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    await client.put(`/collections/${id}`, {
      name: editForm.name,
      description: editForm.description || null,
    });
    setEditing(false);
    loadCollection();
  };

  const handleDelete = async () => {
    if (!confirm("Delete this collection?")) return;
    await client.delete(`/collections/${id}`);
    navigate("/collections");
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (!collection) return <div className="loading">Collection not found</div>;

  // Filter moves that aren't already in collection
  const moveIdsInCollection = new Set(collection.moves.map((m) => m.move_id));
  const eligibleMoves = availableMoves.filter(
    (m) => !moveIdsInCollection.has(m.id)
  );

  return (
    <div className="collection-detail-page">
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
              <h2>{collection.name}</h2>
              <span className="detail-style">{collection.dance_style}</span>
              {collection.description && (
                <p className="detail-description">{collection.description}</p>
              )}
            </div>
            <div className="detail-actions">
              <Link to={`/collections/${id}/graph`} className="btn btn-primary">
                View Graph
              </Link>
              <Link to={`/collections/${id}/learn`} className="btn btn-secondary">
                Learn
              </Link>
              <Link to={`/collections/${id}/tags`} className="btn btn-secondary">
                Tags
              </Link>
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

      <div className="collection-moves-section">
        <div className="section-header">
          <h3>Moves ({collection.moves.length})</h3>
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
            <input
              type="text"
              placeholder="Notes (optional)"
              value={moveNotes}
              onChange={(e) => setMoveNotes(e.target.value)}
            />
            <button type="submit" className="btn btn-primary">
              Add
            </button>
          </form>
        )}

        {collection.moves.length === 0 ? (
          <div className="empty">No moves in this collection yet</div>
        ) : (
          <ul className="collection-moves-list">
            {collection.moves.map((cm) => (
              <li key={cm.id} className="collection-move-item">
                <Link to={`/moves/${cm.move_id}`} className="move-link">
                  {cm.move_name}
                </Link>
                {cm.notes && <span className="move-notes">{cm.notes}</span>}
                <button
                  className="btn-icon"
                  onClick={() => handleRemoveMove(cm.move_id)}
                  title="Remove from collection"
                >
                  &times;
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link to="/collections" className="back-link">
        &larr; Back to Collections
      </Link>
    </div>
  );
}
