import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import client from "../api/client";
import CuesSection from "../components/CuesSection";
import TagEditor from "../components/TagEditor";
import type { Collection, Cue, MoveCreate } from "../types";

export default function MoveFormPage() {
  const { moveId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEditing = !!moveId;

  // Optional collection_id from URL params (e.g., when creating from a collection context)
  const collectionIdFromUrl = searchParams.get("collection_id");

  const [form, setForm] = useState<MoveCreate>({
    name: "",
    description: "",
    beat_count: 4,
    difficulty: null,
    familiarity: null,
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
    date_learned: null,
    learning_notes: null,
    collection_id: collectionIdFromUrl || undefined,
  });
  const [cues, setCues] = useState<Cue[]>([]);
  const [moveCollections, setMoveCollections] = useState<Collection[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!moveId) return;
    client.get(`/moves/${moveId}/cues`).then((res) => setCues(res.data));
    client.get(`/collections/by-move/${moveId}`).then((res) => setMoveCollections(res.data));
    client.get(`/moves/${moveId}`).then((res) => {
      const m = res.data;
      setForm({
        name: m.name,
        description: m.description || "",
        beat_count: m.beat_count,
        difficulty: m.difficulty,
        familiarity: m.familiarity,
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
        date_learned: m.date_learned,
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
        // Bulk-create cues for new move
        for (const cue of cues) {
          await client.post(`/moves/${res.data.id}/cues`, {
            beat: cue.beat,
            person: cue.person,
            body_part: cue.body_part,
            description: cue.description,
          });
        }
        navigate(`/moves/${res.data.id}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const renderOptionalSlider = (
    label: string,
    field: "difficulty" | "familiarity" | "leadability" | "mental_availability" | "beat_energy" | "moderna_energy" | "sensual_energy" | "impact" | "learning_priority",
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
            onPointerDown={() => {
              if (value === null || value === undefined) {
                setForm({ ...form, [field]: 5 });
              }
            }}
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

      {isEditing && moveCollections.length > 0 && (
        <div className="move-themes-section">
          <h4>Tags</h4>
          {moveCollections.map((col) => (
            <TagEditor
              key={col.id}
              collectionId={col.id}
              collectionName={col.name}
              moveId={moveId!}
            />
          ))}
        </div>
      )}

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

        <CuesSection
          moveId={moveId}
          cues={cues}
          onCuesChange={setCues}
          localMode={!isEditing}
        />

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

        {/* Stats */}
        <div className="form-section">
          <div className="form-section-title">Stats</div>
          {renderOptionalSlider("Difficulty", "difficulty")}
          {renderOptionalSlider("Leadability", "leadability")}
          {renderOptionalSlider("Familiarity", "familiarity")}
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

        {/* Learning */}
        <div className="form-section">
          <div className="form-section-title">Learning</div>
          <div className="date-input-row">
            <span className="date-label">Date Learned</span>
            <div className="date-input-wrapper">
              <input
                type="date" max="9999-12-31"
                value={form.date_learned || ""}
                onChange={(e) =>
                  setForm({ ...form, date_learned: e.target.value || null })
                }
                className={form.date_learned ? "" : "date-empty"}
              />
              {!form.date_learned && (
                <span className="date-placeholder">--/--/----</span>
              )}
            </div>
            {form.date_learned && (
              <button
                type="button"
                className="btn-icon btn-clear-date"
                onClick={() => setForm({ ...form, date_learned: null })}
                title="Clear date"
              >
                &times;
              </button>
            )}
          </div>
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
