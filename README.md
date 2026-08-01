# 🏝️ Banaadir Mall

A multi-vendor e-commerce marketplace for Somalia — customer storefront,
seller dashboard, and admin control panel in one codebase.

Built with **Next.js 15 (App Router) + TypeScript + Tailwind CSS 4**.
No database or external services required to run the demo — everything runs
on a local mock-data layer designed to be swapped for **Odoo** later.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000 (development — slower, see below)
```

```bash
npm run preview    # build + serve the PRODUCTION version — use this to judge speed
```

## ⚡ Why does clicking feel slow in `npm run dev`? (read this!)

The dev server compiles each page **the first time you visit it** — that
compile pause is what makes buttons/links feel laggy, and it exists in
every Next.js project, not just this one. It is **not** shipped to users.

- To feel the real speed, run `npm run preview` — pages are pre-built and
  navigation is instant.
- Every catalog route also has a `loading.tsx` skeleton
  (see `components/Skeletons.tsx`), so clicks paint feedback immediately
  instead of appearing to hang. Keep adding a `loading.tsx` next to any
  new page that fetches data — that habit is what stops "slow buttons"
  from ever coming back.

## Demo logins (end-to-end testing)

Defined in `lib/auth.ts` — the login page has tap-to-fill buttons for these:

| Role | Email | Password | Lands on |
|---|---|---|---|
| Admin | `admin@banaadirmall.com` | `Admin@2026` | `/admin` |
| Seller (any store) | `<store-slug>@seller.banaadirmall.com` | `Seller@2026` | `/vendor` (their own store) |
| Customer | `ayaan@banaadirmall.com` | `Customer@2026` | `/account` (with order history) |

Examples: `karaca-home@seller.banaadirmall.com`, `us-polo-assn@seller.banaadirmall.com`,
`sahra-fashion@seller.banaadirmall.com`. `/admin` and `/vendor` redirect to
`/login` unless the right role is signed in. The session is a plain cookie —
demo only; replace with real auth before launch.

## Fully functional dashboards

Everything in the dashboards really works and persists to a small JSON
database at `data/db.json` (delete that file to reset the demo):

**Sellers (`/vendor`)** — analytics overview (revenue chart, AOV, status
breakdown, top products) · full product editor: photos with
**reorder / set-main / remove**, **variants** with their own stock, price
and photos, pricing, category, icon, badge, description, feature bullets ·
hide or delete products · **add products that go live immediately** ·
**bulk photo import** · **promotions** on the whole store *or chosen
products* · order fulfilment (status dropdowns) · **Team page**: employees
with access roles · **Settings page**: store name, tagline, city, and
uploaded logo + banner used across the site.

**Admin (`/admin`)** — marketplace analytics · **Marketing page** (home-page
builder): banner carousel with uploaded artwork, campaign tiles, drag-free
**section arranger** (reorder + show/hide every home section), hero copy,
announcement bar and a site-wide sale campaign · **Flash Deals page**:
curate the campaign products, set the countdown, and approve or reject
seller applications · approve / reject / suspend stores · edit any product ·
manage all orders · platform staff with scoped access.

**Flash-deal workflow** — a seller applies from `/vendor/flash` with a
product and the discount they're offering; the admin approves at
`/admin/flash`, which adds the product to the campaign **and** creates the
targeted promotion automatically. Rejections and withdrawals are supported.

**Access rights** — employee roles: `manager` (everything), `products`,
`orders`, `marketing` (platform), `viewer`. Employees sign in with their
email + `Employee@2026`. Pages they lack access to show a view-only notice
or redirect.

### Route guards live in `middleware.ts` — don't remove them

`/admin`, `/vendor` and `/account` are protected in `middleware.ts`, which
runs **before** any rendering. The `redirect()` calls inside the pages are
kept as defence in depth, but they are **not sufficient on their own**:
because every route has a `loading.tsx` Suspense boundary, Next.js starts
streaming a `200` before a page-level redirect happens, so the rendered
dashboard HTML (real revenue, orders, customer names) is sent to the
browser with only a meta-refresh pointing at `/login`. `curl` or "View
source" would still read it. Middleware returns a real `307` with no body.

Verify with:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/admin
```

**How it flows:** dashboards call server actions in `app/actions.ts` →
which write to `lib/db.ts` (JSON file) → `lib/api.ts` merges those changes
over the seed catalog for every page. To connect Odoo, replace the action
bodies and the merge layer; forms and pages don't change.

### Product variants

A product either has **no variants** (one price, one stock pool) or a list
of variants that each own their stock and may override price and photos —
see `lib/product-utils.ts` for every resolution helper (`displayPrice`,
`variantStock`, `variantImages`, `defaultVariant`, `primaryImage`,
`colorOptions`). Sellers manage them in the product editor, where each
variant has its own photo strip (reorder / set-main / remove) and one
variant is marked **default**.

