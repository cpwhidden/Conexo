import { useState, useEffect, useRef, useCallback } from "react";
import type { Tag } from "../types";
import client from "../api/client";
import { useDropdownKeyNav } from "../hooks/useDropdownKeyNav";

interface TagEditorProps {
  collectionId: string;
  collectionName: string;
  moveId: string;
}

export default function TagEditor({ collectionId, collectionName, moveId }: TagEditorProps) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [moveTags, setMoveTags] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    client.get(`/collections/${collectionId}/moves/${moveId}/tags`).then((res) => setMoveTags(res.data));
    client.get(`/collections/${collectionId}/tags`).then((res) => setAllTags(res.data));
  }, [collectionId, moveId]);

  const availableTags = allTags.filter(
    (t) => !moveTags.some((mt) => mt.id === t.id)
  );

  const filteredSuggestions = availableTags.filter((t) =>
    t.name.toLowerCase().includes(tagInput.toLowerCase())
  );

  const exactMatch = availableTags.find(
    (t) => t.name.toLowerCase() === tagInput.toLowerCase()
  );

  const handleAddTag = async (tag: Tag) => {
    await client.post(`/collections/${collectionId}/tags/${tag.id}/moves`, { move_id: moveId });
    setMoveTags((prev) => [...prev, tag]);
    setTagInput("");
    setShowSuggestions(false);
  };

  const handleCreateTag = async () => {
    if (!tagInput.trim()) return;
    try {
      const createRes = await client.post(`/collections/${collectionId}/tags`, {
        name: tagInput.trim(),
      });
      const newTag = createRes.data;
      await client.post(`/collections/${collectionId}/tags/${newTag.id}/moves`, { move_id: moveId });
      setAllTags((prev) => [...prev, newTag]);
      setMoveTags((prev) => [...prev, newTag]);
      setTagInput("");
      setShowSuggestions(false);
    } catch (err) {
      console.error("Failed to create tag:", err);
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    await client.delete(`/collections/${collectionId}/tags/${tagId}/moves/${moveId}`);
    setMoveTags((prev) => prev.filter((t) => t.id !== tagId));
  };

  const itemCount =
    filteredSuggestions.length + (!exactMatch && tagInput.trim() ? 1 : 0);

  const handleSelect = useCallback(
    (index: number) => {
      if (index < filteredSuggestions.length) {
        handleAddTag(filteredSuggestions[index]);
      } else {
        handleCreateTag();
      }
    },
    [filteredSuggestions, tagInput]
  );

  const { highlightedIndex, handleKeyDown: handleNavKeyDown } =
    useDropdownKeyNav({
      itemCount,
      onSelect: handleSelect,
      onEscape: () => {
        setShowSuggestions(false);
        setTagInput("");
      },
      enabled: showSuggestions && !!tagInput,
    });

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    handleNavKeyDown(e);
    if (e.defaultPrevented) return;
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (exactMatch) {
        handleAddTag(exactMatch);
      } else if (filteredSuggestions.length === 1) {
        handleAddTag(filteredSuggestions[0]);
      } else {
        handleCreateTag();
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setTagInput("");
    }
  };

  return (
    <div className="collection-tags-group">
      <span className="collection-tags-group-label">{collectionName}</span>
      <div className="themes-tag-container">
        {moveTags.map((tag) => (
          <span key={tag.id} className="theme-tag">
            {tag.name}
            <button
              className="theme-tag-remove"
              onClick={() => handleRemoveTag(tag.id)}
              title="Remove tag"
            >
              &times;
            </button>
          </span>
        ))}
        <div className="theme-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            className="theme-input"
            placeholder="Add tag..."
            value={tagInput}
            onChange={(e) => {
              setTagInput(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => {
              setTimeout(() => setShowSuggestions(false), 200);
            }}
            onKeyDown={handleInputKeyDown}
          />
          {showSuggestions && tagInput && (
            <div className="theme-suggestions">
              {filteredSuggestions.map((tag, idx) => (
                <div
                  key={tag.id}
                  className={`theme-suggestion ${idx === highlightedIndex ? "highlighted" : ""}`}
                  onMouseDown={() => handleAddTag(tag)}
                >
                  {tag.name}
                </div>
              ))}
              {!exactMatch && tagInput.trim() && (
                <div
                  className={`theme-suggestion theme-suggestion-new ${filteredSuggestions.length === highlightedIndex ? "highlighted" : ""}`}
                  onMouseDown={() => handleCreateTag()}
                >
                  Create "{tagInput.trim()}"
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
