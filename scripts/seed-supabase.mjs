import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Load environment variables from .env.local
let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const envLocalPath = join(process.cwd(), ".env.local");
if (existsSync(envLocalPath)) {
  const envContent = readFileSync(envLocalPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) {
      supabaseUrl = trimmed.split("=")[1].trim();
    }
    if (trimmed.startsWith("SUPABASE_SERVICE_ROLE_KEY=") && trimmed.split("=")[1].trim() && !trimmed.split("=")[1].includes("your-service-role")) {
      serviceRoleKey = trimmed.split("=")[1].trim();
      supabaseKey = serviceRoleKey;
    } else if (!supabaseKey && trimmed.startsWith("NEXT_PUBLIC_SUPABASE_ANON_KEY=")) {
      supabaseKey = trimmed.split("=")[1].trim();
    }
  }
}

if (!supabaseUrl || supabaseUrl.includes("your-project") || !supabaseKey || supabaseKey.includes("your-anon-key")) {
  console.error("❌ Error: Valid Supabase environment variables not found in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log("🚀 Starting Supabase Data & Auth Transfer for Banaadir Mall...\n");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function seed() {
  try {
    // 1. SEED STORES WITH PUBLIC STORAGE URLS & CLEAN ICONS
    console.log("\n🏪 Transferring Stores with Public CDN URLs...");
    const storesData = [
      {
        id: "store-1",
        slug: "karaca-home",
        name: "Karaca Home Somalia",
        tagline: "Premium Turkish home textiles & tableware",
        description: "Official distributor of Karaca Home products in Mogadishu.",
        logo: "https://xqcclakulmtdnfbuilib.supabase.co/storage/v1/object/public/uploads/stores/msa4q0xg-oyeoli.png",
        banner: "https://xqcclakulmtdnfbuilib.supabase.co/storage/v1/object/public/uploads/stores/msa4q0xj-al9vnp.png",
        rating: 4.9,
        reviews_count: 142,
        status: "active",
        owner: "Farah Abdi",
        location: "Bakaara Market, Mogadishu",
      },
      {
        id: "store-2",
        slug: "us-polo-assn",
        name: "U.S. Polo Assn. Mogadishu",
        tagline: "Official polo apparel & accessories",
        description: "Authentic U.S. Polo Assn. clothing for men and women.",
        logo: null,
        banner: null,
        rating: 4.8,
        reviews_count: 98,
        status: "active",
        owner: "Ayaan Warsame",
        location: "Maka al Mukarama Rd, Mogadishu",
      },
      {
        id: "store-3",
        slug: "somali-electronics",
        name: "Somali Electronics Hub",
        tagline: "Original smartphones & gadgets with warranty",
        description: "Laptops, phones, smartwatches & accessories.",
        logo: null,
        banner: null,
        rating: 4.7,
        reviews_count: 215,
        status: "active",
        owner: "Mohamud Hassan",
        location: "KM4, Mogadishu",
      },
      {
        id: "store-4",
        slug: "banaadir-perfumes",
        name: "Banaadir Oud & Perfumes",
        tagline: "Authentic Arabian oud, frankincense & luxury scents",
        description: "Traditional Somali & Arabian perfumes.",
        logo: null,
        banner: null,
        rating: 5.0,
        reviews_count: 76,
        status: "active",
        owner: "Habiba Nur",
        location: "Hamar Weyne, Mogadishu",
      },
    ];

    const { error: storeErr } = await supabase.from("stores").upsert(storesData, { onConflict: "id" });
    if (storeErr) console.error("  ❌ Stores error:", storeErr.message);
    else console.log(`  ✓ Successfully seeded ${storesData.length} stores.`);

    console.log("\n🎉 Data transfer to Supabase completed successfully!");
  } catch (err) {
    console.error("❌ Migration failed:", err);
  }
}

seed();
