import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import { DANCE_STYLES } from "../types";
import type { Collection, CollectionCreate, DanceStyle, Sequence } from "../types";

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CollectionCreate>({
    name: "",
    description: "",
    dance_style: "Salsa",
  });
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [filterStyle, setFilterStyle] = useState<string>("");

  useEffect(() => {
    loadCollections();
  }, []);

  const loadCollections = async () => {
    try {
      const [colRes, seqRes] = await Promise.all([
        client.get("/collections"),
        client.get("/sequences"),
      ]);
      setCollections(colRes.data);
      setSequences(seqRes.data);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setCreateError(null);
    try {
      await client.post("/collections", {
        ...form,
        description: form.description || null,
      });
      setForm({ name: "", description: "", dance_style: "Salsa" });
      setShowForm(false);
      loadCollections();
    } catch (err: any) {
      setCreateError(
        err.response?.data?.detail ?? "Could not create collection. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  // Sequence counts per collection
  const seqCountMap = new Map<string, number>();
  for (const seq of sequences) {
    seqCountMap.set(seq.collection_id, (seqCountMap.get(seq.collection_id) || 0) + 1);
  }

  // Apply filter
  const filteredCollections = filterStyle
    ? collections.filter((c) => c.dance_style === filterStyle)
    : collections;

  if (loading) return <div className="loading">Loading collections...</div>;

  return (
    <div className="collections-page">
      <div className="page-header">
        <h2>Collections</h2>
        <button
          className="btn btn-primary"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "Cancel" : "New Collection"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="inline-form">
          <input
            type="text"
            placeholder="Collection name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <select
            value={form.dance_style}
            onChange={(e) =>
              setForm({ ...form, dance_style: e.target.value as DanceStyle })
            }
          >
            {DANCE_STYLES.map((style) => (
              <option key={style} value={style}>
                {style}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Description (optional)"
            value={form.description || ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Creating..." : "Create"}
          </button>
          {createError && <div className="error-message">{createError}</div>}
        </form>
      )}

      <div className="filters">
        <select
          value={filterStyle}
          onChange={(e) => setFilterStyle(e.target.value)}
        >
          <option value="">All Styles</option>
          {DANCE_STYLES.map((style) => (
            <option key={style} value={style}>
              {style}
            </option>
          ))}
        </select>
      </div>

      {filteredCollections.length === 0 ? (
        <div className="empty-state">
          {filterStyle
            ? `No ${filterStyle} collections yet`
            : "No collections yet. Create your first one!"}
        </div>
      ) : (
        <div className="list-grid">
          {filteredCollections.map((collection) => {
            const seqCount = seqCountMap.get(collection.id) || 0;
            return (
              <div key={collection.id} className="list-card">
                <Link to={`/collections/${collection.id}`} className="list-card-link">
                  <h3 className="list-card-name">{collection.name}</h3>
                  <span className="list-card-style">{collection.dance_style}</span>
                  {collection.description && (
                    <p className="list-card-description">{collection.description}</p>
                  )}
                </Link>
                <div className="list-card-footer">
                  <span className="list-card-meta">{collection.move_count} moves</span>
                  <Link
                    to={`/collections/${collection.id}/sequences`}
                    className="list-card-seq-link"
                    title={`${seqCount} sequence${seqCount !== 1 ? "s" : ""}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="8" y1="6" x2="21" y2="6" />
                      <line x1="8" y1="12" x2="21" y2="12" />
                      <line x1="8" y1="18" x2="21" y2="18" />
                      <line x1="3" y1="6" x2="3.01" y2="6" />
                      <line x1="3" y1="12" x2="3.01" y2="12" />
                      <line x1="3" y1="18" x2="3.01" y2="18" />
                    </svg>
                    {seqCount > 0 && <span className="list-card-seq-count">{seqCount}</span>}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
