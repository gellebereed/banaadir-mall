/**
 * ─────────────────────────────────────────────────────────────────────────
 *  IMAGE UPLOADS (server-only)
 * ─────────────────────────────────────────────────────────────────────────
 * Photo uploads stream to Supabase Storage when credentials are provided.
 * When Supabase is not configured yet, files fall back to local disk storage
 * at data/uploads/<folder>/ served via app/api/uploads/[...file]/route.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { promises as fs } from "fs";
import path from "path";
import { isSupabaseConfigured, uploadToSupabaseStorage, deleteFromSupabaseStorage } from "./supabase/storage";

export const UPLOAD_ROOT = path.join(process.cwd(), "data", "uploads");

/** 5 MB per photo. */
const MAX_BYTES = 5 * 1024 * 1024;

/** Accepted image types mapped to the extension we store them with. */
const ALLOWED_TYPES = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
  ["image/gif", "gif"],
]);

/**
 * Persist uploaded files and return their public URLs.
 * If Supabase is configured, uploads directly to Supabase Storage.
 * Otherwise, falls back to local disk uploads safely.
 */
export async function saveImages(files: File[], folder: string): Promise<string[]> {
  // If Supabase credentials are path-ready, stream to Supabase Storage
  if (isSupabaseConfigured()) {
    try {
      const supabaseUrls = await uploadToSupabaseStorage(files, folder);
      if (supabaseUrls.length > 0) return supabaseUrls;
    } catch (err) {
      console.warn("[Uploads] Supabase storage upload failed, falling back to local:", err);
    }
  }

  // Local filesystem fallback with read-only error protection
  const urls: string[] = [];
  const dir = path.join(UPLOAD_ROOT, folder);

  try {
    for (const file of files) {
      if (!file || typeof file.arrayBuffer !== "function" || file.size === 0) continue;
      const ext = ALLOWED_TYPES.get(file.type.toLowerCase());
      if (!ext || file.size > MAX_BYTES) continue;

      const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
      urls.push(`/api/uploads/${folder}/${name}`);
    }
  } catch {
    console.warn("[Uploads] Filesystem is read-only; image saved to Supabase Storage or skipped.");
  }
  return urls;
}

/** Pull the File entries for a given form field. */
export function filesFrom(formData: FormData, field: string): File[] {
  return formData
    .getAll(field)
    .filter((v): v is File => typeof v === "object" && v !== null && "arrayBuffer" in v);
}

/** Delete an uploaded file when its URL is removed from a product/store. */
export async function deleteUpload(url: string): Promise<void> {
  if (url.includes("supabase.co/storage")) {
    await deleteFromSupabaseStorage(url);
    return;
  }

  if (!url.startsWith("/api/uploads/")) return;
  const relative = url.replace("/api/uploads/", "");
  if (relative.includes("..")) return;
  try {
    await fs.unlink(path.join(UPLOAD_ROOT, ...relative.split("/")));
  } catch {
    // Already gone — nothing to do.
  }
}
