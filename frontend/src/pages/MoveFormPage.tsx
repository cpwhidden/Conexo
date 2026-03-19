import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import client from "../api/client";
import { DANCE_STYLES } from "../types";
import type { DanceStyle, MoveCreate } from "../types";

export default function MoveFormPage() {
  const { moveId } = useParams();
  const navigate = useNavigate();
  const isEditing = !!moveId;

  const [form, setForm] = useState<MoveCreate>({
    name: "",
    description: "",
    beat_count: 4,
    difficulty: 5,
    familiarity: 1,
    tags: [],
    dance_style: "Salsa",
    starting_beat: 1,
    is_state: false,
    key_egress: false,
    key_ingress: false,
    is_core: false,
    leadability: null,
    mental_availability: null,
    beat_energy: null,
    moderna_energy: null,
    sensual_energy: null,
    impact: null,
    learning_priority: null,
    leader_styling: null,
    follower_styling: null,
    learning_notes: null,
  });
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!moveId) return;
    client.get(`/moves/${moveId}`).then((res) => {
      const m = res.data;
      setForm({
        name: m.name,
        description: m.description || "",
        beat_count: m.beat_count,
        difficulty: m.difficulty,
        familiarity: m.familiarity,
        tags: m.tags,
        dance_style: m.dance_style,
        starting_beat: m.starting_beat,
        is_state: m.is_state,
        key_egress: m.key_egress,
        key_ingress: m.key_ingress,
        is_core: m.is_core,
        leadability: m.leadability,
        mental_availability: m.mental_availability,
        beat_energy: m.beat_energy,
        moderna_energy: m.moderna_energy,
        sensual_energy: m.sensual_energy,
        impact: m.impact,
        learning_priority: m.learning_priority,
        leader_styling: m.leader_styling,
        follower_styling: m.follower_styling,
        learning_notes: m.learning_notes,
      });
    });
  }, [moveId]);

  const handleIsStateChange = (checked: boolean) => {
    if (checked) {
      setForm({ ...form, is_state: true, beat_count: 0 });
    } else {
      setForm({ ...form, is_state: false, beat_count: 4 });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        description: form.description || null,
        leader_styling: form.leader_styling || null,
        follower_styling: form.follower_styling || null,
        learning_notes: form.learning_notes || null,
      };
      if (isEditing) {
        await client.put(`/moves/${moveId}`, payload);
        navigate(`/moves/${moveId}`);
      } else {
        const res = await client.post("/moves", payload);
        navigate(`/moves/${res.data.id}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !form.tags?.includes(tag)) {
      setForm({ ...form, tags: [...(form.tags || []), tag] });
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setForm({ ...form, tags: (form.tags || []).filter((t) => t !== tag) });
  };

  const renderOptionalSlider = (
    label: string,
    field: "leadability" | "mental_availability" | "beat_energy" | "moderna_energy" | "sensual_energy" | "impact" | "learning_priority",
  ) => {
    const value = form[field];
    return (
      <label>
        {label} (0-10)
        <div className="slider-row">
          <input
            type="range"
            min={0}
            max={10}
            value={value ?? 5}
            onChange={(e) =>
              setForm({ ...form, [field]: parseInt(e.target.value) })
            }
          />
          <span className="range-value">{value ?? "—"}</span>
          {value !== null && value !== undefined ? (
            <button
              type="button"
              className="btn-icon"
              onClick={() => setForm({ ...form, [field]: null })}
              title="Clear"
            >
              &times;
            </button>
          ) : (
            <span className="btn-icon-placeholder" />
          )}
        </div>
      </label>
    );
  };

  return (
    <div className="move-form-page">
      <h2>{isEditing ? "Edit Move" : "New Move"}</h2>
      <form onSubmit={handleSubmit} className="move-form">
        {/* Core Identity */}
        <label>
          Name *
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </label>
        <label>
          Description
          <textarea
            value={form.description || ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
          />
        </label>
        <label>
          Dance Style *
          {isEditing ? (
            <input type="text" value={form.dance_style} disabled />
          ) : (
            <select
              value={form.dance_style}
              onChange={(e) =>
                setForm({ ...form, dance_style: e.target.value as DanceStyle })
              }
              required
            >
              {DANCE_STYLES.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          )}
        </label>

        {/* Timing */}
        <div className="form-section">
          <div className="form-section-title">Timing</div>
          <div className="segmented-control move-type-control">
            <button
              type="button"
              className={!form.is_state ? "active" : ""}
              onClick={() => handleIsStateChange(false)}
            >
              Movement
            </button>
            <button
              type="button"
              className={form.is_state ? "active" : ""}
              onClick={() => handleIsStateChange(true)}
            >
              State
            </button>
          </div>
          <label>
            Starting Beat (1-8) *
            <input
              type="number"
              min={1}
              max={8}
              value={form.starting_beat ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  starting_beat: e.target.value
                    ? parseInt(e.target.value)
                    : null,
                })
              }
              required
            />
          </label>
          <label>
            Beat Count {!form.is_state && "*"}
            <input
              type="number"
              min={form.is_state ? 0 : 1}
              value={form.beat_count}
              onChange={(e) =>
                setForm({
                  ...form,
                  beat_count: parseInt(e.target.value) || 0,
                })
              }
              disabled={form.is_state}
              required
            />
          </label>
        </div>

        {/* Stats - reordered: Difficulty, Leadability, Familiarity, Mental Availability */}
        <div className="form-section">
          <div className="form-section-title">Stats</div>
          <label>
            Difficulty (0-10) *
            <div className="slider-row">
              <input
                type="range"
                min={0}
                max={10}
                value={form.difficulty}
                onChange={(e) =>
                  setForm({ ...form, difficulty: parseInt(e.target.value) })
                }
              />
              <span className="range-value">{form.difficulty}</span>
              <span className="btn-icon-placeholder" />
            </div>
          </label>
          {renderOptionalSlider("Leadability", "leadability")}
          <label>
            Familiarity (0-10) *
            <div className="slider-row">
              <input
                type="range"
                min={0}
                max={10}
                value={form.familiarity}
                onChange={(e) =>
                  setForm({ ...form, familiarity: parseInt(e.target.value) })
                }
              />
              <span className="range-value">{form.familiarity}</span>
              <span className="btn-icon-placeholder" />
            </div>
          </label>
          {renderOptionalSlider("Mental Availability", "mental_availability")}
          {renderOptionalSlider("Learning Priority", "learning_priority")}
        </div>

        {/* Energy */}
        <div className="form-section">
          <div className="form-section-title">Energy</div>
          {renderOptionalSlider("Impact", "impact")}
          {renderOptionalSlider("Beat Energy", "beat_energy")}
          {renderOptionalSlider("Moderna Energy", "moderna_energy")}
          {renderOptionalSlider("Sensual Energy", "sensual_energy")}
        </div>

        {/* Key Move Flags */}
        <div className="form-section">
          <div className="form-section-title">Key Move Flags</div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={form.key_egress || false}
              onChange={(e) =>
                setForm({ ...form, key_egress: e.target.checked })
              }
            />
            Key Egress (many successive moves)
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={form.key_ingress || false}
              onChange={(e) =>
                setForm({ ...form, key_ingress: e.target.checked })
              }
            />
            Key Ingress (many preceding moves)
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={form.is_core || false}
              onChange={(e) =>
                setForm({ ...form, is_core: e.target.checked })
              }
            />
            Core Move
          </label>
        </div>

        {/* Styling */}
        <div className="form-section">
          <div className="form-section-title">Styling</div>
          <label>
            Leader Styling
            <textarea
              value={form.leader_styling || ""}
              onChange={(e) =>
                setForm({ ...form, leader_styling: e.target.value })
              }
              maxLength={300}
              rows={2}
              placeholder="Notes on leader styling..."
            />
            <span className="char-count">
              {(form.leader_styling || "").length}/300
            </span>
          </label>
          <label>
            Follower Styling
            <textarea
              value={form.follower_styling || ""}
              onChange={(e) =>
                setForm({ ...form, follower_styling: e.target.value })
              }
              maxLength={300}
              rows={2}
              placeholder="Notes on follower styling..."
            />
            <span className="char-count">
              {(form.follower_styling || "").length}/300
            </span>
          </label>
        </div>

        {/* Learning Notes */}
        <div className="form-section">
          <div className="form-section-title">Notes</div>
          <label>
            Learning Notes
            <textarea
              value={form.learning_notes || ""}
              onChange={(e) =>
                setForm({ ...form, learning_notes: e.target.value })
              }
              rows={3}
              placeholder="Issues to work out or ask a teacher about..."
            />
          </label>
        </div>

        {/* Tags */}
        <div className="tag-input-group">
          <label>Tags</label>
          <div className="tag-input-row">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="Add a tag and press Enter"
            />
            <button type="button" onClick={addTag} className="btn btn-secondary">
              Add
            </button>
          </div>
          <div className="tags-display">
            {form.tags?.map((tag) => (
              <span key={tag} className="tag">
                {tag}
                <button type="button" onClick={() => removeTag(tag)}>
                  &times;
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : isEditing ? "Update Move" : "Create Move"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate(-1)}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
