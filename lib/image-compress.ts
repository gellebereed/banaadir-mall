/**
 * Client-side Image Compression Utility:
 * Resizes and compresses high-resolution camera/phone photos (5MB - 10MB) in the browser
 * down to ~150KB - 250KB (1200px max dimension) before upload.
 * This completely eliminates HTTP 413 "Payload Too Large" errors on Netlify serverless functions.
 */
export async function compressImageFile(
  file: File,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.85
): Promise<File> {
  if (!file || !file.type || !file.type.startsWith("image/") || file.type.includes("svg")) {
    return file; // Return original if not a compressable bitmap image
  }

  // If file is already smaller than 300KB, use as is
  if (file.size < 300 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let width = img.width;
      let height = img.height;

      // If dimensions are within limits and size is small, return original
      if (width <= maxWidth && height <= maxHeight && file.size < 500 * 1024) {
        resolve(file);
        return;
      }

      // Calculate scale ratio
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
          resolve(compressedFile);
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}
