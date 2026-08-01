import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

// Load environment variables from .env.local
let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const envLocalPath = join(process.cwd(), ".env.local");
if (existsSync(envLocalPath)) {
  const envContent = readFileSync(envLocalPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) {
      supabaseUrl = trimmed.split("=")[1].trim();
    }
    if (trimmed.startsWith("SUPABASE_SERVICE_ROLE_KEY=") && trimmed.split("=")[1].trim() && !trimmed.split("=")[1].includes("your-service-role")) {
      supabaseKey = trimmed.split("=")[1].trim();
    } else if (!supabaseKey && trimmed.startsWith("NEXT_PUBLIC_SUPABASE_ANON_KEY=")) {
      supabaseKey = trimmed.split("=")[1].trim();
    }
  }
}

if (!supabaseUrl || supabaseUrl.includes("your-project") || !supabaseKey || supabaseKey.includes("your-anon-key")) {
  console.error("❌ Error: Valid Supabase credentials not found in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const BUCKET = "uploads";

console.log("🚀 Uploading all local product & store images to Supabase Storage...\n");

async function ensureBucketExists() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === BUCKET);
  if (!exists) {
    console.log(`🔨 Bucket '${BUCKET}' not found. Creating public bucket '${BUCKET}'...`);
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
    if (error) {
      console.warn(`  ⚠️ Could not auto-create bucket via API (${error.message}). Please create public bucket '${BUCKET}' in Supabase Dashboard > Storage.`);
    } else {
      console.log(`  ✓ Public bucket '${BUCKET}' created successfully!`);
    }
  }
}

async function uploadFolder(folderName) {
  const folderPath = join(process.cwd(), "data", "uploads", folderName);
  if (!existsSync(folderPath)) return {};

  const files = readdirSync(folderPath);
  const urlMap = {}; // localPath -> supabasePublicUrl

  for (const file of files) {
    const filePath = join(folderPath, file);
    const fileBuffer = readFileSync(filePath);
    const storagePath = `${folderName}/${file}`;

    const ext = file.split(".").pop().toLowerCase();
    const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.error(`  ❌ Failed to upload ${file}: ${error.message}`);
    } else {
      const { data: publicUrlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(storagePath);
      const publicUrl = publicUrlData?.publicUrl;
      const localPath = `/api/uploads/${folderName}/${file}`;
      urlMap[localPath] = publicUrl;
      console.log(`  ✓ Uploaded ${file} -> ${publicUrl}`);
    }
  }
  return urlMap;
}

async function run() {
  await ensureBucketExists();

  // 1. Upload Product & Store Images
  console.log("\n📸 Uploading product photos...");
  const productUrlMap = await uploadFolder("products");

  console.log("\n🏪 Uploading store logos & banners...");
  const storeUrlMap = await uploadFolder("stores");

  const fullMap = { ...productUrlMap, ...storeUrlMap };

  // 2. Update Supabase Products Table with Supabase URLs
  console.log("\n🔄 Updating Supabase Products table with public CDN URLs...");
  const { data: products } = await supabase.from("products").select("*");
  if (products && products.length > 0) {
    for (const p of products) {
      if (Array.isArray(p.images) && p.images.length > 0) {
        const updatedImages = p.images.map((img) => fullMap[img] || img);
        await supabase.from("products").update({ images: updatedImages }).eq("id", p.id);
        console.log(`  ✓ Updated product: ${p.name}`);
      }
    }
  }

  // 3. Update Supabase Stores Table with Supabase URLs
  console.log("\n🔄 Updating Supabase Stores table with public CDN URLs...");
  const { data: stores } = await supabase.from("stores").select("*");
  if (stores && stores.length > 0) {
    for (const s of stores) {
      const updatedLogo = fullMap[s.logo] || s.logo;
      const updatedBanner = fullMap[s.banner] || s.banner;
      await supabase.from("stores").update({ logo: updatedLogo, banner: updatedBanner }).eq("id", s.id);
      console.log(`  ✓ Updated store: ${s.name}`);
    }
  }

  console.log("\n🎉 All images uploaded to Supabase Storage and database URLs updated!");
}

run();
