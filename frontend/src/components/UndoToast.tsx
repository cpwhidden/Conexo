import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/** How long the undo offer stays on screen. */
const UNDO_TIMEOUT_MS = 12000;

type UndoRequest = {
  /** What just happened, e.g. `Deleted "Open Break"`. */
  message: string;
  /** Reverses the action. Rejecting leaves the toast up with an error. */
  onUndo: () => void | Promise<void>;
};

type UndoContextValue = {
  showUndo: (request: UndoRequest) => void;
};

const UndoContext = createContext<UndoContextValue | null>(null);

export function useUndo(): UndoContextValue {
  const ctx = useContext(UndoContext);
  if (!ctx) {
    throw new Error("useUndo must be used inside an UndoProvider");
  }
  return ctx;
}

/**
 * Holds the "… Undo" toast above the router outlet so the offer survives the
 * navigation that usually follows a delete.
 */
export function UndoProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<UndoRequest | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setRequest(null);
    setUndoing(false);
    setError(null);
  }, [clearTimer]);

  const showUndo = useCallback(
    (next: UndoRequest) => {
      clearTimer();
      setError(null);
      setUndoing(false);
      setRequest(next);
    },
    [clearTimer]
  );

  // Auto-dismiss, but never out from under an in-flight undo or an error the
  // user still needs to read.
  useEffect(() => {
    if (!request || undoing || error) return;
    timerRef.current = window.setTimeout(() => setRequest(null), UNDO_TIMEOUT_MS);
    return () => {
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
    };
  }, [request, undoing, error]);

  const handleUndo = async () => {
    if (!request || undoing) return;
    clearTimer();
    setUndoing(true);
    setError(null);
    try {
      await request.onUndo();
      setRequest(null);
      setUndoing(false);
    } catch {
      setUndoing(false);
      setError("Couldn't undo — it's still in the trash.");
    }
  };

  return (
    <UndoContext.Provider value={{ showUndo }}>
      {children}
      {request && (
        <div className="undo-toast" role="status" aria-live="polite">
          <span className="undo-toast-message">{error ?? request.message}</span>
          <button
            type="button"
            className="undo-toast-action"
            onClick={handleUndo}
            disabled={undoing}
          >
            {undoing ? "Undoing…" : error ? "Retry" : "Undo"}
          </button>
          <button
            type="button"
            className="undo-toast-dismiss"
            onClick={dismiss}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
    </UndoContext.Provider>
  );
}
