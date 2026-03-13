import { useState } from "react";
import { Link } from "react-router-dom";
import MoveCard from "../components/MoveCard";
import { useMoves } from "../hooks/useMoves";
import { DANCE_STYLES } from "../types";
import { multiTermMatch } from "../utils/search";

export default function MovesPage() {
  const { moves, loading } = useMoves();
  const [search, setSearch] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("");
  const [familiarityFilter, setFamiliarityFilter] = useState<string>("");
  const [danceStyleFilter, setDanceStyleFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");

  const filtered = moves.filter((m) => {
    if (search && !multiTermMatch(m.name, search)) {
      return false;
    }
    if (difficultyFilter && m.difficulty > parseInt(difficultyFilter)) {
      return false;
    }
    if (familiarityFilter && m.familiarity < parseInt(familiarityFilter)) {
      return false;
    }
    if (danceStyleFilter && m.dance_style !== danceStyleFilter) {
      return false;
    }
    if (typeFilter === "moves" && m.is_state) return false;
    if (typeFilter === "states" && !m.is_state) return false;
    return true;
  });

  if (loading) return <div className="loading">Loading moves...</div>;

  return (
    <div className="moves-page">
      <div className="moves-header">
        <h2>My Moves ({filtered.length})</h2>
        <Link to="/moves/new" className="btn btn-primary">
          Add Move
        </Link>
      </div>
      <div className="moves-filters">
        <input
          type="text"
          placeholder="Search moves..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />
        <select
          value={danceStyleFilter}
          onChange={(e) => setDanceStyleFilter(e.target.value)}
        >
          <option value="">Any style</option>
          {DANCE_STYLES.map((style) => (
            <option key={style} value={style}>
              {style}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All types</option>
          <option value="moves">Moves only</option>
          <option value="states">States only</option>
        </select>
        <select
          value={difficultyFilter}
          onChange={(e) => setDifficultyFilter(e.target.value)}
        >
          <option value="">Any difficulty</option>
          {[...Array(10)].map((_, i) => (
            <option key={i + 1} value={i + 1}>
              Difficulty &le; {i + 1}
            </option>
          ))}
        </select>
        <select
          value={familiarityFilter}
          onChange={(e) => setFamiliarityFilter(e.target.value)}
        >
          <option value="">Any familiarity</option>
          {[...Array(10)].map((_, i) => (
            <option key={i + 1} value={i + 1}>
              Familiarity &ge; {i + 1}
            </option>
          ))}
        </select>
      </div>
      {filtered.length === 0 ? (
        <div className="empty-state">
          {moves.length === 0 ? (
            <p>
              No moves yet.{" "}
              <Link to="/moves/new">Add your first move!</Link>
            </p>
          ) : (
            <p>No moves match your filters.</p>
          )}
        </div>
      ) : (
        <div className="moves-grid">
          {filtered.map((move) => (
            <MoveCard key={move.id} move={move} />
          ))}
        </div>
      )}
    </div>
  );
}
