import { Link } from "react-router-dom";
import type { Move } from "../types";

interface MoveCardProps {
  move: Move;
}

export default function MoveCard({ move }: MoveCardProps) {
  return (
    <Link to={`/moves/${move.id}`} className="move-card">
      <h3 className="move-card-name">{move.name}</h3>
      <div className="move-card-stats">
        {move.is_state ? (
          <span>State</span>
        ) : (
          <span>Beats: {move.beat_count}</span>
        )}
        <span>Difficulty: {move.difficulty}/10</span>
        <span>Familiarity: {move.familiarity}/10</span>
      </div>
      {(move.key_egress || move.key_ingress) && (
        <div className="move-card-badges">
          {move.key_egress && <span className="badge-small">Egress</span>}
          {move.key_ingress && <span className="badge-small">Ingress</span>}
        </div>
      )}
    </Link>
  );
}
