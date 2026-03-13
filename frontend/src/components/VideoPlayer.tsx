import { useEffect, useState } from "react";
import client from "../api/client";
import type { Video } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8888";

interface VideoPlayerProps {
  video: Video;
  onDelete?: (videoId: string) => void;
}

export default function VideoPlayer({ video, onDelete }: VideoPlayerProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    client
      .get(`/videos/${video.id}/url`)
      .then((res) => {
        // If URL is relative (local storage), prepend the API base URL
        const videoUrl = res.data.url;
        if (videoUrl.startsWith("/")) {
          setUrl(`${API_BASE_URL}${videoUrl}`);
        } else {
          setUrl(videoUrl);
        }
      })
      .catch(() => setUrl(null));
  }, [video.id]);

  const handleDelete = async () => {
    await client.delete(`/videos/${video.id}`);
    onDelete?.(video.id);
  };

  return (
    <div className="video-player">
      <p className="video-filename">{video.filename}</p>
      {url ? (
        <video controls width="100%">
          <source src={url} type={video.content_type} />
        </video>
      ) : (
        <p>Loading video...</p>
      )}
      {onDelete && (
        <button onClick={handleDelete} className="btn btn-danger btn-small">
          Delete
        </button>
      )}
    </div>
  );
}
