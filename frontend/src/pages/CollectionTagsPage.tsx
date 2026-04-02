import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import client from "../api/client";
import type { Tag } from "../types";

interface TagWithCount extends Tag {
  move_count: number;
}

export default function CollectionTagsPage() {
  const { id } = useParams();
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [collectionName, setCollectionName] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      client.get(`/collections/${id}`),
      client.get(`/collections/${id}/tags`),
    ]).then(([colRes, tagsRes]) => {
      setCollectionName(colRes.data.name);
      // Tags don't have move_count from the API yet, set to 0 for now
      setTags(tagsRes.data.map((t: Tag) => ({ ...t, move_count: 0 })));
      setLoading(false);
    });
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
    if (!name || !id) return;
    try {
      const res = await client.patch(`/collections/${id}/tags/${tagId}`, { name });
      setTags((prev) => prev.map((t) => (t.id === tagId ? { ...t, ...res.data } : t)));
      setEditingId(null);
      setEditValue("");
    } catch {
      // duplicate or error
    }
  };

  const handleDelete = async (tagId: string) => {
    if (!id) return;
    await client.delete(`/collections/${id}/tags/${tagId}`);
    setTags((prev) => prev.filter((t) => t.id !== tagId));
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
        <button className="btn btn-primary" onClick={handleCreate} disabled={!newTagName.trim()}>
          Create
        </button>
      </div>

      {tags.length === 0 ? (
        <p className="empty-state">No tags yet. Create one above.</p>
      ) : (
        <div className="tag-manager-list">
          {tags
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((tag) => (
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
                  />
                ) : (
                  <span
                    className="tag-manager-name"
                    onClick={() => {
                      setEditingId(tag.id);
                      setEditValue(tag.name);
                    }}
                    title="Click to rename"
                  >
                    {tag.name}
                  </span>
                )}
                <button
                  className="btn-icon btn-danger-icon"
                  onClick={() => handleDelete(tag.id)}
                  title="Delete tag"
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
