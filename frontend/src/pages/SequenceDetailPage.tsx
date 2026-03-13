import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import client from "../api/client";
import type { SequenceWithEntries, Move, SequenceMoveAdd, Connection } from "../types";

export default function SequenceDetailPage() {
  const { sequenceId } = useParams();
  const navigate = useNavigate();
  const [sequence, setSequence] = useState<SequenceWithEntries | null>(null);
  const [availableMoves, setAvailableMoves] = useState<Move[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addMode, setAddMode] = useState<"move" | "custom">("move");
  const [selectedMoveId, setSelectedMoveId] = useState("");
  const [customName, setCustomName] = useState("");
  const [customBeats, setCustomBeats] = useState(8);
  const [entryNotes, setEntryNotes] = useState("");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSequence();
    loadMoves();
    loadConnections();
  }, [sequenceId]);

  const loadSequence = async () => {
    try {
      const res = await client.get(`/sequences/${sequenceId}`);
      setSequence(res.data);
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

  const loadConnections = async () => {
    const res = await client.get("/connections");
    setConnections(res.data);
  };

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sequence) return;

    const nextPosition = sequence.entries.length + 1;
    const payload: SequenceMoveAdd = {
      position: nextPosition,
      notes: entryNotes || null,
    };

    if (addMode === "move") {
      if (!selectedMoveId) return;
      payload.move_id = selectedMoveId;
    } else {
      if (!customName) return;
      payload.custom_name = customName;
      payload.custom_beat_count = customBeats;
    }

    try {
      setError(null);
      await client.post(`/sequences/${sequenceId}/entries`, payload);
      resetAddForm();
      loadSequence();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(detail || "Failed to add entry");
    }
  };

  const resetAddForm = () => {
    setSelectedMoveId("");
    setCustomName("");
    setCustomBeats(8);
    setEntryNotes("");
    setShowAddForm(false);
  };

  const handleRemoveEntry = async (entryId: string) => {
    await client.delete(`/sequences/${sequenceId}/entries/${entryId}`);
    loadSequence();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    await client.put(`/sequences/${sequenceId}`, {
      name: editForm.name,
      description: editForm.description || null,
    });
    setEditing(false);
    loadSequence();
  };

  const handleDelete = async () => {
    if (!confirm("Delete this sequence?")) return;
    await client.delete(`/sequences/${sequenceId}`);
    navigate("/sequences");
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (!sequence) return <div className="loading">Sequence not found</div>;

  // Filter moves to same dance style
  const eligibleMoves = availableMoves.filter(
    (m) => m.dance_style === sequence.dance_style
  );

  // Find the last move entry (not custom) in the sequence
  const sortedEntries = [...sequence.entries].sort((a, b) => a.position - b.position);
  const lastMoveEntry = [...sortedEntries].reverse().find((e) => e.move_id !== null);
  const lastMoveId = lastMoveEntry?.move_id;

  // Get set of move IDs that have valid connections from the last move
  const validNextMoveIds = new Set(
    connections
      .filter((c) => c.source_move_id === lastMoveId)
      .map((c) => c.target_move_id)
  );

  // Split eligible moves into connected and unconnected
  const connectedMoves = lastMoveId
    ? eligibleMoves.filter((m) => validNextMoveIds.has(m.id))
    : eligibleMoves; // If no last move, all are valid
  const unconnectedMoves = lastMoveId
    ? eligibleMoves.filter((m) => !validNextMoveIds.has(m.id))
    : [];

  return (
    <div className="sequence-detail-page">
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
              <h2>{sequence.name}</h2>
              <span className="detail-style">{sequence.dance_style}</span>
              <span className="detail-beats">{sequence.total_beats} beats</span>
              {sequence.description && (
                <p className="detail-description">{sequence.description}</p>
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

      <div className="sequence-entries-section">
        <div className="section-header">
          <h3>Entries ({sequence.entries.length})</h3>
          <button
            className="btn btn-secondary"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? "Cancel" : "Add Entry"}
          </button>
        </div>

        {showAddForm && (
          <div className="add-entry-form">
            {error && <div className="error-message">{error}</div>}
            <div className="add-mode-toggle">
              <label>
                <input
                  type="radio"
                  checked={addMode === "move"}
                  onChange={() => setAddMode("move")}
                />
                Existing Move
              </label>
              <label>
                <input
                  type="radio"
                  checked={addMode === "custom"}
                  onChange={() => setAddMode("custom")}
                />
                Custom Entry
              </label>
            </div>

            <form onSubmit={handleAddEntry} className="inline-form">
              {addMode === "move" ? (
                <select
                  value={selectedMoveId}
                  onChange={(e) => setSelectedMoveId(e.target.value)}
                  required
                >
                  <option value="">Select a move...</option>
                  {connectedMoves.length > 0 && (
                    <optgroup label="Valid connections">
                      {connectedMoves.map((move) => (
                        <option key={move.id} value={move.id}>
                          {move.name} ({move.beat_count} beats)
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {unconnectedMoves.length > 0 && (
                    <optgroup label="No connection defined">
                      {unconnectedMoves.map((move) => (
                        <option
                          key={move.id}
                          value={move.id}
                          className="option-unconnected"
                        >
                          {move.name} ({move.beat_count} beats)
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="Custom entry name"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    required
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="Beats"
                    value={customBeats}
                    onChange={(e) => setCustomBeats(parseInt(e.target.value) || 0)}
                    style={{ width: "80px" }}
                  />
                </>
              )}
              <input
                type="text"
                placeholder="Notes (optional)"
                value={entryNotes}
                onChange={(e) => setEntryNotes(e.target.value)}
              />
              <button type="submit" className="btn btn-primary">
                Add
              </button>
            </form>
          </div>
        )}

        {sequence.entries.length === 0 ? (
          <div className="empty">No entries in this sequence yet</div>
        ) : (
          <ol className="sequence-entries-list">
            {sequence.entries
              .sort((a, b) => a.position - b.position)
              .map((entry) => (
                <li key={entry.id} className="sequence-entry-item">
                  <span className="entry-position">{entry.position}.</span>
                  {entry.move_id ? (
                    <Link to={`/moves/${entry.move_id}`} className="move-link">
                      {entry.move_name}
                    </Link>
                  ) : (
                    <span className="custom-entry">{entry.custom_name}</span>
                  )}
                  <span className="entry-beats">{entry.beat_count} beats</span>
                  {entry.notes && (
                    <span className="entry-notes">{entry.notes}</span>
                  )}
                  <button
                    className="btn-icon"
                    onClick={() => handleRemoveEntry(entry.id)}
                    title="Remove entry"
                  >
                    &times;
                  </button>
                </li>
              ))}
          </ol>
        )}
      </div>

      <Link to="/sequences" className="back-link">
        &larr; Back to Sequences
      </Link>
    </div>
  );
}
