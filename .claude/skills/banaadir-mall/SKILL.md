---
name: banaadir-mall
description: Working on the Banaadir Mall codebase — finding code via the code graph instead of exploring, the seller/admin dashboard conventions (server actions, SafeForm, design tokens), and the checks to run before committing. Use for any feature, fix or UI change in this repository.
---

# Banaadir Mall

## 1. Navigate with the code graph, not by exploring

Exploring (listing directories, grepping broadly, opening files to see
what they are) is the most expensive thing an agent does here. The answers
are precomputed:

| Question | Cheapest answer |
|---|---|
| Which file serves `/vendor/products`? | `.claude/graph/CODEMAP.md` → "Pages" |
| What is `components/dashboard/X` for? | CODEMAP one-liner |
| Who uses `updateProduct` / what does a file import? | `npm run graph -- --query updateProduct` |
| Is the map current? | `npm run graph -- --check` (the SessionStart hook rebuilds it) |

Rules:
- Read CODEMAP.md once per session; don't re-read it.
- Open a file only after the graph has pointed you at it. In files over
  ~400 lines, `grep -n` for the symbol and read that range only.
- After adding/moving/deleting files, run `npm run graph` and commit the
  updated `.claude/graph/CODEMAP.md`.

## 2. Architecture in one screen

- **Routes**: `app/` (App Router). Seller dashboard `app/vendor/**`, admin
  `app/admin/**`, storefront everything else. Dashboard pages call
  `requireVendor()` (lib/session) and gate edits with `may(session, "products.edit")` (lib/auth).
- **Reads**: `lib/api.ts` only — it picks Supabase or the local JSON DB.
- **Writes**: server actions in `app/actions.ts` (and a few `*/actions.ts`).
  Each starts with `requireAccess(area)`, validates, writes, calls
  `refresh()`, then `redirect()` or returns `{ ok, message }` / `{ error }`.
  Thrown messages are hidden in production — return `{ error }` for text the
  user must see.
- **Forms**: wrap in `SafeForm` (drafts to localStorage via `storageKey`,
  survives deploy-time action errors). Submit with `SubmitButton`.
  Client widgets post through hidden inputs (`variantsJson`, `imagesJson`,
  `defaultVariantId`, `subcategory`, …) — keep those names when redesigning
  UI, the server reads them.
- **Photos**: new files are staged client-side, compressed
  (`lib/image-compress`), and represented in the order list by
  `uploadPlaceholder()` so the server slots each upload where the seller
  put it. Variant photos post as `variant-photos-<variantId>`.
- **Categories**: the tree is admin-owned. Imports never create
  categories — they map supplier groupings onto existing ones
  (`lib/category-mappings.ts`); unmatched products wait on the hidden
  `needs-category` shelf until the admin files them in /admin/categories.
- **Types**: `lib/types.ts` (`Product`, `Variant`, …); variant helpers in
  `lib/product-utils.ts` (`hasVariants`, `totalStock`, `colorSwatch`).

## 3. UI conventions

- Tailwind 4 tokens from `app/globals.css`: `ocean-*` (brand/primary
  text), `mango-*` (primary CTA), `sand-*` (surfaces, borders), `coral-*`
  (danger/sale), plus Tailwind's `emerald`/`amber`/`slate`.
- Shared classes: `card`, `input`, `label`, `btn-primary`, `btn-secondary`,
  `font-display` for headings, `animate-fade-up` for entrances.
- Dashboard building blocks live in `components/dashboard/` — check
  CODEMAP before writing a new one (`SearchableSelect` for long option
  lists, `ColorPickerControl`, `PhotoManager`/`PhotoPicker`, `StatCard`).
- Mobile first: every dashboard screen must work at 375px wide.
- Comments explain *why* (the bug or user problem a choice prevents), in
  the existing long-form style. Match it; don't narrate *what*.

## 4. Before committing

```bash
npx tsc --noEmit        # must be clean
npm run build           # when routes, server actions or config changed
npm run graph           # when files were added, moved or removed
```

Demo logins for clicking through (see README): seller
`karaca-home@seller.banaadirmall.com` / `Seller@2026`, admin
`admin@banaadirmall.com` / `Admin@2026`.
