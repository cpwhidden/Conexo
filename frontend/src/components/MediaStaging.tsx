import { useCallback, useEffect, useState } from "react";
import MediaUpload from "./MediaUpload";

interface MediaStagingProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
}

function StagedMediaItem({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  // Object URL for preview, revoked on unmount (Strict Mode safe).
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const isVideo = file.type.startsWith("video/");

  return (
    <div className="staged-media-item">
      {url &&
        (isVideo ? (
          <video src={url} className="staged-media-thumb" muted />
        ) : (
          <img src={url} alt={file.name} className="staged-media-thumb" />
        ))}
      <span className="staged-media-name">{file.name}</span>
      <button
        type="button"
        className="btn-icon"
        onClick={onRemove}
        title="Remove"
      >
        &times;
      </button>
    </div>
  );
}

/**
 * Controlled media picker for moves that don't exist yet. Files are staged
 * locally (trimmed/renamed via the upload dialog) and handed back to the
 * parent, which uploads them after the move is created.
 */
export default function MediaStaging({
  files,
  onFilesChange,
}: MediaStagingProps) {
  const handleStaged = useCallback(
    (file: File) => {
      onFilesChange([...files, file]);
    },
    [files, onFilesChange]
  );

  const handleRemove = useCallback(
    (index: number) => {
      onFilesChange(files.filter((_, i) => i !== index));
    },
    [files, onFilesChange]
  );

  return (
    <div className="media-staging">
      <MediaUpload onStaged={handleStaged} />
      {files.length > 0 && (
        <div className="staged-media-list">
          {files.map((file, i) => (
            <StagedMediaItem
              key={`${file.name}-${i}`}
              file={file}
              onRemove={() => handleRemove(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
