import { useMemo, useRef, useState } from "react";
import type { MoveGraphData } from "../../types";
import RangeFilter, { type RangeValue } from "./RangeFilter";

interface AdvancedSearchPanelProps {
  moves: MoveGraphData[];
  onSelectMove: (move: MoveGraphData) => void;
  onClose: () => void;
  closing?: boolean;
}

type TriState = "any" | "yes" | "no";
type MoveTypeFilter = "any" | "movement" | "state";

interface Filters {
  text: string;
  moveType: MoveTypeFilter;
  startingBeat: string;
  beatCount: string;
  minOutgoing: string;
  maxOutgoing: string;
  minIncoming: string;
  maxIncoming: string;
  difficulty: RangeValue;
  leadability: RangeValue;
  familiarity: RangeValue;
  mentalAvailability: RangeValue;
  learningPriority: RangeValue;
  impact: RangeValue;
  beatEnergy: RangeValue;
  modernaEnergy: RangeValue;
  sensualEnergy: RangeValue;
  hasMedia: TriState;
  isCore: TriState;
  hasLearningNotes: TriState;
  hasTags: TriState;
  hasLeaderStyling: TriState;
  hasFollowerStyling: TriState;
}

const DEFAULT_FILTERS: Filters = {
  text: "",
  moveType: "any",
  startingBeat: "",
  beatCount: "",
  minOutgoing: "",
  maxOutgoing: "",
  minIncoming: "",
  maxIncoming: "",
  difficulty: null,
  leadability: null,
  familiarity: null,
  mentalAvailability: null,
  learningPriority: null,
  impact: null,
  beatEnergy: null,
  modernaEnergy: null,
  sensualEnergy: null,
  hasMedia: "any",
  isCore: "any",
  hasLearningNotes: "any",
  hasTags: "any",
  hasLeaderStyling: "any",
  hasFollowerStyling: "any",
};

function textMatch(haystack: string | null | undefined, terms: string[]): boolean {
  if (!haystack) return false;
  const lower = haystack.toLowerCase();
  return terms.every((t) => lower.includes(t));
}

function matchesRange(
  value: number | null | undefined,
  range: RangeValue
): boolean {
  if (range === null) return true; // "Any" — no filter
  if (range === "not-set") return value === null || value === undefined;
  if (value === null || value === undefined) return false;
  return value >= range[0] && value <= range[1];
}

function matchesTriState(
  value: boolean | number,
  filter: TriState
): boolean {
  if (filter === "any") return true;
  const truthy = typeof value === "number" ? value > 0 : value;
  return filter === "yes" ? !!truthy : !truthy;
}

function SegmentedTriState({
  value,
  onChange,
}: {
  value: TriState;
  onChange: (v: TriState) => void;
}) {
  return (
    <div className="segmented-control segmented-small">
      {(["any", "yes", "no"] as const).map((v) => (
        <button
          key={v}
          type="button"
          className={value === v ? "active" : ""}
          onClick={() => onChange(v)}
        >
          {v.charAt(0).toUpperCase() + v.slice(1)}
        </button>
      ))}
    </div>
  );
}

