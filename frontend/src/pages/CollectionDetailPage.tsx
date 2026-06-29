import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import client from "../api/client";
import CollectionTabBar from "../components/CollectionTabBar";
import FilterPanel from "../components/graph/FilterPanel";
import {
  type Filters,
  DEFAULT_FILTERS,
  applyFilters,
} from "../utils/moveFilter";
import type {
  CollectionWithMoves,
  Move,
  MoveGraphData,
  Tag,
  CollectionMoveAdd,
} from "../types";

export default function CollectionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [collection, setCollection] = useState<CollectionWithMoves | null>(null);
  const [availableMoves, setAvailableMoves] = useState<Move[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedMoveId, setSelectedMoveId] = useState("");
  const [moveNotes, setMoveNotes] = useState("");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "" });

  // Filter & search (shared model with the Flow/Graph views)
  const [graphMoves, setGraphMoves] = useState<MoveGraphData[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [activeFilter, setActiveFilter] = useState<Filters>({ ...DEFAULT_FILTERS });
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [activeFilterName, setActiveFilterName] = useState<string | null>(null);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  useEffect(() => {
    loadCollection();
    loadMoves();
    loadGraphData();
  }, [id]);

  const loadCollection = async () => {
    try {
      const res = await client.get(`/collections/${id}`);
      setCollection(res.data);
      setEditForm({
        name: res.data.name,
        description: res.data.description || "",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadMoves = async () => {
    const res = await client.get("/moves");
    setAvailableMoves(res.data);
  };

  // Rich move data (scores, tags, cues, connection counts) used for filtering.
  const loadGraphData = async () => {
    const res = await client.get(`/collections/${id}/graph-data`);
    setGraphMoves(res.data.moves || []);
    setTags(res.data.tags || []);
  };

  const isFilterActive =
    JSON.stringify(activeFilter) !== JSON.stringify(DEFAULT_FILTERS);

  const filteredMoveIds = useMemo(
    () => new Set(applyFilters(graphMoves, activeFilter).map((m) => m.id)),
    [graphMoves, activeFilter]
  );

  const handleAddMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMoveId) return;

    const payload: CollectionMoveAdd = {
      move_id: selectedMoveId,
      notes: moveNotes || null,
    };

    await client.post(`/collections/${id}/moves`, payload);
    setSelectedMoveId("");
    setMoveNotes("");
    setShowAddForm(false);
    loadCollection();
    loadGraphData();
  };

  const handleRemoveMove = async (moveId: string) => {
    await client.delete(`/collections/${id}/moves/${moveId}`);
    loadCollection();
    loadGraphData();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    await client.put(`/collections/${id}`, {
      name: editForm.name,
      description: editForm.description || null,
    });
    setEditing(false);
    loadCollection();
  };

  const handleDelete = async () => {
    if (!confirm("Delete this collection?")) return;
    await client.delete(`/collections/${id}`);
    navigate("/collections");
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (!collection) return <div className="loading">Collection not found</div>;

  // Filter moves that aren't already in collection
  const moveIdsInCollection = new Set(collection.moves.map((m) => m.move_id));
  const eligibleMoves = availableMoves.filter(
    (m) => !moveIdsInCollection.has(m.id)
  );

  const toolbar = editing ? (
    <form onSubmit={handleUpdate} className="edit-form">
      <input
        type="text"
        value={editForm.name}
        onChange={(e) =>
          setEditForm({ ...editForm, name: e.target.value })
        }
        required
      />
      <input
        type="text"
        placeholder="Description"
        value={editForm.description}
        onChange={(e) =>
          setEditForm({ ...editForm, description: e.target.value })
        }
      />
      <button type="submit" className="btn btn-primary">
        Save
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => setEditing(false)}
      >
        Cancel
      </button>
    </form>
  ) : (
    <>
      <span className="detail-style">{collection.dance_style}</span>
      {collection.description && (
        <span className="detail-description-inline">{collection.description}</span>
      )}
      <div className="toolbar-spacer" />
      <div className="graph-search">
        <input
          type="text"
          placeholder="Search moves..."
          value={activeFilter.text}
          onChange={(e) =>
            setActiveFilter({ ...activeFilter, text: e.target.value })
          }
        />
      </div>
      <button
        className={`btn-icon filter-toggle ${filterPanelOpen ? "active" : ""} ${isFilterActive ? "filter-active" : ""}`}
        onClick={() => setFilterPanelOpen(!filterPanelOpen)}
        title="Collection Filter"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="1,1 19,1 12,10 12,16 8,18 8,10" />
        </svg>
      </button>
      <button
        className="btn btn-secondary"
        onClick={() => setShowAddForm(!showAddForm)}
      >
        {showAddForm ? "Cancel" : "Add Move"}
      </button>
      <button
        className="btn btn-secondary"
        onClick={() => setEditing(true)}
      >
        Edit
      </button>
      <button className="btn btn-danger" onClick={handleDelete}>
        Delete
      </button>
    </>
  );

  const visibleMoves = isFilterActive
    ? collection.moves.filter((cm) => filteredMoveIds.has(cm.move_id))
    : collection.moves;

  return (
    <div className="collection-detail-page">
      <CollectionTabBar
        collectionId={id!}
        collectionName={collection.name}
        active="list"
        toolbar={toolbar}
      />

      <div className="collection-moves-section">
        <div className="section-header">
          <h3>
            Moves (
            {isFilterActive
              ? `${visibleMoves.length} of ${collection.moves.length}`
              : collection.moves.length}
            )
          </h3>
        </div>

        {showAddForm && (
          eligibleMoves.length === 0 ? (
            <p className="empty-state">All moves are already in this collection.</p>
          ) : (
            <form onSubmit={handleAddMove} className="inline-form">
              <select
                value={selectedMoveId}
                onChange={(e) => setSelectedMoveId(e.target.value)}
                required
              >
                <option value="">Select a move...</option>
                {eligibleMoves.map((move) => (
                  <option key={move.id} value={move.id}>
                    {move.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Notes (optional)"
                value={moveNotes}
                onChange={(e) => setMoveNotes(e.target.value)}
              />
              <button type="submit" className="btn btn-primary">
                Add
              </button>
            </form>
          )
        )}

        {collection.moves.length === 0 ? (
          <div className="empty">No moves in this collection yet</div>
        ) : visibleMoves.length === 0 ? (
          <div className="empty">No moves match the current filter</div>
        ) : (
          <ul className="collection-moves-list">
            {visibleMoves.map((cm) => (
              <li key={cm.id} className="collection-move-item">
                <Link to={`/moves/${cm.move_id}`} className="move-link">
                  {cm.move_name}
                </Link>
                {cm.notes && <span className="move-notes">{cm.notes}</span>}
                <button
                  className="btn-icon"
                  onClick={() => handleRemoveMove(cm.move_id)}
                  title="Remove from collection"
                >
                  &times;
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {filterPanelOpen && (
        <FilterPanel
          moves={graphMoves}
          collectionId={id!}
          collectionTags={tags}
          activeFilter={activeFilter}
          activeFilterId={activeFilterId}
          activeFilterName={activeFilterName}
          onFilterChange={setActiveFilter}
          onFilterIdChange={(fid, fname) => {
            setActiveFilterId(fid);
            setActiveFilterName(fname);
          }}
          onClose={() => setFilterPanelOpen(false)}
        />
      )}
    </div>
  );
}
