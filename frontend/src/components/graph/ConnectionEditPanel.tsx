import { useState, useEffect } from "react";
import type { Connection, Move } from "../../types";
import client from "../../api/client";
import ConfirmModal from "../ConfirmModal";

interface ConnectionEditPanelProps {
  connection: Connection;
  moves: Move[];
  onSave: (updatedConnection: Connection) => void;
  onDelete: (connectionId: string) => void;
  onClose: () => void;
  closing?: boolean;
}

export default function ConnectionEditPanel({
  connection,
  moves,
  onSave,
  onDelete,
  onClose,
  closing,
}: ConnectionEditPanelProps) {
  const [label, setLabel] = useState(connection.label || "");
  const [flow, setFlow] = useState<number | null>(connection.flow);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Reset form when connection changes
  useEffect(() => {
    setLabel(connection.label || "");
    setFlow(connection.flow);
  }, [connection]);

  const sourceMove = moves.find((m) => m.id === connection.source_move_id);
  const targetMove = moves.find((m) => m.id === connection.target_move_id);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await client.put(`/connections/${connection.id}`, {
        label: label || null,
        flow,
      });
      onSave(res.data);
      onClose();
    } catch (err) {
      console.error("Failed to save connection:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await client.delete(`/connections/${connection.id}`);
      onDelete(connection.id);
      onClose();
    } catch (err) {
      console.error("Failed to delete connection:", err);
    }
  };

  return (
    <div className={`slide-panel connection-edit-panel ${closing ? "closing" : ""}`}>
      <div className="slide-panel-header">
        <h3>Edit Connection</h3>
        <button className="btn-icon" onClick={onClose} title="Close">
          &times;
        </button>
      </div>

      <div className="slide-panel-content">
        <div className="connection-summary">
          <div className="connection-move">
            <span className="connection-label">From:</span>
            <span className="connection-move-name">{sourceMove?.name || "Unknown"}</span>
          </div>
          <div className="connection-arrow">→</div>
          <div className="connection-move">
            <span className="connection-label">To:</span>
            <span className="connection-move-name">{targetMove?.name || "Unknown"}</span>
          </div>
        </div>

        <div className="form-group">
          <label>
            Flow (0-10)
            <div className="slider-row">
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
          <p className="field-hint">
            How smoothly does this transition flow? Higher = more natural.
          </p>
        </div>

        <div className="form-group">
          <label>
            Label
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Optional label for this connection"
            />
          </label>
        </div>

        <div className="slide-panel-actions">
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            className="btn btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="btn btn-danger"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={saving}
          >
            Delete
          </button>
        </div>
      </div>

      {showDeleteConfirm && (
        <ConfirmModal
          title="Delete Connection"
          message={`Delete the connection from "${sourceMove?.name}" to "${targetMove?.name}"?`}
          confirmLabel="Delete"
          confirmVariant="danger"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
