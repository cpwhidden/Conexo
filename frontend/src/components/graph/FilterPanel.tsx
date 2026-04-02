import { useEffect, useRef, useState } from "react";
import client from "../../api/client";
import type { CollectionFilter, MoveGraphData, Tag } from "../../types";
import RangeFilter from "./RangeFilter";
import {
  type Filters,
  type TriState,
  type MoveTypeFilter,
  DEFAULT_FILTERS,
  applyFilters,
} from "../../utils/moveFilter";

interface FilterPanelProps {
  moves: MoveGraphData[];
  collectionId: string;
  collectionTags: Tag[];
  activeFilter: Filters;
  activeFilterId: string | null;
  activeFilterName: string | null;
  onFilterChange: (filters: Filters) => void;
  onFilterIdChange: (id: string | null, name: string | null) => void;
  onClose: () => void;
  closing?: boolean;
}

function SegmentedTriState({
  value,
  onChange,
}: {
  value: TriState;
  onChange: (v: TriState) => void;
}) {
  return (
    <div className="segmented-control segmented-small">
      {(["any", "yes", "no"] as const).map((v) => (
        <button
          key={v}
          type="button"
          className={value === v ? "active" : ""}
          onClick={() => onChange(v)}
        >
          {v.charAt(0).toUpperCase() + v.slice(1)}
        </button>
      ))}
    </div>
  );
}

