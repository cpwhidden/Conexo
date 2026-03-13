import { useCallback, useEffect, useState } from "react";
import client from "../api/client";
import type { Connection, ConnectionCreate, Move } from "../types";

interface ConnectionListProps {
  moveId: string;
  allMoves: Move[];
}

export default function ConnectionList({
  moveId,
  allMoves,
}: ConnectionListProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [targetMoveId, setTargetMoveId] = useState("");
  const [label, setLabel] = useState("");
  const [flow, setFlow] = useState<number | null>(null);
  const [direction, setDirection] = useState<"outgoing" | "incoming">("outgoing");

  // Edit state
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null);
  const [editFlow, setEditFlow] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const loadConnections = useCallback(async () => {
    const res = await client.get(`/connections/by-move/${moveId}`);
    setConnections(res.data);
  }, [moveId]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const outgoing = connections.filter((c) => c.source_move_id === moveId);
  const incoming = connections.filter((c) => c.target_move_id === moveId);

  const getMoveName = (id: string) =>
    allMoves.find((m) => m.id === id)?.name ?? "Unknown";

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetMoveId) return;

    const body: ConnectionCreate =
      direction === "outgoing"
        ? { source_move_id: moveId, target_move_id: targetMoveId, label: label || null, flow }
        : { source_move_id: targetMoveId, target_move_id: moveId, label: label || null, flow };

    await client.post("/connections", body);
    setShowForm(false);
    setTargetMoveId("");
    setLabel("");
    setFlow(null);
    loadConnections();
  };

  const handleDelete = async (id: string) => {
    await client.delete(`/connections/${id}`);
    loadConnections();
  };

  const startEdit = (c: Connection) => {
    setEditingConnectionId(c.id);
    setEditFlow(c.flow);
    setEditLabel(c.label || "");
  };

  const cancelEdit = () => {
    setEditingConnectionId(null);
    setEditFlow(null);
    setEditLabel("");
  };

  const saveEdit = async () => {
    if (!editingConnectionId) return;
    await client.put(`/connections/${editingConnectionId}`, {
      flow: editFlow,
      label: editLabel || null,
    });
    setEditingConnectionId(null);
    setEditFlow(null);
    setEditLabel("");
    loadConnections();
  };

  const otherMoves = allMoves.filter((m) => m.id !== moveId);

  const renderConnection = (c: Connection, showTarget: boolean) => {
    const connectedMoveId = showTarget ? c.target_move_id : c.source_move_id;
    const isEditing = editingConnectionId === c.id;

    if (isEditing) {
      return (
        <li key={c.id} className="connection-item connection-item-editing">
          <div className="connection-edit-form">
            <span className="connection-name">{getMoveName(connectedMoveId)}</span>
            <input
              type="text"
              placeholder="Label (optional)"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              className="connection-edit-label"
            />
            <div className="connection-edit-flow">
              <span className="flow-label-text">Flow:</span>
              <div className="slider-row compact">
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={editFlow ?? 5}
                  onChange={(e) => setEditFlow(parseInt(e.target.value))}
                />
                <span className="range-value">{editFlow ?? "—"}</span>
                {editFlow !== null ? (
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => setEditFlow(null)}
                    title="Clear"
                  >
                    &times;
                  </button>
                ) : (
                  <span className="btn-icon-placeholder" />
                )}
              </div>
            </div>
            <div className="connection-edit-actions">
              <button className="btn btn-primary btn-sm" onClick={saveEdit}>
                Save
              </button>
              <button className="btn btn-secondary btn-sm" onClick={cancelEdit}>
                Cancel
              </button>
            </div>
          </div>
        </li>
      );
    }

    return (
      <li key={c.id} className="connection-item">
        <div className="connection-info" onClick={() => startEdit(c)} title="Click to edit">
          <span className="connection-name">{getMoveName(connectedMoveId)}</span>
          {c.label && <span className="conn-label">({c.label})</span>}
          {c.flow !== null && (
            <span className="conn-flow" title="Flow">
              Flow: {c.flow}/10
            </span>
          )}
        </div>
        <button
          onClick={() => handleDelete(c.id)}
          className="btn-icon"
          title="Remove"
        >
          &times;
        </button>
      </li>
    );
  };

  return (
    <div className="connection-list">
      <div className="connection-section">
        <h4>Leads into:</h4>
        {outgoing.length === 0 ? (
          <p className="empty">No outgoing connections</p>
        ) : (
          <ul>
            {outgoing.map((c) => renderConnection(c, true))}
          </ul>
        )}
      </div>
      <div className="connection-section">
        <h4>Comes from:</h4>
        {incoming.length === 0 ? (
          <p className="empty">No incoming connections</p>
        ) : (
          <ul>
            {incoming.map((c) => renderConnection(c, false))}
          </ul>
        )}
      </div>
      {showForm ? (
        <form onSubmit={handleAdd} className="connection-form">
          <select
            value={direction}
            onChange={(e) =>
              setDirection(e.target.value as "outgoing" | "incoming")
            }
          >
            <option value="outgoing">This move leads into...</option>
            <option value="incoming">This move comes from...</option>
          </select>
          <select
            value={targetMoveId}
            onChange={(e) => setTargetMoveId(e.target.value)}
            required
          >
            <option value="">Select a move</option>
            {otherMoves.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <div className="flow-input-row">
            <label className="flow-label">
              Flow (0-10)
              <div className="slider-row compact">
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={flow ?? 5}
                  onChange={(e) => setFlow(parseInt(e.target.value))}
                />
                <span className="range-value">{flow ?? "—"}</span>
                {flow !== null ? (
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => setFlow(null)}
                    title="Clear"
                  >
                    &times;
                  </button>
                ) : (
                  <span className="btn-icon-placeholder" />
                )}
              </div>
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setFlow(null);
              }}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="btn btn-secondary"
        >
          Add Connection
        </button>
      )}
    </div>
  );
}
