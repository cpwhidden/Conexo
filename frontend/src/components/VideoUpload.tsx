import { useCallback, useRef, useState } from "react";
import client from "../api/client";
import type { Video } from "../types";

interface VideoUploadProps {
  moveId: string;
  onUploaded: (video: Video) => void;
}

export default function VideoUpload({ moveId, onUploaded }: VideoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await client.post(`/moves/${moveId}/videos`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        onUploaded(res.data);
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [moveId, onUploaded]
  );

  return (
    <div className="video-upload">
      <label className="btn btn-secondary">
        {uploading ? "Uploading..." : "Upload Video"}
        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          onChange={handleUpload}
          disabled={uploading}
          hidden
        />
      </label>
    </div>
  );
}
