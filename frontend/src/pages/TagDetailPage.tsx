import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import client from "../api/client";
import type { Tag, TaggedMove } from "../types";

export default function TagDetailPage() {
  const { id, tagId } = useParams();
  const [tag, setTag] = useState<Tag | null>(null);
  const [moves, setMoves] = useState<TaggedMove[]>([]);
  const [loading, setLoading] = useState(true);
  const [collectionName, setCollectionName] = useState("");

  const load = async () => {
    if (!id || !tagId) return;
    const [colRes, tagsRes, movesRes] = await Promise.all([
      client.get(`/collections/${id}`),
      client.get(`/collections/${id}/tags`),
      client.get(`/collections/${id}/tags/${tagId}/moves`),
    ]);
    setCollectionName(colRes.data.name);
    const currentTag = (tagsRes.data as Tag[]).find((t) => t.id === tagId);
    setTag(currentTag ?? null);
    setMoves(movesRes.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tagId]);

  const handleRemoveMove = async (moveId: string) => {
    if (!id || !tagId) return;
    await client.delete(`/collections/${id}/tags/${tagId}/moves/${moveId}`);
    setMoves((prev) => prev.filter((m) => m.id !== moveId));
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (!tag) return <div className="loading">Tag not found</div>;

  return (
    <div className="page">
      <div className="page-header">
        <Link to={`/collections/${id}/tags`} className="back-link">
          &larr; Tags
        </Link>
        <h2>{tag.name}</h2>
        <span className="page-header-meta">
          {collectionName} · {moves.length} move{moves.length !== 1 ? "s" : ""}
        </span>
      </div>

      {moves.length === 0 ? (
        <p className="empty-state">No moves are tagged with "{tag.name}" yet.</p>
      ) : (
        <div className="tag-manager-list">
          {moves.map((move) => (
            <div key={move.id} className="tag-manager-item">
              <Link
                to={`/moves/${move.id}`}
                className="tag-manager-row tag-manager-move-link"
              >
                <span className="tag-manager-name">{move.name}</span>
              </Link>
              <button
                className="btn-icon btn-danger-icon"
                onClick={() => handleRemoveMove(move.id)}
                title="Remove from tag"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
