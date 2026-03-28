import { useCallback, useEffect, useRef, useState } from "react";
import client from "../api/client";
import type { Media } from "../types";
import { trimVideo } from "../utils/ffmpeg";

interface MediaUploadDialogProps {
  file: File;
  moveId: string;
  onUploaded: (media: Media) => void;
  onCancel: () => void;
}

function stripExtension(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  return dotIndex > 0 ? name.slice(0, dotIndex) : name;
}

function getExtension(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  return dotIndex > 0 ? name.slice(dotIndex + 1) : "mp4";
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function MediaUploadDialog({
  file,
  moveId,
  onUploaded,
  onCancel,
}: MediaUploadDialogProps) {
  const [filename, setFilename] = useState(stripExtension(file.name));
  const [objectURL, setObjectURL] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Trim state
  const [showTrim, setShowTrim] = useState(false);
  const [ffmpegLoading, setFfmpegLoading] = useState(false);
  const [trimStart, setTrimStart] = useState<string>("");
  const [trimEnd, setTrimEnd] = useState<string>("");
  const [trimming, setTrimming] = useState(false);

  const [duration, setDuration] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Create object URL on mount, revoke on unmount (Strict Mode safe)
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectURL(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);

  const handleTrimToggle = useCallback(async () => {
    if (showTrim) {
      // Collapse trim controls and clear values
      setShowTrim(false);
      setTrimStart("");
      setTrimEnd("");
      return;
    }

    // First time: lazy-load FFmpeg
    setFfmpegLoading(true);
    try {
      // Trigger the dynamic import so it's cached for later
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const ffmpeg = new FFmpeg();
      await ffmpeg.load();
      // Store for reuse (the trimVideo util also caches, but this warms it up)
    } catch {
      setError("Failed to load trimming library. Please try again.");
      setFfmpegLoading(false);
      return;
    }
    setFfmpegLoading(false);
    setShowTrim(true);
  }, [showTrim]);

  const setCurrentAsStart = useCallback(() => {
    if (videoRef.current) {
      setTrimStart(videoRef.current.currentTime.toFixed(1));
    }
  }, []);

  const setCurrentAsEnd = useCallback(() => {
    if (videoRef.current) {
      setTrimEnd(videoRef.current.currentTime.toFixed(1));
    }
  }, []);

  const handleUpload = useCallback(async () => {
    const finalName = filename.trim() || "media";
    const ext = getExtension(file.name);

    setError(null);
    setUploading(true);

    try {
      let blob: Blob = file;

      // Trim if values are set
      const startVal = trimStart ? parseFloat(trimStart) : null;
      const endVal = trimEnd ? parseFloat(trimEnd) : null;
      if (showTrim && (startVal !== null || endVal !== null)) {
        setTrimming(true);
        blob = await trimVideo(file, startVal ?? 0, endVal);
        setTrimming(false);
      }

      const renamedFile = new File([blob], `${finalName}.${ext}`, {
        type: file.type,
      });

      const formData = new FormData();
      formData.append("file", renamedFile);
      const res = await client.post(`/moves/${moveId}/media`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onUploaded(res.data);
    } catch {
      setError("Upload failed. Please try again.");
      setTrimming(false);
      setUploading(false);
    }
  }, [filename, file, moveId, onUploaded, showTrim, trimStart, trimEnd]);

  const isVideo = file.type.startsWith("video/");
  const busy = uploading || trimming || ffmpegLoading;

  const clipDuration =
    showTrim && (trimStart || trimEnd) && duration
      ? (() => {
          const s = trimStart ? parseFloat(trimStart) : 0;
          const e = trimEnd ? parseFloat(trimEnd) : duration;
          const d = e - s;
          return d > 0 ? d : null;
        })()
      : null;

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onCancel}>
      <div
        className="modal-content upload-dialog-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="upload-dialog-header">
          <h3 className="modal-title">Upload Media</h3>
          <button
            className="btn-icon"
            onClick={onCancel}
            disabled={busy}
          >
            &times;
          </button>
        </div>

        {objectURL && (
          isVideo ? (
            <video
              ref={videoRef}
              src={objectURL}
              controls
              onLoadedMetadata={handleLoadedMetadata}
              className="upload-dialog-media"
            />
          ) : (
            <img
              src={objectURL}
              alt="Preview"
              className="upload-dialog-media"
            />
          )
        )}

        <div className="form-field">
          <label>Filename</label>
          <input
            type="text"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            disabled={busy}
          />
        </div>

        {isVideo && (
          <button
            className={`btn ${showTrim ? "btn-secondary" : "btn-secondary"}`}
            onClick={handleTrimToggle}
            disabled={busy}
            style={{ marginBottom: "1rem", width: "100%" }}
          >
            {ffmpegLoading
              ? "Loading trim tools..."
              : showTrim
                ? "Remove Trim"
                : "Trim Media"}
          </button>
        )}

        {showTrim && isVideo && (
          <div className="trim-controls">
            <div className="trim-field">
              <label>Start</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max={duration ?? undefined}
                value={trimStart}
                onChange={(e) => setTrimStart(e.target.value)}
                placeholder="0.0"
                disabled={busy}
              />
              <span className="trim-unit">sec</span>
              <button
                className="btn btn-sm"
                onClick={setCurrentAsStart}
                disabled={busy}
              >
                Set to current
              </button>
            </div>
            <div className="trim-field">
              <label>End</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max={duration ?? undefined}
                value={trimEnd}
                onChange={(e) => setTrimEnd(e.target.value)}
                placeholder={duration ? duration.toFixed(1) : "end"}
                disabled={busy}
              />
              <span className="trim-unit">sec</span>
              <button
                className="btn btn-sm"
                onClick={setCurrentAsEnd}
                disabled={busy}
              >
                Set to current
              </button>
            </div>
            {clipDuration !== null && (
              <p className="trim-duration">
                Clip duration: ~{formatTime(clipDuration)}
              </p>
            )}
            <p className="trim-note">
              Trims to nearest keyframe (~1-2s precision)
            </p>
          </div>
        )}

        {error && <p className="media-upload-error">{error}</p>}

        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={busy || !filename.trim()}
          >
            {trimming ? "Trimming..." : uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}
