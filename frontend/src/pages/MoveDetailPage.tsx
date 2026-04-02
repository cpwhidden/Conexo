import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import client from "../api/client";
import ConnectionList from "../components/ConnectionList";
import MediaPlayer from "../components/MediaPlayer";
import MediaUpload from "../components/MediaUpload";
import CuesSection from "../components/CuesSection";
import type { Move, Media, Cue, Collection } from "../types";
import { useMoves } from "../hooks/useMoves";

export default function MoveDetailPage() {
  const { moveId } = useParams();
  const navigate = useNavigate();
  const [move, setMove] = useState<Move | null>(null);
  const [mediaItems, setMediaItems] = useState<Media[]>([]);
  const [cues, setCues] = useState<Cue[]>([]);
  const { moves: allMoves } = useMoves();
  const [moveCollections, setMoveCollections] = useState<Collection[]>([]);

  useEffect(() => {
    if (!moveId) return;
    client.get(`/moves/${moveId}`).then((res) => setMove(res.data));
    client.get(`/moves/${moveId}/media`).then((res) => setMediaItems(res.data));
    client.get(`/moves/${moveId}/cues`).then((res) => setCues(res.data));
    client.get(`/collections/by-move/${moveId}`).then((res) => setMoveCollections(res.data));
  }, [moveId]);

  const handleMediaUploaded = useCallback((media: Media) => {
    setMediaItems((prev) => [...prev, media]);
    setMove((prev) => {
      if (prev && !prev.cover_media_id) {
        return { ...prev, cover_media_id: media.id };
      }
      return prev;
    });
  }, []);

  const handleMediaDeleted = useCallback((mediaId: string) => {
    setMediaItems((prev) => prev.filter((v) => v.id !== mediaId));
    setMove((prev) => {
      if (prev && prev.cover_media_id === mediaId) {
        return { ...prev, cover_media_id: null };
      }
      return prev;
    });
  }, []);

  const handleSetCover = useCallback((mediaId: string) => {
    setMove((prev) => (prev ? { ...prev, cover_media_id: mediaId } : prev));
  }, []);

  const handleMediaRenamed = useCallback((mediaId: string, newFilename: string) => {
    setMediaItems((prev) =>
      prev.map((v) => (v.id === mediaId ? { ...v, filename: newFilename } : v))
    );
  }, []);

  const handleDelete = async () => {
    if (!confirm("Delete this move? This cannot be undone.")) return;
    await client.delete(`/moves/${moveId}`);
    navigate("/");
  };

  if (!move) return <div className="loading">Loading...</div>;

  // Find a collection to link to for graph view
  const firstCollection = moveCollections.length > 0 ? moveCollections[0] : null;

  return (
    <div className="move-detail-page">
      <div className="move-detail-header">
        <h2>{move.name}</h2>
        <div className="move-detail-actions">
          {firstCollection && (
            <Link to={`/collections/${firstCollection.id}/graph?node=${moveId}`} className="btn btn-secondary">
              Graph View
            </Link>
          )}
          <Link to={`/moves/${moveId}/edit`} className="btn btn-secondary">
            Edit
          </Link>
          <button onClick={handleDelete} className="btn btn-danger">
            Delete
          </button>
        </div>
      </div>

      {move.description && <p className="move-description">{move.description}</p>}

      <CuesSection moveId={move.id} cues={cues} onCuesChange={setCues} />

      {/* Timing Section */}
      <div className="detail-section">
        <h4 className="detail-section-title">Timing</h4>
        <div className="move-stats">
          <div className="stat">
            <span className="stat-label">Type</span>
            <span className="stat-value">{move.is_state ? "State" : "Movement"}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Starting Beat</span>
            <span className="stat-value">{move.starting_beat ?? "—"}</span>
          </div>
          {!move.is_state && (
            <div className="stat">
              <span className="stat-label">Beat Count</span>
              <span className="stat-value">{move.beat_count}</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats Section */}
      <div className="detail-section">
        <h4 className="detail-section-title">Stats</h4>
        <div className="move-stats stats-grid">
          <div className="stat">
            <span className="stat-label">Difficulty</span>
            <span className="stat-value">{move.difficulty}/10</span>
          </div>
          <div className="stat">
            <span className="stat-label">Leadability</span>
            <span className="stat-value">{move.leadability !== null ? `${move.leadability}/10` : "—"}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Familiarity</span>
            <span className="stat-value">{move.familiarity}/10</span>
          </div>
          <div className="stat">
            <span className="stat-label">Mental Avail.</span>
            <span className="stat-value">{move.mental_availability !== null ? `${move.mental_availability}/10` : "—"}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Learn Priority</span>
            <span className="stat-value">{move.learning_priority !== null ? `${move.learning_priority}/10` : "—"}</span>
          </div>
        </div>
      </div>

      {/* Energy Section */}
      <div className="detail-section">
        <h4 className="detail-section-title">Energy</h4>
        <div className="move-stats">
          <div className="stat">
            <span className="stat-label">Impact</span>
            <span className="stat-value">{move.impact !== null ? `${move.impact}/10` : "—"}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Beat</span>
            <span className="stat-value">{move.beat_energy !== null ? `${move.beat_energy}/10` : "—"}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Moderna</span>
            <span className="stat-value">{move.moderna_energy !== null ? `${move.moderna_energy}/10` : "—"}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Sensual</span>
            <span className="stat-value">{move.sensual_energy !== null ? `${move.sensual_energy}/10` : "—"}</span>
          </div>
        </div>
      </div>

      {/* Key move badges */}
      {(move.key_egress || move.key_ingress || move.is_core) && (
        <div className="move-badges">
          {move.is_core && <span className="badge">Core</span>}
          {move.key_egress && <span className="badge">Key Egress</span>}
          {move.key_ingress && <span className="badge">Key Ingress</span>}
        </div>
      )}

      {/* Collections this move belongs to */}
      {moveCollections.length > 0 && (
        <div className="move-themes-section">
          <h4>Collections</h4>
          <div className="themes-tag-container">
            {moveCollections.map((col) => (
              <Link
                key={col.id}
                to={`/collections/${col.id}/graph?layout=focus&node=${move.id}`}
                className="theme-tag"
                style={{ textDecoration: "none" }}
              >
                {col.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Styling Section */}
      <div className="detail-section">
        <h4 className="detail-section-title">Styling</h4>
        <div className="move-styling">
          <h5>Leader</h5>
          <p>{move.leader_styling || "—"}</p>
        </div>
        <div className="move-styling">
          <h5>Follower</h5>
          <p>{move.follower_styling || "—"}</p>
        </div>
      </div>

      {/* Learning Notes */}
      <div className="move-notes">
        <h4>Learning Notes</h4>
        <p>{move.learning_notes || "—"}</p>
      </div>

      <section className="move-section">
        <h3>Media ({mediaItems.length})</h3>
        <MediaUpload moveId={move.id} onUploaded={handleMediaUploaded} />
        <div className="media-grid">
          {mediaItems.map((media) => (
            <MediaPlayer
              key={media.id}
              media={media}
              moveId={move.id}
              isCover={move.cover_media_id === media.id}
              onDelete={handleMediaDeleted}
              onRenamed={handleMediaRenamed}
              onSetCover={handleSetCover}
            />
          ))}
        </div>
      </section>

      <section className="move-section">
        <h3>Connections</h3>
        <ConnectionList moveId={move.id} allMoves={allMoves} />
      </section>
    </div>
  );
}
