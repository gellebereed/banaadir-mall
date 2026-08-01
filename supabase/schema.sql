-- ─────────────────────────────────────────────────────────────────────────
--  BANAADIR MALL — SUPABASE DATABASE SCHEMA
-- ─────────────────────────────────────────────────────────────────────────
-- Run this SQL in your Supabase Dashboard > SQL Editor to create all tables
-- ─────────────────────────────────────────────────────────────────────────

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. STORES
CREATE TABLE IF NOT EXISTS public.stores (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  logo TEXT,
  banner TEXT,
  rating NUMERIC(3, 2) DEFAULT 0,
  reviews_count INT DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending', 'rejected', 'suspended')),
  owner TEXT,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CATEGORIES
CREATE TABLE IF NOT EXISTS public.categories (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  image TEXT,
  description TEXT,
  count INT DEFAULT 0
);

-- 3. PRODUCTS
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  store TEXT NOT NULL REFERENCES public.stores(slug) ON DELETE CASCADE,
  category TEXT NOT NULL REFERENCES public.categories(slug) ON DELETE CASCADE,
  price NUMERIC(10, 2) NOT NULL,
  compare_at NUMERIC(10, 2),
  rating NUMERIC(3, 2) DEFAULT 0,
  reviews_count INT DEFAULT 0,
  sold INT DEFAULT 0,
  in_stock BOOLEAN DEFAULT TRUE,
  badge TEXT,
  description TEXT,
  specs JSONB DEFAULT '[]'::jsonb,
  images JSONB DEFAULT '[]'::jsonb,
  variants JSONB DEFAULT '[]'::jsonb,
  hidden BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. ORDERS
CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  customer TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  store TEXT NOT NULL,
  total NUMERIC(10, 2) NOT NULL,
  items JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. PROMOTIONS
CREATE TABLE IF NOT EXISTS public.promotions (
  id TEXT PRIMARY KEY,
  store TEXT NOT NULL,
  name TEXT NOT NULL,
  pct INT NOT NULL,
  code TEXT,
  active BOOLEAN DEFAULT TRUE,
  product_ids JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. EMPLOYEES
CREATE TABLE IF NOT EXISTS public.employees (
  id TEXT PRIMARY KEY,
  store TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  added_at TEXT
);

-- 7. MARKETING SETTINGS
CREATE TABLE IF NOT EXISTS public.marketing_settings (
  id INT PRIMARY KEY DEFAULT 1,
  announcement TEXT,
  hero_badge TEXT,
  hero_title_top TEXT,
  hero_title_highlight TEXT,
  hero_subtitle TEXT,
  sections JSONB DEFAULT '[]'::jsonb,
  banners JSONB DEFAULT '[]'::jsonb,
  promo_tiles JSONB DEFAULT '[]'::jsonb,
  campaign JSONB DEFAULT '{}'::jsonb
);

-- 8. FLASH DEALS
CREATE TABLE IF NOT EXISTS public.flash_deals (
  id INT PRIMARY KEY DEFAULT 1,
  active BOOLEAN DEFAULT TRUE,
  name TEXT DEFAULT 'Flash Deals',
  ends_at TEXT,
  product_ids JSONB DEFAULT '[]'::jsonb
);

-- 9. FLASH REQUESTS
CREATE TABLE IF NOT EXISTS public.flash_requests (
  id TEXT PRIMARY KEY,
  store TEXT NOT NULL,
  product_id TEXT NOT NULL,
  original_price NUMERIC(10, 2) NOT NULL,
  deal_price NUMERIC(10, 2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at TEXT
);

-- ─────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Enable RLS and grant read access to anonymous users and write to authenticated
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flash_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flash_requests ENABLE ROW LEVEL SECURITY;

-- Allow public read access to catalog tables
CREATE POLICY "Public stores viewable" ON public.stores FOR SELECT USING (true);
CREATE POLICY "Public categories viewable" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Public products viewable" ON public.products FOR SELECT USING (true);
CREATE POLICY "Public orders viewable" ON public.orders FOR SELECT USING (true);
CREATE POLICY "Public promotions viewable" ON public.promotions FOR SELECT USING (true);
CREATE POLICY "Public employees viewable" ON public.employees FOR SELECT USING (true);
CREATE POLICY "Public marketing viewable" ON public.marketing_settings FOR SELECT USING (true);
CREATE POLICY "Public flash deals viewable" ON public.flash_deals FOR SELECT USING (true);
CREATE POLICY "Public flash requests viewable" ON public.flash_requests FOR SELECT USING (true);

-- Allow full access for anon/service_role keys
CREATE POLICY "Full stores management" ON public.stores FOR ALL USING (true);
CREATE POLICY "Full categories management" ON public.categories FOR ALL USING (true);
CREATE POLICY "Full products management" ON public.products FOR ALL USING (true);
CREATE POLICY "Full orders management" ON public.orders FOR ALL USING (true);
CREATE POLICY "Full promotions management" ON public.promotions FOR ALL USING (true);
CREATE POLICY "Full employees management" ON public.employees FOR ALL USING (true);
CREATE POLICY "Full marketing management" ON public.marketing_settings FOR ALL USING (true);
CREATE POLICY "Full flash deals management" ON public.flash_deals FOR ALL USING (true);
CREATE POLICY "Full flash requests management" ON public.flash_requests FOR ALL USING (true);
