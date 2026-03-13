import { useCallback, useEffect, useState } from "react";
import client from "../api/client";
import type { Move } from "../types";

export function useMoves() {
  const [moves, setMoves] = useState<Move[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMoves = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get("/moves");
      setMoves(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMoves();
  }, [fetchMoves]);

  return { moves, loading, refetch: fetchMoves };
}
