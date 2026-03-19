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
  difficulty: number;
  familiarity: number;
  tags: string[];
  dance_style: string;
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
  learning_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MoveCreate {
  name: string;
  description?: string | null;
  beat_count: number;
  difficulty: number;
  familiarity: number;
  tags?: string[];
  dance_style: DanceStyle;
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
  learning_notes?: string | null;
}

export interface MoveUpdate {
  name?: string;
  description?: string | null;
  beat_count?: number;
  difficulty?: number;
  familiarity?: number;
  tags?: string[];
  dance_style?: DanceStyle;
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
  learning_notes?: string | null;
}

export interface Video {
  id: string;
  move_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

export interface Connection {
  id: string;
  source_move_id: string;
  target_move_id: string;
  label: string | null;
  notes: string | null;
  flow: number | null;
  created_at: string;
}

export interface ConnectionCreate {
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
  is_default: boolean;
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

// Sequences
export interface Sequence {
  id: string;
  name: string;
  description: string | null;
  dance_style: string;
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
  name: string;
  description?: string | null;
  dance_style: DanceStyle;
}

export interface SequenceMoveAdd {
  position: number;
  move_id?: string | null;
  custom_name?: string | null;
  custom_beat_count?: number | null;
  notes?: string | null;
}

// Themes
export interface Theme {
  id: string;
  name: string;
  dance_style: string;
  description: string | null;
  move_count: number;
  created_at: string;
  updated_at: string;
}

export interface ThemeMove {
  id: string;
  move_id: string;
  move_name: string;
  added_at: string;
}

export interface ThemeWithMoves extends Theme {
  moves: ThemeMove[];
}

export interface ThemeCreate {
  name: string;
  dance_style: DanceStyle;
  description?: string | null;
}

export interface ThemeMoveAdd {
  move_id: string;
}