export default function AdvancedSearchPanel({
  moves,
  onSelectMove,
  onClose,
  closing,
}: AdvancedSearchPanelProps) {
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS });
  const [scoresExpanded, setScoresExpanded] = useState(false);
  const [boolsExpanded, setBoolsExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const update = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const results = useMemo(() => {
    const terms = filters.text
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    return moves.filter((m) => {
      // Text search across multiple fields
      if (terms.length > 0) {
        const searchable = [
          m.name,
          m.description,
          ...(m.tag_names || []),
          ...(m.cue_descriptions || []),
          m.leader_styling,
          m.follower_styling,
          m.learning_notes,
        ]
          .filter(Boolean)
          .join(" ");
        if (!textMatch(searchable, terms)) return false;
      }

      // Move type
      if (filters.moveType === "movement" && m.is_state) return false;
      if (filters.moveType === "state" && !m.is_state) return false;

      // Starting beat
      if (filters.startingBeat) {
        const sb = parseInt(filters.startingBeat);
        if (!isNaN(sb) && m.starting_beat !== sb) return false;
      }

      // Beat count
      if (filters.beatCount) {
        const bc = parseInt(filters.beatCount);
        if (!isNaN(bc) && m.beat_count !== bc) return false;
      }

      // Connection counts
      if (filters.minOutgoing) {
        const min = parseInt(filters.minOutgoing);
        if (!isNaN(min) && m.outgoing_connection_count < min) return false;
      }
      if (filters.maxOutgoing) {
        const max = parseInt(filters.maxOutgoing);
        if (!isNaN(max) && m.outgoing_connection_count > max) return false;
      }
      if (filters.minIncoming) {
        const min = parseInt(filters.minIncoming);
        if (!isNaN(min) && m.incoming_connection_count < min) return false;
      }
      if (filters.maxIncoming) {
        const max = parseInt(filters.maxIncoming);
        if (!isNaN(max) && m.incoming_connection_count > max) return false;
      }

      // Score ranges
      if (!matchesRange(m.difficulty, filters.difficulty)) return false;
      if (!matchesRange(m.leadability, filters.leadability)) return false;
      if (!matchesRange(m.familiarity, filters.familiarity)) return false;
      if (!matchesRange(m.mental_availability, filters.mentalAvailability)) return false;
      if (!matchesRange(m.learning_priority, filters.learningPriority)) return false;
      if (!matchesRange(m.impact, filters.impact)) return false;
      if (!matchesRange(m.beat_energy, filters.beatEnergy)) return false;
      if (!matchesRange(m.moderna_energy, filters.modernaEnergy)) return false;
      if (!matchesRange(m.sensual_energy, filters.sensualEnergy)) return false;

      // Boolean filters
      if (!matchesTriState(m.media_count, filters.hasMedia)) return false;
      if (!matchesTriState(m.is_core, filters.isCore)) return false;
      if (!matchesTriState(!!m.learning_notes, filters.hasLearningNotes)) return false;
      if (!matchesTriState((m.tag_names?.length || 0) > 0, filters.hasTags)) return false;
      if (!matchesTriState(!!m.leader_styling, filters.hasLeaderStyling)) return false;
      if (!matchesTriState(!!m.follower_styling, filters.hasFollowerStyling)) return false;

      return true;
    });
  }, [moves, filters]);

  const hasActiveFilters = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="slide-panel-container">
      <div className={`slide-panel advanced-search-panel ${closing ? "closing" : ""}`}>
        <div
          className="slide-panel-header"
          onClick={(e) => {
            // Don't scroll if clicking the close button
            if ((e.target as HTMLElement).closest(".btn-icon")) return;
            contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          }}
          style={{ cursor: "pointer" }}
        >
          <h3>Advanced Search</h3>
          <button className="btn-icon" onClick={onClose} title="Close">
            &times;
          </button>
        </div>

        <div className="slide-panel-content" ref={contentRef}>
          {/* Text search */}
          <input
            type="text"
            placeholder="Search name, description, tags, cues, notes..."
            value={filters.text}
            onChange={(e) => update("text", e.target.value)}
            className="adv-search-text"
            autoFocus
          />

          {/* Move type */}
          <div className="adv-filter-row">
            <span className="adv-filter-label">Move Type</span>
            <div className="segmented-control segmented-small">
              {(["any", "movement", "state"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={filters.moveType === v ? "active" : ""}
                  onClick={() => update("moveType", v)}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Starting beat & beat count */}
          <div className="adv-filter-row">
            <label className="adv-filter-inline">
              Starting Beat
              <input
                type="number"
                min={1}
                max={8}
                value={filters.startingBeat}
                onChange={(e) => update("startingBeat", e.target.value)}
                placeholder="Any"
                className="adv-input-small"
              />
            </label>
            <label className="adv-filter-inline">
              Beat Count
              <input
                type="number"
                min={0}
                value={filters.beatCount}
                onChange={(e) => update("beatCount", e.target.value)}
                placeholder="Any"
                className="adv-input-small"
              />
            </label>
          </div>

          {/* Connection counts */}
          <div className="adv-filter-row">
            <label className="adv-filter-inline">
              Outgoing ≥
              <input
                type="number"
                min={0}
                value={filters.minOutgoing}
                onChange={(e) => update("minOutgoing", e.target.value)}
                placeholder="Min"
                className="adv-input-small"
              />
            </label>
            <label className="adv-filter-inline">
              Outgoing ≤
              <input
                type="number"
                min={0}
                value={filters.maxOutgoing}
                onChange={(e) => update("maxOutgoing", e.target.value)}
                placeholder="Max"
                className="adv-input-small"
              />
            </label>
          </div>
          <div className="adv-filter-row">
            <label className="adv-filter-inline">
              Incoming ≥
              <input
                type="number"
                min={0}
                value={filters.minIncoming}
                onChange={(e) => update("minIncoming", e.target.value)}
                placeholder="Min"
                className="adv-input-small"
              />
            </label>
            <label className="adv-filter-inline">
              Incoming ≤
              <input
                type="number"
                min={0}
                value={filters.maxIncoming}
                onChange={(e) => update("maxIncoming", e.target.value)}
                placeholder="Max"
                className="adv-input-small"
              />
            </label>
          </div>

          {/* Score ranges (collapsible) */}
          <div className="adv-section">
            <div
              className="adv-section-header"
              onClick={() => setScoresExpanded(!scoresExpanded)}
            >
              <span className={`cues-toggle ${scoresExpanded ? "expanded" : ""}`}>
                ▶
              </span>
              <span>Score Ranges</span>
            </div>
            {scoresExpanded && (
              <div className="adv-section-body">
                <RangeFilter label="Difficulty" value={filters.difficulty} onChange={(v) => update("difficulty", v)} />
                <RangeFilter label="Leadability" value={filters.leadability} onChange={(v) => update("leadability", v)} />
                <RangeFilter label="Familiarity" value={filters.familiarity} onChange={(v) => update("familiarity", v)} />
                <RangeFilter label="Mental Availability" value={filters.mentalAvailability} onChange={(v) => update("mentalAvailability", v)} />
                <RangeFilter label="Learning Priority" value={filters.learningPriority} onChange={(v) => update("learningPriority", v)} />
                <RangeFilter label="Impact" value={filters.impact} onChange={(v) => update("impact", v)} />
                <RangeFilter label="Beat Energy" value={filters.beatEnergy} onChange={(v) => update("beatEnergy", v)} />
                <RangeFilter label="Moderna Energy" value={filters.modernaEnergy} onChange={(v) => update("modernaEnergy", v)} />
                <RangeFilter label="Sensual Energy" value={filters.sensualEnergy} onChange={(v) => update("sensualEnergy", v)} />
              </div>
            )}
          </div>

          {/* Boolean filters (collapsible) */}
          <div className="adv-section">
            <div
              className="adv-section-header"
              onClick={() => setBoolsExpanded(!boolsExpanded)}
            >
              <span className={`cues-toggle ${boolsExpanded ? "expanded" : ""}`}>
                ▶
              </span>
              <span>Attributes</span>
            </div>
            {boolsExpanded && (
              <div className="adv-section-body">
                <div className="adv-bool-row">
                  <span>Has Media</span>
                  <SegmentedTriState value={filters.hasMedia} onChange={(v) => update("hasMedia", v)} />
                </div>
                <div className="adv-bool-row">
                  <span>Is Core</span>
                  <SegmentedTriState value={filters.isCore} onChange={(v) => update("isCore", v)} />
                </div>
                <div className="adv-bool-row">
                  <span>Has Learning Notes</span>
                  <SegmentedTriState value={filters.hasLearningNotes} onChange={(v) => update("hasLearningNotes", v)} />
                </div>
                <div className="adv-bool-row">
                  <span>Has Tags</span>
                  <SegmentedTriState value={filters.hasTags} onChange={(v) => update("hasTags", v)} />
                </div>
                <div className="adv-bool-row">
                  <span>Has Leader Styling</span>
                  <SegmentedTriState value={filters.hasLeaderStyling} onChange={(v) => update("hasLeaderStyling", v)} />
                </div>
                <div className="adv-bool-row">
                  <span>Has Follower Styling</span>
                  <SegmentedTriState value={filters.hasFollowerStyling} onChange={(v) => update("hasFollowerStyling", v)} />
                </div>
              </div>
            )}
          </div>

          {/* Clear filters */}
          {hasActiveFilters && (
            <button
              type="button"
              className="btn btn-secondary btn-small adv-clear-btn"
              onClick={() => setFilters({ ...DEFAULT_FILTERS })}
            >
              Clear All Filters
            </button>
          )}

          {/* Results */}
          <div className="adv-results-header">
            {results.length} of {moves.length} moves
          </div>
          <div className="adv-results">
            {results.map((m) => (
              <div
                key={m.id}
                className="adv-result-item"
                onClick={() => onSelectMove(m)}
              >
                <span className="adv-result-name">{m.name}</span>
                <span className="adv-result-meta">
                  {m.is_state ? "State" : `Beat ${m.starting_beat}`}
                  {` · ${m.outgoing_connection_count}↗ ${m.incoming_connection_count}↙`}
                  {m.media_count > 0 && ` · ${m.media_count} media`}
                </span>
              </div>
            ))}
            {results.length === 0 && (
              <p className="adv-no-results">No moves match the current filters</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
