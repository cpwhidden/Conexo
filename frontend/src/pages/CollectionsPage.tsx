import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import { DANCE_STYLES } from "../types";
import type { Collection, CollectionCreate, DanceStyle } from "../types";

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CollectionCreate>({
    name: "",
    description: "",
    dance_style: "Salsa",
  });
  const [saving, setSaving] = useState(false);
  const [filterStyle, setFilterStyle] = useState<string>("");

  useEffect(() => {
    loadCollections();
  }, []);

  const loadCollections = async () => {
    try {
      const res = await client.get("/collections");
      setCollections(res.data);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await client.post("/collections", {
        ...form,
        description: form.description || null,
      });
      setForm({ name: "", description: "", dance_style: "Salsa" });
      setShowForm(false);
      loadCollections();
    } finally {
      setSaving(false);
    }
  };

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
          {filteredCollections.map((collection) => (
            <Link
              key={collection.id}
              to={`/collections/${collection.id}`}
              className="list-card"
            >
              <h3 className="list-card-name">{collection.name}</h3>
              <span className="list-card-style">{collection.dance_style}</span>
              {collection.description && (
                <p className="list-card-description">{collection.description}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
