import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import ConfirmModal from "../components/ConfirmModal";
import type { AllowedEmail } from "../types";

export default function AdminAllowedEmailsPage() {
  const [emails, setEmails] = useState<AllowedEmail[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AllowedEmail | null>(null);

  useEffect(() => {
    client
      .get("/admin/allowed-emails")
      .then((res) => setEmails(res.data))
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    setError(null);
    try {
      const res = await client.post("/admin/allowed-emails", { email });
      setEmails((prev) => [...prev, res.data].sort((a, b) => a.email.localeCompare(b.email)));
      setNewEmail("");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to add email");
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteConfirm) return;
    await client.delete(`/admin/allowed-emails/${deleteConfirm.id}`);
    setEmails((prev) => prev.filter((e) => e.id !== deleteConfirm.id));
    setDeleteConfirm(null);
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <Link to="/" className="back-link">&larr; Home</Link>
        <h2>Allowed Emails</h2>
        <p className="page-header-meta">
          Only these email addresses can sign up. Existing users are not affected.
        </p>
      </div>

      <div className="tag-manager-create">
        <input
          type="email"
          placeholder="user@example.com"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
        />
        <button
          className="btn btn-primary"
          onClick={handleAdd}
          disabled={!newEmail.trim()}
        >
          Add
        </button>
      </div>

      {error && <p style={{ color: "#e94560", margin: "0.5rem 0" }}>{error}</p>}

      {emails.length === 0 ? (
        <p className="empty-state">No emails allowed yet. Add one above.</p>
      ) : (
        <div className="tag-manager-list">
          {emails.map((entry) => (
            <div key={entry.id} className="tag-manager-item">
              <span className="tag-manager-name">{entry.email}</span>
              <button
                className="btn-icon btn-danger-icon"
                onClick={() => setDeleteConfirm(entry)}
                title="Remove"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {deleteConfirm && (
        <ConfirmModal
          title="Remove Email"
          message={
            <p>
              Remove <strong>{deleteConfirm.email}</strong> from the allowed list?
              They won't be able to sign up if they don't have an account yet.
            </p>
          }
          confirmLabel="Remove"
          confirmVariant="danger"
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}
