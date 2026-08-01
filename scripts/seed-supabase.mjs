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
    // 1. SEED DEMO USERS (AUTH)
    console.log("👤 Registering Demo Auth Accounts...");
    const demoUsers = [
      { email: "admin@banaadirmall.com", password: "Admin@2026", name: "Mall Administrator", role: "admin" },
      { email: "karaca-home@seller.banaadirmall.com", password: "Seller@2026", name: "Karaca Home Somalia", role: "seller", store: "karaca-home" },
      { email: "us-polo-assn@seller.banaadirmall.com", password: "Seller@2026", name: "U.S. Polo Assn. Mogadishu", role: "seller", store: "us-polo-assn" },
      { email: "somali-electronics@seller.banaadirmall.com", password: "Seller@2026", name: "Somali Electronics Hub", role: "seller", store: "somali-electronics" },
      { email: "banaadir-perfumes@seller.banaadirmall.com", password: "Seller@2026", name: "Banaadir Oud & Perfumes", role: "seller", store: "banaadir-perfumes" },
      { email: "ayaan@banaadirmall.com", password: "Customer@2026", name: "Ayaan Warsame", role: "customer" },
    ];

    for (const user of demoUsers) {
      try {
        let res;
        if (serviceRoleKey) {
          res = await supabase.auth.admin.createUser({
            email: user.email,
            password: user.password,
            email_confirm: true,
            user_metadata: { name: user.name, role: user.role, store: user.store || undefined },
          });
        } else {
          res = await supabase.auth.signUp({
            email: user.email,
            password: user.password,
            options: { data: { name: user.name, role: user.role, store: user.store || undefined } },
          });
        }

        if (res.error) {
          console.log(`  ℹ️ ${user.email}: ${res.error.message}`);
        } else {
          console.log(`  ✓ Registered auth account: ${user.email} (${user.role})`);
        }
      } catch (err) {
        console.log(`  ℹ️ Note for ${user.email}:`, err.message || err);
      }
      await delay(1200);
    }

    // 2. SEED CATEGORIES WITH BEAUTIFUL EMOJIS
    console.log("\n📦 Transferring Categories with Emojis...");
    const categoriesData = [
      { id: "cat-1", slug: "electronics", name: "Electronics", icon: "📱", count: 42, description: "Smartphones, laptops, accessories & appliances" },
      { id: "cat-2", slug: "fashion-apparel", name: "Fashion & Apparel", icon: "👗", count: 128, description: "Men's, women's & children's clothing" },
      { id: "cat-3", slug: "home-living", name: "Home & Living", icon: "🛋️", count: 85, description: "Furniture, kitchenware, bedding & decor" },
      { id: "cat-4", slug: "beauty-perfume", name: "Beauty & Perfume", icon: "✨", count: 64, description: "Fragrances, skincare, cosmetics & hair care" },
      { id: "cat-5", slug: "groceries-food", name: "Groceries & Food", icon: "🛒", count: 210, description: "Fresh produce, dry goods, beverages & snacks" },
      { id: "cat-6", slug: "sports-fitness", name: "Sports & Fitness", icon: "⚽", count: 35, description: "Gym equipment, sportswear & outdoor gear" },
      { id: "cat-7", slug: "books-stationery", name: "Books & Stationery", icon: "📚", count: 50, description: "Islamic literature, educational books & office supplies" },
      { id: "cat-8", slug: "baby-kids", name: "Baby & Kids", icon: "🧸", count: 40, description: "Toys, baby care, clothing & strollers" },
    ];

    const { error: catErr } = await supabase.from("categories").upsert(categoriesData, { onConflict: "id" });
    if (catErr) console.error("  ❌ Categories error:", catErr.message);
    else console.log(`  ✓ Successfully seeded ${categoriesData.length} categories with emojis.`);

    console.log("\n🎉 Data & Auth transfer to Supabase completed successfully!");
  } catch (err) {
    console.error("❌ Migration failed:", err);
  }
}

seed();
