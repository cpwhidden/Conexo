import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import { DANCE_STYLES } from "../types";
import type { Sequence, SequenceCreate, DanceStyle } from "../types";

export default function SequencesPage() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SequenceCreate>({
    name: "",
    description: "",
    dance_style: "Salsa",
  });
  const [saving, setSaving] = useState(false);
  const [filterStyle, setFilterStyle] = useState<string>("");

  useEffect(() => {
    loadSequences();
  }, []);

  const loadSequences = async () => {
    try {
      const res = await client.get("/sequences");
      setSequences(res.data);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await client.post("/sequences", {
        ...form,
        description: form.description || null,
      });
      setForm({ name: "", description: "", dance_style: "Salsa" });
      setShowForm(false);
      loadSequences();
    } finally {
      setSaving(false);
    }
  };

  const filteredSequences = filterStyle
    ? sequences.filter((s) => s.dance_style === filterStyle)
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

      {filteredSequences.length === 0 ? (
        <div className="empty-state">
          {filterStyle
            ? `No ${filterStyle} sequences yet`
            : "No sequences yet. Create your first one!"}
        </div>
      ) : (
        <div className="list-grid">
          {filteredSequences.map((sequence) => (
            <Link
              key={sequence.id}
              to={`/sequences/${sequence.id}`}
              className="list-card"
            >
              <h3 className="list-card-name">{sequence.name}</h3>
              <span className="list-card-style">{sequence.dance_style}</span>
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
