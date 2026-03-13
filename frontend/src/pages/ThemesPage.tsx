import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import { DANCE_STYLES } from "../types";
import type { Theme, ThemeCreate, DanceStyle } from "../types";

export default function ThemesPage() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ThemeCreate>({
    name: "",
    description: "",
    dance_style: "Salsa",
  });
  const [saving, setSaving] = useState(false);
  const [filterStyle, setFilterStyle] = useState<string>("");

  useEffect(() => {
    loadThemes();
  }, []);

  const loadThemes = async () => {
    try {
      const res = await client.get("/themes");
      setThemes(res.data);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await client.post("/themes", {
        ...form,
        description: form.description || null,
      });
      setForm({ name: "", description: "", dance_style: "Salsa" });
      setShowForm(false);
      loadThemes();
    } finally {
      setSaving(false);
    }
  };

  const filteredThemes = filterStyle
    ? themes.filter((t) => t.dance_style === filterStyle)
    : themes;

  if (loading) return <div className="loading">Loading themes...</div>;

  return (
    <div className="themes-page">
      <div className="page-header">
        <h2>Themes</h2>
        <button
          className="btn btn-primary"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "Cancel" : "New Theme"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="inline-form">
          <input
            type="text"
            placeholder="Theme name"
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

      {filteredThemes.length === 0 ? (
        <div className="empty-state">
          {filterStyle
            ? `No ${filterStyle} themes yet`
            : "No themes yet. Create your first one!"}
        </div>
      ) : (
        <div className="list-grid">
          {filteredThemes.map((theme) => (
            <Link
              key={theme.id}
              to={`/themes/${theme.id}`}
              className="list-card"
            >
              <h3 className="list-card-name">{theme.name}</h3>
              <span className="list-card-style">{theme.dance_style}</span>
              <span className="list-card-count">{theme.move_count} moves</span>
              {theme.description && (
                <p className="list-card-description">{theme.description}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
