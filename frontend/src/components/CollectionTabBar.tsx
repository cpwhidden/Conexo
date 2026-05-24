import { NavLink } from "react-router-dom";

export type CollectionTab = "list" | "flow" | "graph" | "learn" | "tags";

interface CollectionTabBarProps {
  collectionId: string;
  collectionName: string;
  active: CollectionTab;
  toolbar?: React.ReactNode;
}

const TABS: { key: CollectionTab; label: string; subpath: string }[] = [
  { key: "list", label: "List", subpath: "moves" },
  { key: "flow", label: "Flow", subpath: "flow" },
  { key: "graph", label: "Graph", subpath: "graph" },
  { key: "learn", label: "Learn", subpath: "learn" },
  { key: "tags", label: "Tag", subpath: "tags" },
];

export default function CollectionTabBar({
  collectionId,
  collectionName,
  active,
  toolbar,
}: CollectionTabBarProps) {
  return (
    <div className="collection-page-header">
      <div className="collection-page-titlebar">
        <h2 className="collection-page-title">{collectionName}</h2>
        <div className="collection-tab-bar" role="tablist">
          {TABS.map((tab) => (
            <NavLink
              key={tab.key}
              to={`/collections/${collectionId}/${tab.subpath}`}
              end={false}
              className={`collection-tab${active === tab.key ? " active" : ""}`}
              role="tab"
              aria-selected={active === tab.key}
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      </div>
      {toolbar && <div className="collection-page-toolbar">{toolbar}</div>}
    </div>
  );
}
