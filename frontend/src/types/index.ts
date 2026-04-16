export const DANCE_STYLES = [
  "Salsa",
  "Bachata",
  "Zouk",
  "Kizomba",
  "West Coast Swing",
  "Lambada",
  "Yoga",
] as const;

export type DanceStyle = (typeof DANCE_STYLES)[number];

export interface User {
  id: string;
  email: string;
  name: string;
  picture_url: string | null;
  created_at: string;
}

export interface Move {
  id: string;
  name: string;
  description: string | null;
  beat_count: number;
  difficulty: number | null;
  familiarity: number | null;
  starting_beat: number | null;
  is_state: boolean;
  key_egress: boolean;
  key_ingress: boolean;
  is_core: boolean;
  leadability: number | null;
  mental_availability: number | null;
  beat_energy: number | null;
  moderna_energy: number | null;
  sensual_energy: number | null;
  impact: number | null;
  learning_priority: number | null;
  leader_styling: string | null;
  follower_styling: string | null;
  date_learned: string | null;
  learning_notes: string | null;
  cover_media_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MoveGraphData extends Move {
  media_count: number;
  tag_names: string[];
  cue_descriptions: string[];
  outgoing_connection_count: number;
  incoming_connection_count: number;
}

export interface MoveCreate {
  name: string;
  description?: string | null;
  beat_count: number;
  difficulty?: number | null;
  familiarity?: number | null;
  starting_beat?: number | null;
  is_state?: boolean;
  key_egress?: boolean;
  key_ingress?: boolean;
  is_core?: boolean;
  leadability?: number | null;
  mental_availability?: number | null;
  beat_energy?: number | null;
  moderna_energy?: number | null;
  sensual_energy?: number | null;
  impact?: number | null;
  learning_priority?: number | null;
  leader_styling?: string | null;
  follower_styling?: string | null;
  date_learned?: string | null;
  learning_notes?: string | null;
  collection_id?: string;
}

export interface MoveUpdate {
  name?: string;
  description?: string | null;
  beat_count?: number;
  difficulty?: number | null;
  familiarity?: number | null;
  starting_beat?: number | null;
  is_state?: boolean;
  key_egress?: boolean;
  key_ingress?: boolean;
  is_core?: boolean;
  leadability?: number | null;
  mental_availability?: number | null;
  beat_energy?: number | null;
  moderna_energy?: number | null;
  sensual_energy?: number | null;
  impact?: number | null;
  learning_priority?: number | null;
  leader_styling?: string | null;
  follower_styling?: string | null;
  date_learned?: string | null;
  learning_notes?: string | null;
}

export interface Media {
  id: string;
  move_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

export interface Connection {
  id: string;
  collection_id: string;
  source_move_id: string;
  target_move_id: string;
  label: string | null;
  notes: string | null;
  flow: number | null;
  created_at: string;
}

export interface ConnectionCreate {
  collection_id: string;
  source_move_id: string;
  target_move_id: string;
  label?: string | null;
  notes?: string | null;
  flow?: number | null;
}

export interface AuthResponse {
  user: User;
  access_token: string;
}

// Collections
export interface Collection {
  id: string;
  name: string;
  description: string | null;
  dance_style: string;
  date_last_opened: string | null;
  move_count: number;
  created_at: string;
  updated_at: string;
}

export interface CollectionMove {
  id: string;
  move_id: string;
  move_name: string;
  notes: string | null;
  position_x: number | null;
  position_y: number | null;
  added_at: string;
}

export interface CollectionWithMoves extends Collection {
  moves: CollectionMove[];
}

export interface CollectionCreate {
  name: string;
  description?: string | null;
  dance_style: DanceStyle;
}

export interface CollectionMoveAdd {
  move_id: string;
  notes?: string | null;
}

// Tags (collection-scoped)
export interface Tag {
  id: string;
  collection_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  move_count?: number;
}

export interface TagCreate {
  name: string;
}

export interface TaggedMove {
  id: string;
  name: string;
}

// Collection Filters
export interface FilterCriteria {
  search?: string;
  [key: string]: unknown;
}

export interface CollectionFilter {
  id: string;
  collection_id: string;
  name: string;
  criteria: FilterCriteria;
  created_at: string;
  updated_at: string;
}

export interface CollectionFilterCreate {
  name: string;
  criteria: FilterCriteria;
}

// Sequences
export interface Sequence {
  id: string;
  collection_id: string;
  name: string;
  description: string | null;
  date_last_opened: string | null;
  created_at: string;
  updated_at: string;
}

export interface SequenceMove {
  id: string;
  position: number;
  move_id: string | null;
  move_name: string | null;
  custom_name: string | null;
  custom_beat_count: number | null;
  beat_count: number;
  notes: string | null;
}

export interface SequenceWithEntries extends Sequence {
  entries: SequenceMove[];
  total_beats: number;
}

export interface SequenceCreate {
  collection_id: string;
  name: string;
  description?: string | null;
}

export interface SequenceMoveAdd {
  position: number;
  move_id?: string | null;
  custom_name?: string | null;
  custom_beat_count?: number | null;
  notes?: string | null;
}

// Cues
export type CuePerson = "leader" | "follower";

export type CueBodyPart =
  | "right foot" | "right leg" | "left foot" | "left leg"
  | "hips" | "core" | "chest" | "back"
  | "right shoulder" | "right arm"
  | "left shoulder" | "left arm" | "left hand"
  | "neck" | "head" | "center of gravity";

export const CUE_BODY_PARTS: CueBodyPart[] = [
  "right foot", "right leg", "left foot", "left leg",
  "hips", "core", "chest", "back",
  "right shoulder", "right arm",
  "left shoulder", "left arm", "left hand",
  "neck", "head", "center of gravity",
];

export interface Cue {
  id: string;
  move_id: string;
  beat: number;
  person: CuePerson;
  body_part: CueBodyPart;
  description: string;
}

export interface CueCreate {
  beat: number;
  person: CuePerson;
  body_part: CueBodyPart;
  description: string;
}