The default variant decides two things: which option the product page opens
on, and which photo represents the product in catalogue listings.

On listings, products with variants show **colour swatches** (hover one to
preview that colour's photo), a size count, and an "Options" button instead
of quick-add, so shoppers can see what exists without opening the product.
Out-of-stock colours are dimmed, and selecting a sold-out option disables
Add to Cart. Discounts apply to variant prices at the same percentage.

### Navigation must always feel instant

Dashboard pages render on the server, so every click costs a round-trip.
Three things keep that from feeling broken — keep all of them when adding
pages:

1. **A `loading.tsx` in every segment** (`app/admin`, `app/vendor`, catalog
   routes) so a click paints a skeleton immediately.
2. **`DashboardSidebar` uses `useLinkStatus`** to swap a link's icon for a
   spinner while its page loads. Without feedback people click repeatedly.
3. **`components/ScrollToTop.tsx`** resets scroll on navigation. Next
   normally does this, but because these routes stream, the browser can
   restore the old scroll position before the new page has height — which
   is why opening a store used to land you at the bottom of its grid.

### Revalidation — why saves used to be slow

Server actions call `refresh()`, which revalidates **only the home page**.
It deliberately does *not* call `revalidatePath("/", "layout")` (purges the
whole route tree and client router cache — this is what made every save
take seconds) or `revalidatePath("/vendor", "layout")` (remounts the form
mid-submit, wiping its `useActionState` message and showing stale data).

Dashboards and catalog pages are `force-dynamic` or read cookies, so they
re-render on every request anyway. Client forms that stay on the page call
`useRefreshOnSuccess(state)` → `router.refresh()`, which pulls fresh server
data while keeping client state. Saves now land in ~50–120 ms.

### Multi-select pickers submit from state, never from checkboxes

`ProductPicker` renders a hidden input per selected id. Do **not** put
`name="productIds"` on the visible checkboxes: only rows passing the
current search/category/store filter are rendered, so submitting from them
silently drops every selection the filter happened to hide. That bug lost
flash-deal products whenever the admin saved with a search active.

### Forms use `SubmitButton`, not a bare submit

`components/dashboard/SubmitButton.tsx` uses `useFormStatus` to disable
itself and show "Saving…" while its server action runs. Actions that stay
on the page (store settings) also return a `SaveState` and render a "✓
Saved" confirmation via `useActionState`. Without this, a submit looks like
nothing happened and people click Save repeatedly, firing the action many
times. Use it for any new dashboard form.

### Photo uploads

Uploaded images are written to `data/uploads/` and served by the route
handler at `app/api/uploads/[...file]/route.ts`. They are **not** put in
`public/`, because Next.js only serves files that existed there at build
time — runtime uploads would 404 in production. Limits: 5 MB per photo,
JPG/PNG/WebP/AVIF/GIF (see `lib/uploads.ts`). To move to cloud storage,
swap `saveImages()` for a Vercel Blob / S3 / Cloudinary upload that
returns URLs; everything else stores plain URL strings.

Products with no photos fall back to generated "studio" artwork with their
icon, so the catalog never looks broken while it is being filled in.

**Bulk import** (`/vendor/photos`) is the fast way to photograph a whole
catalog: name each file after the product id (`uspa-pique-polo.jpg`,
`uspa-pique-polo-2.jpg` for a second photo), select them all, and import.
The page also lists every product still missing photos with the exact file
name to use. Unmatched files are skipped rather than failing the import.

### Base prices vs. discounted prices — important

`getBaseProducts()` returns prices as the seller set them; `getAllProducts()`
returns those prices with any active promotion or site-wide campaign
applied. **Dashboards and edit forms must use the base functions.** Editing
a discounted price would save the discount as the new normal price and
then discount it a second time.

## Official brand stores

Four franchised international brands are seeded alongside the local stores
(flagged with `official: true` in `lib/data/stores.ts`, products in
`lib/data/products.ts`):

- **AC&Co | Altınyıldız Classics** — suits, non-iron shirts, chinos, overcoats
- **Karaca** — Hatır coffee machines, Biogranit cookware, dinner sets, tea makers
- **Özdilek** — Turkish cotton towels, bathrobes, bedding
- **U.S. Polo Assn.** — polos, jeans, sneakers, sweatshirts, bags

## Page map

| Route | What it is |
|---|---|
| `/` | Home: hero, categories, flash deals, trending, stores, seller CTA |
| `/products` | Full catalog with filters (category, price, rating, sale) + sorting |
| `/category/[slug]` | Category page (same filter UI, category pre-applied) |
| `/search?q=…` | Search results (header search bar posts here) |
| `/product/[slug]` | Product detail: variants, buy box, store card, reviews, related |
| `/stores`, `/store/[slug]` | Store directory + public store profile |
| `/cart` | Cart with qty controls, promo code (`BANAADIR10`), free-delivery meter |
| `/checkout` | Delivery details → payment method (EVC/Zaad/eDahab/COD) → success |
| `/wishlist` | Saved products (heart icon anywhere on the site) |
| `/account` | Customer profile + order history (demo user) |
| `/track` | Order tracking with delivery timeline (try `BM-10287`-style ids) |
| `/login`, `/register` | Auth screens (UI only — no real auth yet) |
| `/sell` | Seller landing page + store application form |
| `/vendor` | Seller dashboard: KPIs, revenue chart, orders, inventory |
| `/vendor/products/new` | Add-product form for sellers |
| `/admin` | **Admin control panel**: marketplace KPIs, revenue chart, top stores |
| `/admin/stores` | Store management + approval queue for new applications |
| `/admin/products` | All products across stores, low-stock warnings |
| `/admin/orders` | All orders with status breakdown |
| `/help` | FAQ + contact |

The cart and wishlist persist in `localStorage` (`bm-cart`, `bm-wishlist`).

## Architecture — read this first

```
lib/
  types.ts          Domain types (Product, Store, Order, …) — the contract
  api.ts            ★ DATA ACCESS LAYER — the ONLY place the UI gets data from
  format.ts         Money/date/number formatting helpers
  cart-context.tsx  Client-side cart + wishlist state (localStorage)
  data/             Demo data: categories, stores, products, orders
components/
  layout/           Header, Footer, mobile BottomNav
  dashboard/        StatCard, RevenueChart, StatusBadge, AdminSidebar
  shop/ShopClient   Shared filter/sort/grid used by products, category, search
  product/BuyBox    Variant + quantity + add-to-cart panel
  ProductCard, ProductImage, StoreCard, Rating, …
app/                One folder per route (see page map above)
```

**The golden rule:** pages never import from `lib/data/*` directly (the only
exceptions are small client components that need the static lists). All data
flows through the async functions in `lib/api.ts`.

## Connecting Odoo (the recommended path)

Your product/store/order data already lives in Odoo. To go from demo data to
live data, **only `lib/api.ts` needs to change**:

1. Odoo exposes an external API over **JSON-RPC / XML-RPC**
   (`/web/session/authenticate` + `call_kw` with `search_read`).
2. Map Odoo records to the types in `lib/types.ts`:
   - `product.template` → `Product`
   - `product.category` → `Category`
   - vendor `res.partner` / companies → `Store`
   - `sale.order` → `Order`
3. Replace each function body in `lib/api.ts` with the corresponding fetch.
   They are already `async`, so **no page or component changes are needed**.
4. Add credentials via environment variables (`ODOO_URL`, `ODOO_DB`,
   `ODOO_USER`, `ODOO_API_KEY`) — never commit them.
5. Consider caching (`unstable_cache` / revalidation) so the site stays fast
   even if Odoo is slow.

Until then, adding products manually = editing `lib/data/products.ts`
(one object per product; the `P()` factory fills in the boilerplate).

## Before going to production (for the next developer)

- **Authentication & roles** — the demo cookie auth in `lib/auth.ts` has
  plain-text passwords and a client-readable session. Replace with real
  auth (NextAuth.js, Clerk, or Odoo portal users) before launch; the
  `Session` shape and `getSession()` call sites can stay the same.
- **Payments** — checkout is a simulated flow. Integrate WaafiPay / local
  PSP APIs for EVC Plus, Zaad and eDahab **server-side**.
- **Product images** — the catalog currently renders generated gradient
  artwork (`components/ProductImage.tsx`). Swap in real photos via
  `next/image` and whitelist the CDN host in `next.config.ts`.
- **Orders** — "Place Order" only clears the cart. Create real orders via a
  server action → Odoo `sale.order`.
- **Search** — in-memory `includes()` matching. Fine for hundreds of
  products; move server-side (or Meilisearch/Algolia) as the catalog grows.
- **i18n** — the UI is English-first; adding Somali/Arabic is a natural next
  step (`next-intl` works well with the App Router).

## Design system

Defined in `app/globals.css` as Tailwind v4 `@theme` tokens:

- `ocean-*` — primary deep teal (Indian Ocean)
- `mango-*` — warm orange for actions and highlights
- `coral-*` — sales and urgency
- `sand-*` — warm page background
- Fonts: **Outfit** (display) + **Inter** (body) via `next/font`
- Reusable classes: `.btn-primary`, `.btn-secondary`, `.card`, `.input`, `.label`
