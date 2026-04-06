import type { FFmpeg } from "@ffmpeg/ffmpeg";

let ffmpegInstance: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;

  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const ffmpeg = new FFmpeg();
  await ffmpeg.load();
  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

/** Trim a video file using stream copy (no re-encoding, near-instant). */
export async function trimVideo(
  file: File,
  start: number,
  end: number | null
): Promise<Blob> {
  const ffmpeg = await getFFmpeg();
  const { fetchFile } = await import("@ffmpeg/util");

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "mp4";
  const inputName = `input.${ext}`;
  const outputName = `output.${ext}`;

  await ffmpeg.writeFile(inputName, await fetchFile(file));

  const args = ["-ss", String(start)];
  if (end !== null) {
    args.push("-to", String(end));
  }
  args.push("-i", inputName, "-c", "copy", outputName);

  await ffmpeg.exec(args);

  const data = await ffmpeg.readFile(outputName);

  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  return new Blob([data as unknown as BlobPart], { type: file.type });
}
