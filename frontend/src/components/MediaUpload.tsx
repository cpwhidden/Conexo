import { useCallback, useRef, useState } from "react";
import type { Media } from "../types";
import MediaUploadDialog from "./MediaUploadDialog";

interface MediaUploadProps {
  /** When set, files upload immediately to this move. Omit for local staging. */
  moveId?: string;
  /** Called after a successful upload (immediate mode). */
  onUploaded?: (media: Media) => void;
  /** Called with the processed file instead of uploading (staging mode). */
  onStaged?: (file: File) => void;
}

export default function MediaUpload({
  moveId,
  onUploaded,
  onStaged,
}: MediaUploadProps) {
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const validateAndOpen = useCallback((file: File) => {
    if (file.size === 0) {
      setError(
        "This file appears empty (0 bytes). If dragging from macOS Photos, try exporting the media to a file first, then upload that file."
      );
      return;
    }

    if (!file.type.startsWith("video/") && !file.type.startsWith("image/")) {
      setError("Please upload a video or image file.");
      return;
    }

    setError(null);
    setPendingFile(file);
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) validateAndOpen(file);
    },
    [validateAndOpen]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      dragCounter.current = 0;

      const file = e.dataTransfer.files?.[0];
      if (file) validateAndOpen(file);
    },
    [validateAndOpen]
  );

  const handleDialogCancel = useCallback(() => {
    setPendingFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const handleDialogUploaded = useCallback(
    (media: Media) => {
      setPendingFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onUploaded?.(media);
    },
    [onUploaded]
  );

  const handleDialogStaged = useCallback(
    (file: File) => {
      setPendingFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onStaged?.(file);
    },
    [onStaged]
  );

  return (
    <div className="media-upload">
      <div
        className={`media-drop-zone${dragOver ? " drag-over" : ""}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <span className="drop-zone-text">
          Drag media here or{" "}
          <label className="drop-zone-browse">
            browse
            <input
              ref={fileRef}
              type="file"
              accept="video/*,image/*"
              onChange={handleFileChange}
              hidden
            />
          </label>
        </span>
      </div>
      {error && <p className="media-upload-error">{error}</p>}

      {pendingFile && (
        <MediaUploadDialog
          file={pendingFile}
          moveId={moveId}
          onUploaded={handleDialogUploaded}
          onStaged={handleDialogStaged}
          onCancel={handleDialogCancel}
        />
      )}
    </div>
  );
}
