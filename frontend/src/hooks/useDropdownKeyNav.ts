import { useState, useCallback, useEffect } from "react";

interface UseDropdownKeyNavOptions {
  itemCount: number;
  onSelect: (index: number) => void;
  onEscape?: () => void;
  enabled?: boolean;
}

export function useDropdownKeyNav({
  itemCount,
  onSelect,
  onEscape,
  enabled = true,
}: UseDropdownKeyNavOptions) {
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Reset index when item count changes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [itemCount]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!enabled || itemCount === 0) return;
      const maxIndex = itemCount - 1;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < maxIndex ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : maxIndex));
      } else if (e.key === "Enter" && highlightedIndex >= 0) {
        e.preventDefault();
        onSelect(highlightedIndex);
      } else if (e.key === "Escape" && onEscape) {
        onEscape();
        setHighlightedIndex(-1);
      }
    },
    [enabled, itemCount, highlightedIndex, onSelect, onEscape]
  );

  return { highlightedIndex, setHighlightedIndex, handleKeyDown };
}
