import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import client from "../api/client";
import type { Collection, Sequence } from "../types";

export default function SequencesPage() {
  const { id } = useParams();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      client.get(`/collections/${id}`),
      client.get(`/sequences?collection_id=${id}`),
    ]).then(([colRes, seqRes]) => {
      setCollection(colRes.data);
      setSequences(seqRes.data);
      setLoading(false);
    });
  }, [id]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    try {
      await client.post("/sequences", {
        collection_id: id,
        name: formName,
        description: formDescription || null,
      });
      setFormName("");
      setFormDescription("");
      setShowForm(false);
      const res = await client.get(`/sequences?collection_id=${id}`);
      setSequences(res.data);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="sequences-page">
      <div className="page-header">
        <div>
          <Link to={`/collections/${id}/moves`} className="back-link">
            &larr; {collection?.name}
          </Link>
          <h2>Sequences</h2>
        </div>
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
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Creating..." : "Create"}
          </button>
        </form>
      )}

      {sequences.length === 0 ? (
        <div className="empty-state">
          No sequences yet. Create your first one!
        </div>
      ) : (
        <div className="list-grid">
          {sequences.map((sequence) => (
            <Link
              key={sequence.id}
              to={`/sequences/${sequence.id}`}
              className="list-card"
            >
              <h3 className="list-card-name">{sequence.name}</h3>
              {sequence.description && (
                <p className="list-card-description">{sequence.description}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
