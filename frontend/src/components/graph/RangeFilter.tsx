import { useCallback, useRef } from "react";

export type RangeValue = [number, number] | "not-set" | null;

interface RangeFilterProps {
  label: string;
  min?: number;
  max?: number;
  value: RangeValue;
  onChange: (value: RangeValue) => void;
}

type RangeMode = "any" | "range" | "not-set";

function getMode(value: RangeValue): RangeMode {
  if (value === null) return "any";
  if (value === "not-set") return "not-set";
  return "range";
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export default function RangeFilter({
  label,
  min = 0,
  max = 10,
  value,
  onChange,
}: RangeFilterProps) {
  const mode = getMode(value);
  const lo = Array.isArray(value) ? value[0] : min;
  const hi = Array.isArray(value) ? value[1] : max;
  const trackRef = useRef<HTMLDivElement>(null);

  const loPercent = ((lo - min) / (max - min)) * 100;
  const hiPercent = ((hi - min) / (max - min)) * 100;

  const getValueFromX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return min;
      const rect = track.getBoundingClientRect();
      const pct = (clientX - rect.left) / rect.width;
      return clamp(Math.round(pct * (max - min) + min), min, max);
    },
    [min, max]
  );

  const startDrag = useCallback(
    (thumb: "lo" | "hi") => {
      const onMove = (e: MouseEvent | TouchEvent) => {
        const clientX =
          "touches" in e ? e.touches[0].clientX : e.clientX;
        const v = getValueFromX(clientX);
        if (thumb === "lo") {
          onChange([Math.min(v, hi), hi]);
        } else {
          onChange([lo, Math.max(v, lo)]);
        }
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("touchmove", onMove);
      document.addEventListener("touchend", onUp);
    },
    [lo, hi, getValueFromX, onChange]
  );

  return (
    <div className="range-filter">
      <div className="range-filter-header">
        <span className="range-filter-label">{label}</span>
        <div className="segmented-control segmented-tiny">
          <button
            type="button"
            className={mode === "any" ? "active" : ""}
            onClick={() => onChange(null)}
          >
            Any
          </button>
          <button
            type="button"
            className={mode === "range" ? "active" : ""}
            onClick={() => {
              if (mode !== "range") onChange([min, max]);
            }}
          >
            Range
          </button>
          <button
            type="button"
            className={mode === "not-set" ? "active" : ""}
            onClick={() => onChange("not-set")}
          >
            Not Set
          </button>
        </div>
      </div>
      {mode === "range" && Array.isArray(value) && (
        <div className="dual-range" ref={trackRef}>
          <div className="dual-range-track">
            <div
              className="dual-range-fill"
              style={{ left: `${loPercent}%`, width: `${hiPercent - loPercent}%` }}
            />
          </div>

          {/* Min thumb — stem up, knob with label to its right */}
          <div
            className="dual-range-thumb dual-range-thumb-lo"
            style={{ left: `${loPercent}%` }}
            onMouseDown={(e) => {
              e.preventDefault();
              startDrag("lo");
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              startDrag("lo");
            }}
          >
            <div className="dual-range-stem" />
            <div className="dual-range-knob-row">
              <div className="dual-range-knob" />
              <span className="dual-range-thumb-label">{lo}</span>
            </div>
          </div>

          {/* Max thumb — label to left of knob, then stem down */}
          <div
            className="dual-range-thumb dual-range-thumb-hi"
            style={{ left: `${hiPercent}%` }}
            onMouseDown={(e) => {
              e.preventDefault();
              startDrag("hi");
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              startDrag("hi");
            }}
          >
            <div className="dual-range-knob-row">
              <span className="dual-range-thumb-label">{hi}</span>
              <div className="dual-range-knob" />
            </div>
            <div className="dual-range-stem" />
          </div>
        </div>
      )}
    </div>
  );
}
