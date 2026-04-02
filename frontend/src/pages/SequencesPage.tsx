import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import type { Collection, Sequence, SequenceCreate } from "../types";

export default function SequencesPage() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SequenceCreate>({
    collection_id: "",
    name: "",
    description: "",
  });
  const [saving, setSaving] = useState(false);
  const [filterCollectionId, setFilterCollectionId] = useState<string>("");

  useEffect(() => {
    Promise.all([
      client.get("/sequences"),
      client.get("/collections"),
    ]).then(([seqRes, colRes]) => {
      setSequences(seqRes.data);
      setCollections(colRes.data);
      if (colRes.data.length > 0 && !form.collection_id) {
        setForm((f) => ({ ...f, collection_id: colRes.data[0].id }));
      }
      setLoading(false);
    });
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.collection_id) return;
    setSaving(true);
    try {
      await client.post("/sequences", {
        ...form,
        description: form.description || null,
      });
      setForm({ ...form, name: "", description: "" });
      setShowForm(false);
      const res = await client.get("/sequences");
      setSequences(res.data);
    } finally {
      setSaving(false);
    }
  };

  const collectionMap = new Map(collections.map((c) => [c.id, c]));

  const filteredSequences = filterCollectionId
    ? sequences.filter((s) => s.collection_id === filterCollectionId)
    : sequences;

  if (loading) return <div className="loading">Loading sequences...</div>;

  return (
    <div className="sequences-page">
      <div className="page-header">
        <h2>Sequences</h2>
        <button
          className="btn btn-primary"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "Cancel" : "New Sequence"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="inline-form">
          <input
            type="text"
            placeholder="Sequence name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <select
            value={form.collection_id}
            onChange={(e) => setForm({ ...form, collection_id: e.target.value })}
            required
          >
            <option value="" disabled>Select collection...</option>
            {collections.map((col) => (
              <option key={col.id} value={col.id}>
                {col.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Description (optional)"
            value={form.description || ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <button type="submit" className="btn btn-primary" disabled={saving || !form.collection_id}>
            {saving ? "Creating..." : "Create"}
          </button>
        </form>
      )}

      <div className="filters">
        <select
          value={filterCollectionId}
          onChange={(e) => setFilterCollectionId(e.target.value)}
        >
          <option value="">All Collections</option>
          {collections.map((col) => (
            <option key={col.id} value={col.id}>
              {col.name}
            </option>
          ))}
        </select>
      </div>

      {filteredSequences.length === 0 ? (
        <div className="empty-state">
          {filterCollectionId
            ? "No sequences in this collection yet"
            : "No sequences yet. Create your first one!"}
        </div>
      ) : (
        <div className="list-grid">
          {filteredSequences.map((sequence) => {
            const col = collectionMap.get(sequence.collection_id);
            return (
              <Link
                key={sequence.id}
                to={`/sequences/${sequence.id}`}
                className="list-card"
              >
                <h3 className="list-card-name">{sequence.name}</h3>
                {col && <span className="list-card-style">{col.name}</span>}
                {sequence.description && (
                  <p className="list-card-description">{sequence.description}</p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
