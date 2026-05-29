import React from "react";

/**
 * Returns true if ALL space-separated terms in `query` appear somewhere
 * in `text` (case-insensitive). Empty query matches everything.
 */
export function multiTermMatch(text: string, query: string): boolean {
  if (!query.trim()) return true;
  const lower = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => lower.includes(term));
}

/**
 * Returns React nodes with matched portions wrapped in <mark>.
 * Each search term is highlighted independently wherever it appears.
 */
export function highlightTerms(
  text: string,
  query: string
): React.ReactNode {
  if (!query.trim()) return text;
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) return text;

  // Build a regex matching any of the search terms (longest first to avoid partial overlap)
  const escaped = terms
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");

  // Splitting on a capturing group yields the matched terms as their own
  // entries; those are exactly the search terms (case-insensitively), so test
  // membership directly instead of a stateful global-regex .test() (whose
  // lastIndex would carry over between calls and mis-highlight).
  const termSet = new Set(terms);
  const parts = text.split(regex);
  return parts.map((part, i) =>
    part && termSet.has(part.toLowerCase()) ? <mark key={i}>{part}</mark> : part
  );
}
