/**
 * ─────────────────────────────────────────────────────────────────────────
 *  CLIENT-SIDE IMAGE OPTIMISATION
 * ─────────────────────────────────────────────────────────────────────────
 * Shrinks phone/camera photos in the browser before they are uploaded, so
 * Supabase Storage holds web-sized images instead of 8 MB originals and the
 * server action stays well under Netlify's request limit.
 *
 * Why it re-encodes to WebP: at the same visual quality WebP is roughly
 * 25–35% smaller than JPEG, and unlike JPEG it keeps transparency — so a
 * PNG cut-out no longer gains a black background.
 *
 * Two things the previous version got wrong, both fixed here:
 *   1. It skipped any file under 300 KB. A 4000 px screenshot can weigh
 *      250 KB, so it was stored and served at full resolution.
 *      Dimensions are now always capped, whatever the file weighs.
 *   2. It ignored EXIF orientation, so photos taken in portrait on a phone
 *      could upload rotated. decode() via createImageBitmap applies it.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Longest edge kept.
 *
 * 1600 was chosen for a card in a grid, and it is not enough for the thing
 * this catalogue actually needs: a shopper opening the zoom to decide
 * whether a suit is pinstriped or plain. Full-screen on an ordinary retina
 * laptop is already ~2560 device pixels, so a 1600px master was being
 * upscaled by 60% at exactly the moment detail mattered most — which is
 * what "distorted and low grade when zoomed" is.
 *
 * 2400 covers full-screen zoom on every common display without storing
 * camera originals. A 2400px WebP of a product shot is ~250-400 KB.
 */
const MAX_EDGE = 2400;
/**
 * Re-encode quality.
 *
 * Raised from 0.82 because these files are re-encoded a SECOND time by
 * next/image on the way to the browser, and 0.82-of-0.82 is where fine
 * regular texture — pinstripes, herringbone, weave — turns into mush.
 * Generational loss is the real enemy here, not the first pass.
 */
const QUALITY = 0.9;
/** Files at or below this that are already web-sized need no work. */
const ALREADY_SMALL_BYTES = 120 * 1024;

/** Cached one-off check: can this browser encode WebP from a canvas? */
let webpSupport: boolean | null = null;
function supportsWebp(): boolean {
  if (webpSupport !== null) return webpSupport;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    webpSupport = canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    webpSupport = false;
  }
  return webpSupport;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Decode with EXIF orientation applied, falling back to <img> for old browsers. */
async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number } | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // fall through to the <img> path
    }
  }
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ source: img, width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Resize + re-encode a single image. Always returns a File: on any failure,
 * or if the result would be larger than the original, the original is
 * returned untouched so an upload never breaks because of optimisation.
 */
export async function compressImageFile(
  file: File,
  maxEdge = MAX_EDGE,
  quality = QUALITY,
): Promise<File> {
  // GIFs would lose their animation, and SVG is already tiny vector data.
  if (!file?.type?.startsWith("image/") || /svg|gif/.test(file.type)) return file;

  const decoded = await decode(file);
  if (!decoded) return file;

  const { source, width, height } = decoded;
  const longestEdge = Math.max(width, height);
  const withinBounds = longestEdge <= maxEdge;

  // Genuinely nothing to gain: already web-sized and already efficient.
  if (withinBounds && file.size <= ALREADY_SMALL_BYTES && /webp|jpe?g/.test(file.type)) {
    if ("close" in source) (source as ImageBitmap).close();
    return file;
  }

  const scale = withinBounds ? 1 : maxEdge / longestEdge;
  const targetWidth = Math.round(width * scale);
  const targetHeight = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
  if ("close" in source) (source as ImageBitmap).close();

  // WebP keeps transparency and is smaller; JPEG is the fallback, but only
  // when the source has no alpha channel to lose.
  const useWebp = supportsWebp();
  const type = useWebp ? "image/webp" : file.type.includes("png") ? "image/png" : "image/jpeg";
  const blob = await canvasToBlob(canvas, type, quality);
  if (!blob || blob.size >= file.size) return file;

  const extension = type.split("/")[1];
  return new File([blob], file.name.replace(/\.[^/.]+$/, `.${extension}`), {
    type,
    lastModified: Date.now(),
  });
}

/**
 * Below this on the longest edge, a photo cannot survive being zoomed.
 *
 * The product page magnifies its image 2×, so anything under roughly a
 * thousand pixels is already being stretched before the shopper touches
 * it. Nothing on the serving side can put detail back — a small file is a
 * small file — so the only place to catch it is here, before it is stored.
 */
const LOW_RESOLUTION_EDGE = 1000;

/** The longest edge of an image file, or 0 if it cannot be read. */
export async function imageLongestEdge(file: File): Promise<number> {
  const decoded = await decode(file);
  if (!decoded) return 0;
  const edge = Math.max(decoded.width, decoded.height);
  if ("close" in decoded.source) (decoded.source as ImageBitmap).close();
  return edge;
}

/**
 * Compress a list, reporting how much was saved and which files are too
 * small to look good zoomed.
 */
export async function compressImageFiles(
  files: File[],
): Promise<{ files: File[]; savedBytes: number; lowResolution: string[] }> {
  const before = files.reduce((sum, f) => sum + f.size, 0);

  const lowResolution: string[] = [];
  const compressed = await Promise.all(
    files.map(async (file) => {
      const edge = await imageLongestEdge(file);
      if (edge > 0 && edge < LOW_RESOLUTION_EDGE) lowResolution.push(file.name);
      return compressImageFile(file);
    }),
  );

  const after = compressed.reduce((sum, f) => sum + f.size, 0);
  return { files: compressed, savedBytes: Math.max(0, before - after), lowResolution };
}
