import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import client from "../api/client";
import ConfirmModal from "../components/ConfirmModal";
import type { Tag } from "../types";

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMo = Math.floor(diffDay / 30);
  if (diffMo < 12) return `${diffMo}mo ago`;
  return `${Math.floor(diffMo / 12)}y ago`;
}

export default function CollectionTagsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tags, setTags] = useState<Tag[]>([]);
  const [collectionName, setCollectionName] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleteConfirmTag, setDeleteConfirmTag] = useState<Tag | null>(null);

  const loadTags = async () => {
    if (!id) return;
    const [colRes, tagsRes] = await Promise.all([
      client.get(`/collections/${id}`),
      client.get(`/collections/${id}/tags`),
    ]);
    setCollectionName(colRes.data.name);
    setTags(tagsRes.data);
    setLoading(false);
  };

  useEffect(() => {
    loadTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleCreate = async () => {
    const name = newTagName.trim();
    if (!name || !id) return;
    try {
      const res = await client.post(`/collections/${id}/tags`, { name });
      setTags((prev) => [...prev, { ...res.data, move_count: 0 }]);
      setNewTagName("");
    } catch {
      // duplicate name or other error
    }
  };

  const handleRename = async (tagId: string) => {
    const name = editValue.trim();
    if (!name || !id) {
      setEditingId(null);
      return;
    }
    try {
      const res = await client.patch(`/collections/${id}/tags/${tagId}`, { name });
      setTags((prev) =>
        prev.map((t) => (t.id === tagId ? { ...t, ...res.data, move_count: t.move_count } : t))
      );
      setEditingId(null);
      setEditValue("");
    } catch {
      setEditingId(null);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!id || !deleteConfirmTag) return;
    await client.delete(`/collections/${id}/tags/${deleteConfirmTag.id}`);
    setTags((prev) => prev.filter((t) => t.id !== deleteConfirmTag.id));
    setDeleteConfirmTag(null);
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <Link to={`/collections/${id}/moves`} className="back-link">
          &larr; {collectionName}
        </Link>
        <h2>Tags</h2>
      </div>

      <div className="tag-manager-create">
        <input
          type="text"
          placeholder="New tag name..."
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
        />
        <button
          className="btn btn-primary"
          onClick={handleCreate}
          disabled={!newTagName.trim()}
        >
          Create
        </button>
      </div>

      {tags.length === 0 ? (
        <p className="empty-state">No tags yet. Create one above.</p>
      ) : (
        <div className="tag-manager-list">
          {tags.map((tag) => (
              <div key={tag.id} className="tag-manager-item">
                {editingId === tag.id ? (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(tag.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onBlur={() => handleRename(tag.id)}
                    autoFocus
                    className="tag-manager-edit-input"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <button
                    type="button"
                    className="tag-manager-row"
                    onClick={() => navigate(`/collections/${id}/tags/${tag.id}`)}
                  >
                    <span className="tag-manager-name">{tag.name}</span>
                    <span className="tag-manager-meta">
                      <span className="tag-manager-count">
                        {tag.move_count ?? 0} move{(tag.move_count ?? 0) !== 1 ? "s" : ""}
                      </span>
                      {tag.updated_at && (
                        <span className="tag-manager-date">
                          {formatRelativeTime(tag.updated_at)}
                        </span>
                      )}
                    </span>
                  </button>
                )}
                <button
                  className="btn-icon-small"
                  title="Rename"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(tag.id);
                    setEditValue(tag.name);
                  }}
                >
                  ✎
                </button>
                <button
                  className="btn-icon btn-danger-icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirmTag(tag);
                  }}
                  title="Delete tag"
                >
                  &times;
                </button>
              </div>
            ))}
        </div>
      )}

      {deleteConfirmTag && (
        <ConfirmModal
          title="Delete Tag"
          message={
            <>
              <p>
                Delete the tag "<strong>{deleteConfirmTag.name}</strong>"?
              </p>
              {(deleteConfirmTag.move_count ?? 0) > 0 && (
                <div className="modal-warning">
                  <strong>
                    {deleteConfirmTag.move_count} move
                    {deleteConfirmTag.move_count !== 1 ? "s" : ""} will be
                    untagged.
                  </strong>
                  <p>The moves themselves will not be deleted.</p>
                </div>
              )}
            </>
          }
          confirmLabel="Delete"
          confirmVariant="danger"
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteConfirmTag(null)}
        />
      )}
    </div>
  );
}
