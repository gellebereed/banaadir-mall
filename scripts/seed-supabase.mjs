import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
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
    if (trimmed.startsWith("SUPABASE_SERVICE_ROLE_KEY=") && trimmed.split("=")[1].trim()) {
      supabaseKey = trimmed.split("=")[1].trim();
    } else if (!supabaseKey && trimmed.startsWith("NEXT_PUBLIC_SUPABASE_ANON_KEY=")) {
      supabaseKey = trimmed.split("=")[1].trim();
    }
  }
}

if (!supabaseUrl || supabaseUrl.includes("your-project") || !supabaseKey || supabaseKey.includes("your-anon-key")) {
  console.error("❌ Error: Valid Supabase environment variables not found in .env.local");
  console.error("Please configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY first.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log("🚀 Starting Supabase Data Transfer for Banaadir Mall...\n");

async function seed() {
  try {
    // 1. SEED CATEGORIES
    console.log("📦 Transferring Categories...");
    const categoriesData = [
      { id: "cat-1", slug: "electronics", name: "Electronics", icon: "Tv", count: 42, description: "Smartphones, laptops, accessories & appliances" },
      { id: "cat-2", slug: "fashion-apparel", name: "Fashion & Apparel", icon: "Shirt", count: 128, description: "Men's, women's & children's clothing" },
      { id: "cat-3", slug: "home-living", name: "Home & Living", icon: "Home", count: 85, description: "Furniture, kitchenware, bedding & decor" },
      { id: "cat-4", slug: "beauty-perfume", name: "Beauty & Perfume", icon: "Sparkles", count: 64, description: "Fragrances, skincare, cosmetics & hair care" },
      { id: "cat-5", slug: "groceries-food", name: "Groceries & Food", icon: "ShoppingBag", count: 210, description: "Fresh produce, dry goods, beverages & snacks" },
      { id: "cat-6", slug: "sports-fitness", name: "Sports & Fitness", icon: "Dumbbell", count: 35, description: "Gym equipment, sportswear & outdoor gear" },
      { id: "cat-7", slug: "books-stationery", name: "Books & Stationery", icon: "BookOpen", count: 50, description: "Islamic literature, educational books & office supplies" },
      { id: "cat-8", slug: "baby-kids", name: "Baby & Kids", icon: "Baby", count: 40, description: "Toys, baby care, clothing & strollers" },
    ];

    const { error: catErr } = await supabase.from("categories").upsert(categoriesData, { onConflict: "id" });
    if (catErr) console.error("  ❌ Categories error:", catErr.message);
    else console.log(`  ✓ Successfully seeded ${categoriesData.length} categories.`);

    // 2. SEED STORES
    console.log("\n🏪 Transferring Stores...");
    const storesData = [
      { id: "store-1", slug: "karaca-home", name: "Karaca Home Somalia", tagline: "Premium Turkish home textiles & tableware", description: "Official distributor of Karaca Home products in Mogadishu.", logo: "/api/uploads/stores/msa4q0xg-oyeoli.png", banner: "/api/uploads/stores/msa4q0xi-abcdef.png", rating: 4.9, reviews_count: 142, status: "active", owner: "Farah Abdi", location: "Bakaara Market, Mogadishu" },
      { id: "store-2", slug: "us-polo-assn", name: "U.S. Polo Assn. Mogadishu", tagline: "Official polo apparel & accessories", description: "Authentic U.S. Polo Assn. clothing for men and women.", logo: "/api/uploads/stores/uspolo-logo.png", banner: "/api/uploads/stores/uspolo-banner.png", rating: 4.8, reviews_count: 98, status: "active", owner: "Ayaan Warsame", location: "Maka al Mukarama Rd, Mogadishu" },
      { id: "store-3", slug: "somali-electronics", name: "Somali Electronics Hub", tagline: "Original smartphones & gadgets with warranty", description: "Laptops, phones, smartwatches & accessories.", logo: "/api/uploads/stores/electronics-logo.png", banner: "/api/uploads/stores/electronics-banner.png", rating: 4.7, reviews_count: 215, status: "active", owner: "Mohamud Hassan", location: "KM4, Mogadishu" },
      { id: "store-4", slug: "banaadir-perfumes", name: "Banaadir Oud & Perfumes", tagline: "Authentic Arabian oud, frankincense & luxury scents", description: "Traditional Somali & Arabian perfumes.", logo: "/api/uploads/stores/perfume-logo.png", banner: "/api/uploads/stores/perfume-banner.png", rating: 5.0, reviews_count: 76, status: "active", owner: "Habiba Nur", location: "Hamar Weyne, Mogadishu" },
    ];

    const { error: storeErr } = await supabase.from("stores").upsert(storesData, { onConflict: "id" });
    if (storeErr) console.error("  ❌ Stores error:", storeErr.message);
    else console.log(`  ✓ Successfully seeded ${storesData.length} stores.`);

    // 3. SEED PRODUCTS
    console.log("\n🛍️ Transferring Products...");
    const productsData = [
      {
        id: "prod-1",
        slug: "karaca-hatir-mod",
        name: "Karaca Hatır Mod Milk Coffee Maker",
        store: "karaca-home",
        category: "home-living",
        price: 89.99,
        compare_at: 119.99,
        rating: 4.9,
        reviews_count: 24,
        sold: 156,
        in_stock: true,
        badge: "Bestseller",
        description: "Automatic Turkish & milk coffee machine with temperature sensor.",
        specs: [{ name: "Power", value: "535W" }, { name: "Capacity", value: "5 cups" }],
        images: ["/api/uploads/products/msa5tuqj-e7m746.webp"],
        variants: [{ id: "v-1", name: "Rose Gold", price: 89.99, stock: 15 }],
        hidden: false
      },
      {
        id: "prod-2",
        slug: "uspa-pique-polo",
        name: "U.S. Polo Assn. Classic Pique Polo Shirt",
        store: "us-polo-assn",
        category: "fashion-apparel",
        price: 34.50,
        compare_at: 45.00,
        rating: 4.8,
        reviews_count: 42,
        sold: 210,
        in_stock: true,
        badge: "New",
        description: "100% breathable cotton polo shirt with signature embroidered logo.",
        specs: [{ name: "Material", value: "100% Cotton" }],
        images: ["/api/uploads/products/msa5tuqp-c1zjfj.jpg"],
        variants: [{ id: "v-2", name: "Navy Blue - L", price: 34.50, stock: 25 }],
        hidden: false
      },
      {
        id: "prod-3",
        slug: "samsung-galaxy-s24-ultra",
        name: "Samsung Galaxy S24 Ultra 512GB",
        store: "somali-electronics",
        category: "electronics",
        price: 1199.00,
        compare_at: 1299.00,
        rating: 4.95,
        reviews_count: 88,
        sold: 45,
        in_stock: true,
        badge: "Top Tech",
        description: "Titanium Gray flagship smartphone with Galaxy AI & S-Pen.",
        specs: [{ name: "RAM", value: "12GB" }, { name: "Storage", value: "512GB" }],
        images: ["/api/uploads/products/msa5tuqt-fxvewy.jpg"],
        variants: [{ id: "v-3", name: "Titanium Gray", price: 1199.00, stock: 8 }],
        hidden: false
      },
      {
        id: "prod-4",
        slug: "royal-somali-luban-oud",
        name: "Royal Somali Luban & Premium Oud Perfume 100ml",
        store: "banaadir-perfumes",
        category: "beauty-perfume",
        price: 65.00,
        compare_at: 80.00,
        rating: 5.0,
        reviews_count: 31,
        sold: 95,
        in_stock: true,
        badge: "Exclusive",
        description: "Rich blend of natural Maydi frankincense and Cambodian agarwood.",
        specs: [{ name: "Volume", value: "100 ml" }],
        images: ["/api/uploads/products/msa5tuqw-46ecoq.jpg"],
        variants: [{ id: "v-4", name: "100ml Eau de Parfum", price: 65.00, stock: 30 }],
        hidden: false
      }
    ];

    const { error: prodErr } = await supabase.from("products").upsert(productsData, { onConflict: "id" });
    if (prodErr) console.error("  ❌ Products error:", prodErr.message);
    else console.log(`  ✓ Successfully seeded ${productsData.length} products.`);

    // 4. SEED ORDERS
    console.log("\n📑 Transferring Orders...");
    const ordersData = [
      {
        id: "BM-8921",
        date: "2026-07-30",
        customer: "Ayaan Warsame",
        email: "ayaan@banaadirmall.com",
        phone: "+252 61 555 1234",
        address: "Hodhan District, Near KM4",
        city: "Mogadishu",
        store: "karaca-home",
        total: 89.99,
        items: [{ productId: "prod-1", name: "Karaca Hatır Mod Milk Coffee Maker", qty: 1, price: 89.99 }],
        status: "delivered"
      },
      {
        id: "BM-8922",
        date: "2026-07-31",
        customer: "Liban Mohamed",
        email: "liban@gmail.com",
        phone: "+252 61 777 8899",
        address: "Waberi District",
        city: "Mogadishu",
        store: "us-polo-assn",
        total: 69.00,
        items: [{ productId: "prod-2", name: "U.S. Polo Assn. Classic Pique Polo Shirt", qty: 2, price: 34.50 }],
        status: "processing"
      }
    ];

    const { error: ordErr } = await supabase.from("orders").upsert(ordersData, { onConflict: "id" });
    if (ordErr) console.error("  ❌ Orders error:", ordErr.message);
    else console.log(`  ✓ Successfully seeded ${ordersData.length} orders.`);

    // 5. SEED MARKETING & FLASH DEALS
    console.log("\n🎯 Transferring Marketing Settings & Flash Deals...");
    const marketingData = {
      id: 1,
      announcement: "Free delivery in Mogadishu on orders over $25 · Pay with EVC Plus, Zaad & eDahab",
      hero_badge: "🇸🇴 Proudly Somali · 8 categories · Trusted local stores",
      hero_title_top: "The whole market,",
      hero_title_highlight: "in your pocket.",
      hero_subtitle: "Shop electronics, fashion, beauty and more from Somalia's best stores.",
      sections: [
        { key: "banners", visible: true },
        { key: "promoTiles", visible: true },
        { key: "categories", visible: true },
        { key: "brands", visible: true },
        { key: "flash", visible: true },
        { key: "value", visible: true },
        { key: "trending", visible: true },
        { key: "stores", visible: true },
        { key: "new", visible: true }
      ],
      banners: [],
      promo_tiles: [],
      campaign: { active: false, name: "Eid Mega Sale", pct: 10 }
    };

    const flashData = {
      id: 1,
      active: true,
      name: "Flash Deals",
      ends_at: new Date(Date.now() + 86400000 * 3).toISOString(),
      product_ids: ["prod-1", "prod-2", "prod-3", "prod-4"]
    };

    await supabase.from("marketing_settings").upsert(marketingData, { onConflict: "id" });
    await supabase.from("flash_deals").upsert(flashData, { onConflict: "id" });
    console.log("  ✓ Successfully seeded marketing settings and flash deals.");

    console.log("\n🎉 Data transfer to Supabase completed successfully!");
  } catch (err) {
    console.error("❌ Migration failed:", err);
  }
}

seed();
