import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import client from "../api/client";

interface CollectionInfo {
  id: string;
  name: string;
  dance_style: string;
}

export default function LearnPage() {
  const { id } = useParams();
  const [collection, setCollection] = useState<CollectionInfo | null>(null);

  useEffect(() => {
    if (!id) return;
    client.get(`/collections/${id}`).then((res) => setCollection(res.data));
  }, [id]);

  if (!collection) return <div className="loading">Loading...</div>;

  return (
    <div className="learn-page">
      <div className="learn-header">
        <Link to={`/collections/${id}/graph`} className="back-link">
          &larr; {collection.name}
        </Link>
        <h2>Learn</h2>
      </div>

      <div className="learn-grid">
        <Link
          to={`/collections/${id}/learn/draw-connections`}
          className="learn-card"
        >
          <span className="learn-card-icon">🔗</span>
          <span className="learn-card-title">Draw Connections</span>
          <span className="learn-card-desc">
            Given random moves, draw the correct connections between them
          </span>
        </Link>
      </div>
    </div>
  );
}
