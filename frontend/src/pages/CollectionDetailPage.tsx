import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import client from "../api/client";
import type { CollectionWithMoves, Move, CollectionMoveAdd, Collection } from "../types";

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

  // Delete move modal state (for default collections)
  const [deleteMoveModal, setDeleteMoveModal] = useState<{
    moveId: string;
    moveName: string;
    affectedCollections: Collection[];
  } | null>(null);

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

  // For default collections: prepare to delete the move entirely
  const handleDeleteMoveFromDefault = async (moveId: string, moveName: string) => {
    // Fetch all collections to find which ones contain this move
    const collectionsRes = await client.get("/collections");
    const allCollections: Collection[] = collectionsRes.data;

    // Find collections that contain this move
    const affectedCollections: Collection[] = [];
    for (const col of allCollections) {
      const detailRes = await client.get(`/collections/${col.id}`);
      const detail: CollectionWithMoves = detailRes.data;
      if (detail.moves.some((m) => m.move_id === moveId)) {
        affectedCollections.push(col);
      }
    }

    setDeleteMoveModal({ moveId, moveName, affectedCollections });
  };

  // Confirm delete move entirely
  const confirmDeleteMove = async () => {
    if (!deleteMoveModal) return;
    await client.delete(`/moves/${deleteMoveModal.moveId}`);
    setDeleteMoveModal(null);
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

  // Filter moves to only show same dance style that aren't already in collection
  const moveIdsInCollection = new Set(collection.moves.map((m) => m.move_id));
  const eligibleMoves = availableMoves.filter(
    (m) =>
      m.dance_style === collection.dance_style &&
      !moveIdsInCollection.has(m.id)
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
              <button
                className="btn btn-secondary"
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
              {!collection.is_default && (
                <button className="btn btn-danger" onClick={handleDelete}>
                  Delete
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="collection-moves-section">
        <div className="section-header">
          <h3>Moves ({collection.moves.length})</h3>
          {!collection.is_default && (
            <button
              className="btn btn-secondary"
              onClick={() => setShowAddForm(!showAddForm)}
            >
              {showAddForm ? "Cancel" : "Add Move"}
            </button>
          )}
        </div>

        {showAddForm && !collection.is_default && (
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
                {collection.is_default ? (
                  <button
                    className="btn-icon btn-icon-danger"
                    onClick={() => handleDeleteMoveFromDefault(cm.move_id, cm.move_name)}
                    title="Delete move entirely"
                  >
                    &times;
                  </button>
                ) : (
                  <button
                    className="btn-icon"
                    onClick={() => handleRemoveMove(cm.move_id)}
                    title="Remove from collection"
                  >
                    &times;
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link to="/collections" className="back-link">
        &larr; Back to Collections
      </Link>

      {/* Delete Move Modal (for default collections) */}
      {deleteMoveModal && (
        <div className="modal-overlay" onClick={() => setDeleteMoveModal(null)}>
          <div className="modal modal-warning" onClick={(e) => e.stopPropagation()}>
            <h3>⚠️ Delete Move Entirely?</h3>
            <p>
              This will <strong>permanently delete</strong> the move "
              <strong>{deleteMoveModal.moveName}</strong>" and remove it from all
              collections.
            </p>
            {deleteMoveModal.affectedCollections.length > 0 && (
              <div className="affected-collections">
                <p>This move will be removed from:</p>
                <ul>
                  {deleteMoveModal.affectedCollections.map((col) => (
                    <li key={col.id}>
                      {col.name} ({col.dance_style})
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="warning-text">This action cannot be undone.</p>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setDeleteMoveModal(null)}
              >
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDeleteMove}>
                Delete Move
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
