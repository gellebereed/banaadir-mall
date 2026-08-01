import { promises as fs } from "fs";
import path from "path";
import { UPLOAD_ROOT } from "@/lib/uploads";

/**
 * Serves images uploaded from the dashboards (see lib/uploads.ts).
 * URL shape: /api/uploads/<folder>/<filename>
 */

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string[] }> },
) {
  const { file: segments } = await params;

  // Reject anything that could escape the uploads directory.
  if (segments.some((s) => s.includes("..") || s.includes("/") || s.includes("\\"))) {
    return new Response("Not found", { status: 404 });
  }

  const ext = segments[segments.length - 1]?.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) return new Response("Not found", { status: 404 });

  try {
    const data = await fs.readFile(path.join(UPLOAD_ROOT, ...segments));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        // Filenames are unique per upload, so they can be cached hard.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
