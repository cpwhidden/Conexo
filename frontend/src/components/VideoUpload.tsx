import { useCallback, useRef, useState } from "react";
import type { Video } from "../types";
import VideoUploadDialog from "./VideoUploadDialog";

interface VideoUploadProps {
  moveId: string;
  onUploaded: (video: Video) => void;
}

export default function VideoUpload({ moveId, onUploaded }: VideoUploadProps) {
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const validateAndOpen = useCallback((file: File) => {
    if (file.size === 0) {
      setError(
        "This file appears empty (0 bytes). If dragging from macOS Photos, try exporting the video to a file first, then upload that file."
      );
      return;
    }

    if (!file.type.startsWith("video/")) {
      setError("Please upload a video file.");
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
    (video: Video) => {
      setPendingFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onUploaded(video);
    },
    [onUploaded]
  );

  return (
    <div className="video-upload">
      <div
        className={`video-drop-zone${dragOver ? " drag-over" : ""}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <span className="drop-zone-text">
          Drag a video here or{" "}
          <label className="drop-zone-browse">
            browse
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              hidden
            />
          </label>
        </span>
      </div>
      {error && <p className="video-upload-error">{error}</p>}

      {pendingFile && (
        <VideoUploadDialog
          file={pendingFile}
          moveId={moveId}
          onUploaded={handleDialogUploaded}
          onCancel={handleDialogCancel}
        />
      )}
    </div>
  );
}
