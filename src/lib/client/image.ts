/** Draws any image source onto a canvas no wider/taller than `maxSide`, returning a JPEG data URL. */
export function toJpegDataUrl(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxSide: number,
  quality = 0.82,
  draw?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): string {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");
  ctx.drawImage(source, 0, 0, w, h);
  draw?.(ctx, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Decodes a photo from the camera or gallery and shrinks it for upload. EXIF rotation is applied by the browser. */
export async function photoToDataUrl(file: File, maxSide = 1280): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("That file isn't a photo. Choose a JPEG, PNG or HEIC image.");
  const bitmap = await createImageBitmap(file);
  try {
    return toJpegDataUrl(bitmap, bitmap.width, bitmap.height, maxSide);
  } finally {
    bitmap.close();
  }
}
