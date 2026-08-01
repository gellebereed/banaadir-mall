-- ─────────────────────────────────────────────────────────────────────────
-- MIGRATION: Add missing columns to products table for full mutation support
-- Run this in the Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────

-- Add stock column if missing
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock INT DEFAULT 0;

-- Add icon column if missing  
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '🛍️';

-- Add art column if missing
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS art JSONB DEFAULT '{"from":"#e0f2fe","to":"#bae6fd"}'::jsonb;

-- Add colors column if missing
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS colors JSONB DEFAULT '[]'::jsonb;

-- Add sizes column if missing
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sizes JSONB DEFAULT '[]'::jsonb;

-- Add default_variant_id if missing
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS default_variant_id TEXT;

-- ─────────────────────────────────────────────────────────────────────────
-- Add missing columns to stores table for full mutation support
-- ─────────────────────────────────────────────────────────────────────────

-- Add icon column if missing
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '🛍️';

-- Add followers column if missing
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS followers INT DEFAULT 100;

-- Add joined_year column if missing
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS joined_year INT DEFAULT 2026;

-- Add verified column if missing
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT TRUE;

-- Add official column if missing
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS official BOOLEAN DEFAULT FALSE;

-- Add category column if missing
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';

-- Add art column if missing
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS art JSONB DEFAULT '{"from":"#e0f2fe","to":"#bae6fd"}'::jsonb;
