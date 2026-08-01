import { createClient } from "./server";

export const DEFAULT_BUCKET = "uploads";

/** Check if valid Supabase environment variables are configured. */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return Boolean(url && !url.includes("your-project") && key && !key.includes("your-anon-key"));
}

/**
 * Upload a array of File objects to Supabase Storage and return public URLs.
 * Fallback to empty array if upload fails or credentials missing.
 */
export async function uploadToSupabaseStorage(
  files: File[],
  folder: string,
  bucketName: string = DEFAULT_BUCKET
): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];

  const urls: string[] = [];
  const supabase = await createClient();

  for (const file of files) {
    if (!file || typeof file.arrayBuffer !== "function" || file.size === 0) continue;

    const fileExt = file.name.split(".").pop() || "jpg";
    const fileName = `${folder}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error("[Supabase Storage] Upload error:", error.message);
      continue;
    }

    if (data?.path) {
      const { data: publicUrlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(data.path);
      if (publicUrlData?.publicUrl) {
        urls.push(publicUrlData.publicUrl);
      }
    }
  }

  return urls;
}

/**
 * Delete a file from Supabase Storage given its public URL.
 */
export async function deleteFromSupabaseStorage(
  publicUrl: string,
  bucketName: string = DEFAULT_BUCKET
): Promise<boolean> {
  if (!isSupabaseConfigured() || !publicUrl) return false;

  try {
    const supabase = await createClient();
    const urlObj = new URL(publicUrl);
    const pathParts = urlObj.pathname.split(`/storage/v1/object/public/${bucketName}/`);
    if (pathParts.length < 2) return false;

    const filePath = decodeURIComponent(pathParts[1]);
    const { error } = await supabase.storage.from(bucketName).remove([filePath]);
    if (error) {
      console.error("[Supabase Storage] Delete error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Storage] Error parsing delete URL:", err);
    return false;
  }
}
