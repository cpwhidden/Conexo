import { useCallback, useMemo, useState } from "react";
import client from "../api/client";
import type { Cue, CueCreate, CueBodyPart, CuePerson } from "../types";
import { CUE_BODY_PARTS } from "../types";

interface CuesSectionProps {
  moveId?: string;
  cues: Cue[];
  onCuesChange: (cues: Cue[]) => void;
  /** For new moves: accumulate locally without API calls */
  localMode?: boolean;
  defaultExpanded?: boolean;
}

const EMPTY_CUE: CueCreate = {
  beat: 1,
  person: "leader",
  body_part: "right foot",
  description: "",
};

export default function CuesSection({
  moveId,
  cues,
  onCuesChange,
  localMode = false,
  defaultExpanded = false,
}: CuesSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<CueCreate>({ ...EMPTY_CUE });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group cues by beat
  const grouped = useMemo(() => {
    const map = new Map<number, Cue[]>();
    const sorted = [...cues].sort((a, b) => {
      if (a.beat !== b.beat) return a.beat - b.beat;
      if (a.person !== b.person) return a.person.localeCompare(b.person);
      return a.body_part.localeCompare(b.body_part);
    });
    for (const cue of sorted) {
      const list = map.get(cue.beat) || [];
      list.push(cue);
      map.set(cue.beat, list);
    }
    return map;
  }, [cues]);

  const handleAdd = useCallback(async () => {
    if (!form.description.trim()) return;

    setError(null);
    setSaving(true);
    try {
      if (localMode) {
        // For new moves: generate temp id, accumulate locally
        const tempCue: Cue = {
          id: `temp-${Date.now()}-${Math.random()}`,
          move_id: "",
          ...form,
          description: form.description.trim(),
        };
        onCuesChange([...cues, tempCue]);
      } else if (moveId) {
        const res = await client.post(`/moves/${moveId}/cues`, {
          ...form,
          description: form.description.trim(),
        });
        onCuesChange([...cues, res.data]);
      }
      setForm({ ...EMPTY_CUE });
      setAdding(false);
    } catch (err: unknown) {
      const detail =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response
              ?.data?.detail
          : undefined;
      setError(detail || "Failed to add cue");
    } finally {
      setSaving(false);
    }
  }, [form, moveId, cues, onCuesChange, localMode]);

  const handleDelete = useCallback(
    async (cueId: string) => {
      if (localMode) {
        onCuesChange(cues.filter((c) => c.id !== cueId));
        return;
      }
      try {
        await client.delete(`/cues/${cueId}`);
        onCuesChange(cues.filter((c) => c.id !== cueId));
      } catch {
        // ignore
      }
    },
    [cues, onCuesChange, localMode]
  );

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <div className="cues-section">
      <div
        className="cues-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`cues-toggle ${expanded ? "expanded" : ""}`}>▶</span>
        <span className="cues-title">Cues ({cues.length})</span>
      </div>

      {expanded && (
        <div className="cues-body">
          {grouped.size === 0 && !adding && (
            <p className="cues-empty">No cues yet</p>
          )}

          {Array.from(grouped.entries()).map(([beat, beatCues]) => (
            <div key={beat} className="cues-beat-group">
              <div className="cues-beat-label">Beat {beat}</div>
              {beatCues.map((cue) => (
                <div key={cue.id} className="cue-item">
                  <span className="cue-person">{capitalize(cue.person)}</span>
                  <span className="cue-separator">·</span>
                  <span className="cue-body-part">{capitalize(cue.body_part)}</span>
                  <span className="cue-separator">:</span>
                  <span className="cue-description">{cue.description}</span>
                  <button
                    type="button"
                    className="cue-delete"
                    onClick={() => handleDelete(cue.id)}
                    title="Remove cue"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ))}

          {adding ? (
            <div className="cue-add-form">
              <div className="cue-add-row">
                <label className="cue-field">
                  Beat
                  <input
                    type="number"
                    min={1}
                    value={form.beat}
                    onChange={(e) =>
                      setForm({ ...form, beat: parseInt(e.target.value) || 1 })
                    }
                    className="cue-input-beat"
                  />
                </label>
                <label className="cue-field">
                  Person
                  <select
                    value={form.person}
                    onChange={(e) =>
                      setForm({ ...form, person: e.target.value as CuePerson })
                    }
                  >
                    <option value="leader">Leader</option>
                    <option value="follower">Follower</option>
                  </select>
                </label>
                <label className="cue-field">
                  Body Part
                  <select
                    value={form.body_part}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        body_part: e.target.value as CueBodyPart,
                      })
                    }
                  >
                    {CUE_BODY_PARTS.map((bp) => (
                      <option key={bp} value={bp}>
                        {capitalize(bp)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="cue-field cue-field-full">
                Description
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="e.g., Has 100% weight"
                  className="cue-input-desc"
                />
              </label>
              {error && <p className="cue-error">{error}</p>}
              <div className="cue-add-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-small"
                  onClick={handleAdd}
                  disabled={saving || !form.description.trim()}
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => {
                    setAdding(false);
                    setError(null);
                    setForm({ ...EMPTY_CUE });
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-secondary btn-small cue-add-btn"
              onClick={() => setAdding(true)}
            >
              + Add Cue
            </button>
          )}
        </div>
      )}
    </div>
  );
}
