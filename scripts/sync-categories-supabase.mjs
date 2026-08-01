import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  const envPath = join(process.cwd(), ".env.local");
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      const value = rest.join("=").trim();
      if (key.trim() === "NEXT_PUBLIC_SUPABASE_URL" && !supabaseUrl) supabaseUrl = value;
      if (key.trim() === "SUPABASE_SERVICE_ROLE_KEY" && !supabaseServiceKey) supabaseServiceKey = value;
    }
  }
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Standard marketplace categories used across the app and navbar
const ALL_CATEGORIES = [
  {
    id: "cat-electronics",
    slug: "electronics",
    name: "Electronics",
    icon: "📱",
    description: "Phones, audio, appliances & smart tech",
    count: 50,
  },
  {
    id: "cat-womens-fashion",
    slug: "womens-fashion",
    name: "Women's Fashion",
    icon: "👗",
    description: "Dresses, abayas, shoes & accessories",
    count: 85,
  },
  {
    id: "cat-mens-fashion",
    slug: "mens-fashion",
    name: "Men's Fashion",
    icon: "👔",
    description: "Suits, shirts, casual wear & shoes",
    count: 60,
  },
  {
    id: "cat-beauty",
    slug: "beauty",
    name: "Beauty & Care",
    icon: "💄",
    description: "Qasil, serums, skincare & fragrance",
    count: 45,
  },
  {
    id: "cat-home-living",
    slug: "home-living",
    name: "Home & Living",
    icon: "🛋️",
    description: "Furniture, kitchenware, bedding & decor",
    count: 90,
  },
  {
    id: "cat-kids-baby",
    slug: "kids-baby",
    name: "Kids & Baby",
    icon: "🧸",
    description: "Toys, learning, clothing & baby gear",
    count: 35,
  },
  {
    id: "cat-sports-outdoor",
    slug: "sports-outdoor",
    name: "Sports & Outdoor",
    icon: "⚽",
    description: "Gym equipment, sportswear & outdoor gear",
    count: 30,
  },
  {
    id: "cat-groceries",
    slug: "groceries",
    name: "Groceries",
    icon: "🧺",
    description: "Fresh staples, spices, teas & food",
    count: 120,
  },
  // Alias / legacy slugs to satisfy any existing foreign keys
  {
    id: "cat-fashion-apparel",
    slug: "fashion-apparel",
    name: "Fashion & Apparel",
    icon: "👗",
    description: "Clothing & apparel",
    count: 128,
  },
  {
    id: "cat-beauty-perfume",
    slug: "beauty-perfume",
    name: "Beauty & Perfume",
    icon: "✨",
    description: "Fragrances & skincare",
    count: 64,
  },
  {
    id: "cat-groceries-food",
    slug: "groceries-food",
    name: "Groceries & Food",
    icon: "🛒",
    description: "Food & groceries",
    count: 210,
  },
  {
    id: "cat-sports-fitness",
    slug: "sports-fitness",
    name: "Sports & Fitness",
    icon: "⚽",
    description: "Fitness & sports",
    count: 35,
  },
  {
    id: "cat-baby-kids",
    slug: "baby-kids",
    name: "Baby & Kids",
    icon: "🧸",
    description: "Baby & kids items",
    count: 40,
  },
];

console.log("Upserting all categories into Supabase...");
for (const cat of ALL_CATEGORIES) {
  const { error } = await supabase.from("categories").upsert(cat, { onConflict: "slug" });
  if (error) {
    console.error(`Error upserting category ${cat.slug}:`, error.message);
  } else {
    console.log(`✅ Category "${cat.name}" (${cat.slug}) upserted`);
  }
}
console.log("Categories sync complete!");