export default function FilterPanel({
  moves,
  collectionId,
  collectionTags,
  activeFilter,
  activeFilterId,
  activeFilterName,
  onFilterChange,
  onFilterIdChange,
  onClose,
  closing,
}: FilterPanelProps) {
  const filters = activeFilter;
  const [scoresExpanded, setScoresExpanded] = useState(false);
  const [boolsExpanded, setBoolsExpanded] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Saved filters
  const [savedFilters, setSavedFilters] = useState<CollectionFilter[]>([]);
  const [saveName, setSaveName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load saved filters
  useEffect(() => {
    client
      .get(`/collections/${collectionId}/filters`)
      .then((res) => setSavedFilters(res.data))
      .catch(console.error);
  }, [collectionId]);

  const update = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const filteredMoves = applyFilters(moves, filters);
  const hasActiveFilters =
    JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  // Save / Update / Delete handlers
  const handleSave = async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      const res = await client.post(
        `/collections/${collectionId}/filters`,
        { name: saveName.trim(), criteria: filters }
      );
      const newFilter: CollectionFilter = res.data;
      setSavedFilters((prev) => [...prev, newFilter].sort((a, b) => a.name.localeCompare(b.name)));
      onFilterIdChange(newFilter.id, newFilter.name);
      setShowSaveInput(false);
      setSaveName("");
    } catch (err: unknown) {
      const error = err as { response?: { status?: number } };
      if (error.response?.status === 409) {
        alert("A filter with this name already exists.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!activeFilterId) return;
    setSaving(true);
    try {
      const res = await client.put(
        `/collections/${collectionId}/filters/${activeFilterId}`,
        { criteria: filters }
      );
      const updated: CollectionFilter = res.data;
      setSavedFilters((prev) =>
        prev.map((f) => (f.id === updated.id ? updated : f))
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!activeFilterId) return;
    try {
      await client.delete(
        `/collections/${collectionId}/filters/${activeFilterId}`
      );
      setSavedFilters((prev) => prev.filter((f) => f.id !== activeFilterId));
      onFilterIdChange(null, null);
      onFilterChange({ ...DEFAULT_FILTERS });
    } catch {
      // ignore
    }
  };

  const handleLoadFilter = (filterId: string) => {
    if (!filterId) {
      onFilterIdChange(null, null);
      onFilterChange({ ...DEFAULT_FILTERS });
      return;
    }
    const sf = savedFilters.find((f) => f.id === filterId);
    if (!sf) return;
    // Merge saved criteria onto DEFAULT_FILTERS to fill any missing keys
    const loaded: Filters = { ...DEFAULT_FILTERS, ...(sf.criteria as Partial<Filters>) };
    onFilterChange(loaded);
    onFilterIdChange(sf.id, sf.name);
  };

  // Tag helpers
  const handleTagToggle = (tagName: string) => {
    const current = filters.selectedTagNames;
    if (current.includes(tagName)) {
      update(
        "selectedTagNames",
        current.filter((t) => t !== tagName)
      );
    } else {
      update("selectedTagNames", [...current, tagName]);
    }
  };



  const clearTags = () => {
    update("selectedTagNames", []);
  };

  return (
    <div className="slide-panel-container">
      <div
        className={`slide-panel filter-panel ${closing ? "closing" : ""}`}
      >
        <div
          className="slide-panel-header"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest(".btn-icon")) return;
            contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          }}
          style={{ cursor: "pointer" }}
        >
          <h3>Collection Filter</h3>
          <button className="btn-icon" onClick={onClose} title="Close">
            &times;
          </button>
        </div>

        <div className="slide-panel-content" ref={contentRef}>
          {/* Save / Load section */}
          <div className="filter-save-section">
            <div className="filter-save-row">
              <select
                className="filter-load-select"
                value={activeFilterId || ""}
                onChange={(e) => handleLoadFilter(e.target.value)}
              >
                <option value="">Load saved filter...</option>
                {savedFilters.map((sf) => (
                  <option key={sf.id} value={sf.id}>
                    {sf.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-save-row">
              {activeFilterId ? (
                <>
                  <button
                    className="btn btn-primary btn-small"
                    onClick={handleUpdate}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Update"}
                  </button>
                  <button
                    className="btn btn-danger btn-small"
                    onClick={handleDelete}
                  >
                    Delete
                  </button>
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => setShowSaveInput(true)}
                  >
                    Save As
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-secondary btn-small"
                  onClick={() => setShowSaveInput(true)}
                >
                  Save Filter
                </button>
              )}
            </div>
            {showSaveInput && (
              <div className="filter-save-row">
                <input
                  type="text"
                  placeholder="Filter name..."
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  className="filter-name-input"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                    if (e.key === "Escape") setShowSaveInput(false);
                  }}
                />
                <button
                  className="btn btn-primary btn-small"
                  onClick={handleSave}
                  disabled={saving || !saveName.trim()}
                >
                  Save
                </button>
                <button
                  className="btn btn-secondary btn-small"
                  onClick={() => {
                    setShowSaveInput(false);
                    setSaveName("");
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Text search */}
          <input
            type="text"
            placeholder="Search name, description, tags, cues, notes..."
            value={filters.text}
            onChange={(e) => update("text", e.target.value)}
            className="adv-search-text"
          />

          {/* Move type */}
          <div className="adv-filter-row">
            <span className="adv-filter-label">Move Type</span>
            <div className="segmented-control segmented-small">
              {(["any", "movement", "state"] as MoveTypeFilter[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={filters.moveType === v ? "active" : ""}
                  onClick={() => update("moveType", v)}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Starting beat & beat count */}
          <div className="adv-filter-row">
            <label className="adv-filter-inline">
              Starting Beat
              <input
                type="number"
                min={1}
                max={8}
                value={filters.startingBeat}
                onChange={(e) => update("startingBeat", e.target.value)}
                placeholder="Any"
                className="adv-input-small"
              />
            </label>
            <label className="adv-filter-inline">
              Beat Count
              <input
                type="number"
                min={0}
                value={filters.beatCount}
                onChange={(e) => update("beatCount", e.target.value)}
                placeholder="Any"
                className="adv-input-small"
              />
            </label>
          </div>

          {/* Connection counts */}
          <div className="adv-filter-row">
            <label className="adv-filter-inline">
              Outgoing &ge;
              <input
                type="number"
                min={0}
                value={filters.minOutgoing}
                onChange={(e) => update("minOutgoing", e.target.value)}
                placeholder="Min"
                className="adv-input-small"
              />
            </label>
            <label className="adv-filter-inline">
              Outgoing &le;
              <input
                type="number"
                min={0}
                value={filters.maxOutgoing}
                onChange={(e) => update("maxOutgoing", e.target.value)}
                placeholder="Max"
                className="adv-input-small"
              />
            </label>
          </div>
          <div className="adv-filter-row">
            <label className="adv-filter-inline">
              Incoming &ge;
              <input
                type="number"
                min={0}
                value={filters.minIncoming}
                onChange={(e) => update("minIncoming", e.target.value)}
                placeholder="Min"
                className="adv-input-small"
              />
            </label>
            <label className="adv-filter-inline">
              Incoming &le;
              <input
                type="number"
                min={0}
                value={filters.maxIncoming}
                onChange={(e) => update("maxIncoming", e.target.value)}
                placeholder="Max"
                className="adv-input-small"
              />
            </label>
          </div>

          {/* Score ranges (collapsible) */}
          <div className="adv-section">
            <div
              className="adv-section-header"
              onClick={() => setScoresExpanded(!scoresExpanded)}
            >
              <span
                className={`cues-toggle ${scoresExpanded ? "expanded" : ""}`}
              >
                &#9654;
              </span>
              <span>Score Ranges</span>
            </div>
            {scoresExpanded && (
              <div className="adv-section-body">
                <RangeFilter
                  label="Difficulty"
                  value={filters.difficulty}
                  onChange={(v) => update("difficulty", v)}
                />
                <RangeFilter
                  label="Leadability"
                  value={filters.leadability}
                  onChange={(v) => update("leadability", v)}
                />
                <RangeFilter
                  label="Familiarity"
                  value={filters.familiarity}
                  onChange={(v) => update("familiarity", v)}
                />
                <RangeFilter
                  label="Mental Availability"
                  value={filters.mentalAvailability}
                  onChange={(v) => update("mentalAvailability", v)}
                />
                <RangeFilter
                  label="Learning Priority"
                  value={filters.learningPriority}
                  onChange={(v) => update("learningPriority", v)}
                />
                <RangeFilter
                  label="Impact"
                  value={filters.impact}
                  onChange={(v) => update("impact", v)}
                />
                <RangeFilter
                  label="Beat Energy"
                  value={filters.beatEnergy}
                  onChange={(v) => update("beatEnergy", v)}
                />
                <RangeFilter
                  label="Moderna Energy"
                  value={filters.modernaEnergy}
                  onChange={(v) => update("modernaEnergy", v)}
                />
                <RangeFilter
                  label="Sensual Energy"
                  value={filters.sensualEnergy}
                  onChange={(v) => update("sensualEnergy", v)}
                />
              </div>
            )}
          </div>

          {/* Boolean filters (collapsible) */}
          <div className="adv-section">
            <div
              className="adv-section-header"
              onClick={() => setBoolsExpanded(!boolsExpanded)}
            >
              <span
                className={`cues-toggle ${boolsExpanded ? "expanded" : ""}`}
              >
                &#9654;
              </span>
              <span>Attributes</span>
            </div>
            {boolsExpanded && (
              <div className="adv-section-body">
                <div className="adv-bool-row">
                  <span>Has Media</span>
                  <SegmentedTriState
                    value={filters.hasMedia}
                    onChange={(v) => update("hasMedia", v)}
                  />
                </div>
                <div className="adv-bool-row">
                  <span>Is Core</span>
                  <SegmentedTriState
                    value={filters.isCore}
                    onChange={(v) => update("isCore", v)}
                  />
                </div>
                <div className="adv-bool-row">
                  <span>Has Learning Notes</span>
                  <SegmentedTriState
                    value={filters.hasLearningNotes}
                    onChange={(v) => update("hasLearningNotes", v)}
                  />
                </div>
                <div className="adv-bool-row">
                  <span>Has Tags</span>
                  <SegmentedTriState
                    value={filters.hasTags}
                    onChange={(v) => update("hasTags", v)}
                  />
                </div>
                <div className="adv-bool-row">
                  <span>Has Leader Styling</span>
                  <SegmentedTriState
                    value={filters.hasLeaderStyling}
                    onChange={(v) => update("hasLeaderStyling", v)}
                  />
                </div>
                <div className="adv-bool-row">
                  <span>Has Follower Styling</span>
                  <SegmentedTriState
                    value={filters.hasFollowerStyling}
                    onChange={(v) => update("hasFollowerStyling", v)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Tag filter section */}
          {collectionTags.length > 0 && (
            <div className="adv-section">
              <div
                className="adv-section-header"
                onClick={() => setTagsExpanded(!tagsExpanded)}
              >
                <span
                  className={`cues-toggle ${tagsExpanded ? "expanded" : ""}`}
                >
                  &#9654;
                </span>
                <span>
                  Tags
                  {filters.selectedTagNames.length > 0 && (
                    <span className="filter-tag-count">
                      {" "}
                      ({filters.selectedTagNames.length})
                    </span>
                  )}
                </span>
              </div>
              {tagsExpanded && (
                <div className="adv-section-body">
                  {/* Selected tags as pills */}
                  {filters.selectedTagNames.length > 0 && (
                    <div className="filter-tag-pills">
                      {filters.selectedTagNames.map((name) => (
                        <span key={name} className="filter-tag-pill">
                          {name}
                          <button
                            type="button"
                            className="filter-tag-pill-remove"
                            onClick={() => handleTagToggle(name)}
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                      <button
                        type="button"
                        className="btn-link-small"
                        onClick={clearTags}
                      >
                        Clear all
                      </button>
                    </div>
                  )}

                  {/* Searchable tag input */}
                  <div className="filter-tag-search">
                    <input
                      ref={tagInputRef}
                      type="text"
                      placeholder="Search tags..."
                      value={tagSearch}
                      onChange={(e) => {
                        setTagSearch(e.target.value);
                        setShowTagSuggestions(true);
                      }}
                      onFocus={() => setShowTagSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowTagSuggestions(false), 150)}
                    />
                    {showTagSuggestions && tagSearch.trim() && (
                      <div className="filter-tag-dropdown">
                        {collectionTags
                          .filter(
                            (t) =>
                              t.name.toLowerCase().includes(tagSearch.toLowerCase()) &&
                              !filters.selectedTagNames.includes(t.name)
                          )
                          .map((tag) => (
                            <div
                              key={tag.id}
                              className="filter-tag-option"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleTagToggle(tag.name);
                                setTagSearch("");
                              }}
                            >
                              {tag.name}
                            </div>
                          ))}
                        {collectionTags.filter(
                          (t) =>
                            t.name.toLowerCase().includes(tagSearch.toLowerCase()) &&
                            !filters.selectedTagNames.includes(t.name)
                        ).length === 0 && (
                          <div className="filter-tag-option disabled">No matching tags</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="filter-footer">
            <div className="adv-results-header">
              {filteredMoves.length} of {moves.length} moves
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => {
                  onFilterChange({ ...DEFAULT_FILTERS });
                  onFilterIdChange(null, null);
                }}
              >
                Clear Filter
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
