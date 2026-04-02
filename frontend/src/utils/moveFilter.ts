import type { RangeValue } from "../components/graph/RangeFilter";
import type { MoveGraphData } from "../types";

export type { RangeValue };

export type TriState = "any" | "yes" | "no";
export type MoveTypeFilter = "any" | "movement" | "state";

export interface Filters {
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
  selectedTagNames: string[];
}

export const DEFAULT_FILTERS: Filters = {
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
  selectedTagNames: [],
};

export function textMatch(
  haystack: string | null | undefined,
  terms: string[]
): boolean {
  if (!haystack) return false;
  const lower = haystack.toLowerCase();
  return terms.every((t) => lower.includes(t));
}

export function matchesRange(
  value: number | null | undefined,
  range: RangeValue
): boolean {
  if (range === null) return true; // "Any" — no filter
  if (range === "not-set") return value === null || value === undefined;
  if (value === null || value === undefined) return false;
  return value >= range[0] && value <= range[1];
}

export function matchesTriState(
  value: boolean | number,
  filter: TriState
): boolean {
  if (filter === "any") return true;
  const truthy = typeof value === "number" ? value > 0 : value;
  return filter === "yes" ? !!truthy : !truthy;
}

export function applyFilters(
  moves: MoveGraphData[],
  filters: Filters
): MoveGraphData[] {
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
    if (!matchesRange(m.mental_availability, filters.mentalAvailability))
      return false;
    if (!matchesRange(m.learning_priority, filters.learningPriority))
      return false;
    if (!matchesRange(m.impact, filters.impact)) return false;
    if (!matchesRange(m.beat_energy, filters.beatEnergy)) return false;
    if (!matchesRange(m.moderna_energy, filters.modernaEnergy)) return false;
    if (!matchesRange(m.sensual_energy, filters.sensualEnergy)) return false;

    // Boolean filters
    if (!matchesTriState(m.media_count, filters.hasMedia)) return false;
    if (!matchesTriState(m.is_core, filters.isCore)) return false;
    if (!matchesTriState(!!m.learning_notes, filters.hasLearningNotes))
      return false;
    if (!matchesTriState((m.tag_names?.length || 0) > 0, filters.hasTags))
      return false;
    if (!matchesTriState(!!m.leader_styling, filters.hasLeaderStyling))
      return false;
    if (!matchesTriState(!!m.follower_styling, filters.hasFollowerStyling))
      return false;

    // Tag name filter
    if (filters.selectedTagNames.length > 0) {
      const moveTags = m.tag_names || [];
      if (!filters.selectedTagNames.some((t) => moveTags.includes(t)))
        return false;
    }

    return true;
  });
}
