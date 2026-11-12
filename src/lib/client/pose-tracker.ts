import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import type { ImagePoint, Point3 } from "@/lib/analysis/geometry";
import type { PoseFrame } from "@/lib/analysis/signals";
import { toJpegDataUrl } from "./image";

/** Pinned to the installed package version so the WASM matches the JS API. */
const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export const MAX_CLIP_SECONDS = 60;
const MIN_CLIP_SECONDS = 2;

let landmarkerPromise: Promise<PoseLandmarker> | null = null;

/** Loads the pose model once per page session. */
function getLandmarker(): Promise<PoseLandmarker> {
  landmarkerPromise ??= (async () => {
    const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    return PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  })().catch((error: unknown) => {
    landmarkerPromise = null;
    throw error;
  });
  return landmarkerPromise;
}

export class ClipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClipError";
  }
}

export interface TrackedClip {
  frames: PoseFrame[];
  aspectRatio: number;
  duration: number;
  /** Seeks the clip and returns a JPEG of that moment with the skeleton drawn on it. */
  snapshot: (timeSec: number, highlight: readonly number[]) => Promise<string>;
  dispose: () => void;
}

function once(target: HTMLVideoElement, event: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = () => {
      cleanup();
      reject(new ClipError("This video can't be played in your browser. Try recording it again in your camera app."));
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const onDone = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      target.removeEventListener(event, onDone);
      target.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };
    target.addEventListener(event, onDone, { once: true });
    target.addEventListener("error", onError, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function seek(video: HTMLVideoElement, time: number, signal?: AbortSignal) {
  if (Math.abs(video.currentTime - time) < 1e-3) return;
  const done = once(video, "seeked", signal);
  video.currentTime = time;
  await done;
}

const toImagePoints = (list: readonly ImagePoint[]): ImagePoint[] =>
  list.map(({ x, y, z, visibility }) => ({ x, y, z, visibility: visibility ?? 0 }));
const toPoints = (list: readonly Point3[]): Point3[] => list.map(({ x, y, z }) => ({ x, y, z }));

/** Body connections drawn on snapshots (face points left out). */
export const BODY_CONNECTIONS: readonly [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 31], [28, 32],
];

export async function trackClip(
  file: File,
  onProgress: (fraction: number, stage: "model" | "tracking") => void,
  signal?: AbortSignal,
): Promise<TrackedClip> {
  if (!file.type.startsWith("video/")) throw new ClipError("That file isn't a video. Record a clip of your set.");

  onProgress(0, "model");
  const landmarker = await getLandmarker();

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const loaded = once(video, "loadeddata", signal);
  video.src = url;
  video.load();
  const dispose = () => {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  };

  try {
    await loaded;
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration < MIN_CLIP_SECONDS) {
      throw new ClipError("The clip is too short. Record at least two full reps.");
    }
    if (duration > MAX_CLIP_SECONDS + 1) {
      throw new ClipError(`The clip is longer than ${MAX_CLIP_SECONDS} seconds. Trim it to a single set.`);
    }

    const fps = duration > 30 ? 8 : 12;
    const total = Math.floor(duration * fps);
    const frames: PoseFrame[] = [];
    for (let i = 0; i <= total; i++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const t = Math.min(duration - 0.01, i / fps);
      await seek(video, t, signal);
      const result = landmarker.detectForVideo(video, Math.round(t * 1000) + 1);
      const image = result.landmarks[0];
      const world = result.worldLandmarks[0];
      frames.push({
        t,
        image: image ? toImagePoints(image) : null,
        world: world ? toPoints(world) : null,
      });
      onProgress((i + 1) / (total + 1), "tracking");
    }

    const aspectRatio = video.videoWidth / video.videoHeight || 1;

    const snapshot = async (timeSec: number, highlight: readonly number[]) => {
      await seek(video, timeSec, signal);
      const nearest = frames.reduce((best, f) => (Math.abs(f.t - timeSec) < Math.abs(best.t - timeSec) ? f : best));
      const points = nearest.image;
      return toJpegDataUrl(video, video.videoWidth, video.videoHeight, 640, 0.8, (ctx, w, h) => {
        if (!points) return;
        ctx.lineCap = "round";
        for (const [a, b] of BODY_CONNECTIONS) {
          const pa = points[a];
          const pb = points[b];
          if (pa.visibility < 0.5 || pb.visibility < 0.5) continue;
          const hot = highlight.includes(a) && highlight.includes(b);
          ctx.strokeStyle = hot ? "#2148d0" : "rgba(255,255,255,0.85)";
          ctx.lineWidth = hot ? 6 : 3;
          ctx.beginPath();
          ctx.moveTo(pa.x * w, pa.y * h);
          ctx.lineTo(pb.x * w, pb.y * h);
          ctx.stroke();
        }
      });
    };

    return { frames, aspectRatio, duration, snapshot, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
