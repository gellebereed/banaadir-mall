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

## Artwork sizes (banners & campaign tiles)

These are the **exact frames the storefront renders**, measured in the
browser — not rounded guesses. Match them and nothing gets cropped.

| Asset | Size | Ratio | Notes |
|---|---|---|---|
| Banner — desktop | **1600 × 600** | 8:3 (2.67:1) | Shown from the `sm` breakpoint up |
| Banner — mobile | **1000 × 800** | 5:4 (1.25:1) | Phones only; optional but strongly recommended |
| Banner — "whole image" mode | **1600 × 700** | 16:7 (2.29:1) | Only if you set *Image display → show the whole image* |
| Campaign tile | **800 × 300** | 8:3 (2.67:1) | Background art only — see below |

Export as **JPG or WebP, under 300 KB**. Uploads are re-encoded to WebP and
capped at 1600px automatically, so don't bother pre-shrinking.

### Why the mobile banner matters

Desktop is 2.67:1 and mobile is 1.25:1 — very different shapes. With one
image, phones crop away most of the left and right, which is what makes a
banner look accidental. Upload a mobile version and each gets its own
art direction. If you skip it, the desktop image is used and centre-cropped,
so keep anything important in the **middle 60%**.

### Campaign tiles are backgrounds, not finished graphics

The site draws the tile's **label and sublabel over the artwork in dark
ink**. So tile art should:

- stay **light** on the left half (that's where the text lands),
- put the subject/motif on the **right**,
- keep that motif within the central **70%** — mobile shows tiles in two
  columns at roughly 1.5:1, which crops the sides.

Banners are the opposite: text there is **optional**. If your artwork
already carries the headline, leave title/subtitle/CTA empty and the banner
renders clean with no darkening scrim over your design.

### Sample set

`npm run seed:marketing` installs a worked example — an "Eid Mega Sale"
banner (desktop + mobile) and four tiles (50% off, Buy 4 Pay 3, Free
delivery, New In) — built at exactly these sizes using the brand palette.
Use them as a template, then delete or replace them from `/admin/marketing`.

## Deploying to Netlify — check this first

Open **`/api/health`** on the deployed site. It answers "is this environment
actually saving my changes?" in one request and names the fix.

Two settings must be right, and the second one catches people out:

1. **Netlify → Site configuration → Environment variables** must contain
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. **You must redeploy after adding them** — Deploys → *Trigger deploy* →
   **Clear cache and deploy site**.

Step 2 is not optional. `NEXT_PUBLIC_*` variables are **inlined into the
bundle when the app is built**, not read at runtime. Adding them in the
Netlify UI does nothing to an already-built deploy, so the site keeps
running with Supabase effectively unconfigured.

When that happens the symptoms are exactly "I can't update products":
Netlify's filesystem is read-only and each request runs in a fresh Lambda,
so the app falls back to the built-in seed catalog and an in-memory store —
saves report success and vanish on the next request. `mutateDB` now throws a
clear error in that situation instead of pretending to succeed.

## ⚠️ Supabase: run the migration first

```bash
npm run check:supabase
```

If it says **ACTION NEEDED**, open Supabase → **SQL Editor** → paste
`supabase/migration.sql` → **Run**. It is idempotent (safe to re-run).

Until that migration runs, the `products` and `stores` tables are missing
columns the app needs, which caused two bugs:

| Symptom | Cause |
|---|---|
| Product edits "don't save" — stock always shows **50** | No `stock` column; the number was squeezed into an `in_stock` boolean and read back as a hard-coded 50 |
| **Official Brand Stores** section vanished from the home page | No `official` column, so every store read back as `official: false` and the section rendered nothing |
| Feature bullets grew a stray `": "` on every save | They were forced through the `specs` `{name,value}` shape |
| Icon / colours / sizes / default variant reset on save | No columns to store them |

The code now degrades gracefully before the migration (official brands are
inferred from a known-brand slug list, writes retry without the newer
columns) — but **run the migration** to get real stock numbers and full
persistence.

Then run `supabase/migration-odoo-catalog.sql` as well. It adds the product
identity fields (internal reference, barcode, unit of measure), turns
categories into a tree, and installs the uniqueness rules — see
[Product identity](#product-identity-barcodes-internal-references--the-category-tree).
Writes retry without those columns too, so nothing breaks beforehand; codes
simply won't persist until it has run.

### Never let a save fail silently

`updateProductFields` / `updateStoreFields` use `.select()` so PostgREST
returns the changed rows. Without it, an `UPDATE` whose filter matches no
row reports **success while changing nothing** — a save that silently does
nothing. They also retry on `slug` when a match on `id` finds no row.

And when Supabase is the source of truth, a failed write now **throws**
instead of falling back to the JSON overlay: the read layer ignores that
overlay whenever Supabase returns rows, so the fallback made edits *look*
saved and then revert.

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

## Multi-vendor orders & WhatsApp notifications

One cart can hold items from several stores, and each store packs and ships
its own parcel. So one checkout produces **one order record per store**:

```
BM-12345                 ← the number the customer is given
  ├─ BM-12345-HODA       store: hodan-electronics
  └─ BM-12345-SAHR       store: sahra-fashion
```

`lib/order-utils.ts` owns that id scheme — `vendorOrderIds()`. Both
`submitOrderAction` and the confirmation screen call it, because they used
to derive ids independently and disagreed: the customer was shown
`BM-12345`, which matched no stored record. It also disambiguates stores
whose slugs share four characters (`karaca-home` / `karaca-kids` both gave
`KARA`), where two identical ids in one order would upsert over each other
and silently lose a vendor's parcel.

**Tracking accepts the base id.** That's the only number the customer ever
has, while the stored records are the per-vendor ones. `getOrderAction`
falls back to collecting the parcels and merging them, showing the *least
advanced* status — an order isn't delivered until every parcel has arrived.
One cancelled parcel doesn't sink the rest (`mergeParcelStatuses`).

### The messages

`lib/whatsapp.ts` composes every message. Two rules it exists to enforce:

- **A vendor never sees the whole-order total.** They're owed for their
  items only. Sending the grand total to three vendors means three vendors
  each believing they're owed the full amount — a payment dispute later.
- **The message quotes the vendor's real id** (`BM-12345-HODA`). Quoting an
  id that matches no record is worse than quoting none: they search, find
  nothing, and stop trusting the system.

Messages use WhatsApp's own markers (`*bold*`, `_italic_`) — not markdown,
which it doesn't render. Amounts are written to two decimals rather than
through `money()`, which drops trailing zeros: right for a price tag
(`$49`), wrong for an order document, where it yields `$29.5`.

The product's **internal reference** is included per line when it has one,
so the parcel can be picked off a shelf without opening the dashboard.

### Telling the seller an order arrived

A seller used to find out an order existed whenever they next happened to
open the dashboard — the WhatsApp hand-off at checkout only fires if the
*customer* taps it. Run `supabase/migration-order-notifications.sql`, then:

- **A bell with an unread count** in the dashboard header (desktop *and*
  mobile, since a seller on a phone is exactly who needs telling), plus a
  badge on the Orders tab and a **New** tag on the rows themselves.
- **New orders arrive live** over Supabase Realtime — the row is pushed the
  moment it's inserted, filtered server-side to that store.
- **A chime and a desktop notification** when one lands. Permission is never
  requested on page load (the pattern everyone denies); it's only used if
  already granted.

Delivery is layered so the useful part always works: realtime → a 60s poll
(covers a dropped socket or a slept laptop, and re-checks on tab focus) →
the server-rendered count, which is correct on every page load regardless.
The dot on the bell says which mode is active rather than pretending.

**Unread state lives in `orders.seen_at`, not the browser.** A seller who
checks orders on their phone shouldn't find the same badge waiting on their
laptop. Opening the orders page clears it — but *after* paint, so the "New"
tags are still visible on the visit that clears them.

> The migration marks pre-existing orders as seen. Greeting someone with a
> badge of 40 for orders they handled weeks ago is the fastest way to teach
> them to ignore badges forever.

### Parcels, drivers and tracking

Each parcel travels on its own. `orders.delivery` holds **who is carrying
that box** — name, phone, optional company and waybill — and
`orders.timeline` stamps when each step happened. Run
`supabase/migration-order-delivery.sql` to add both.

A customer tracking an order sees one card per parcel: what's inside, its
own journey with timestamps, and **Call / WhatsApp buttons for that
parcel's driver**. There is deliberately no order-wide timeline — one shop
can have delivered while another hasn't packed, so a combined bar has to
pick one of those to show, and it ends up contradicting the cards beneath it.

Sellers dispatch from **Vendor → Orders**. Two things make this stick:

- **A parcel can't be marked "on the way" without a driver's phone.** The
  server refuses it. A shipped parcel nobody can chase is the exact problem
  this feature exists to prevent, and the orders page counts any older
  parcels already in that state.
- **Drivers are saved on the shop** (`stores.couriers`) and offered as
  one-tap buttons. Re-typing a name and number on every order is the step
  that gets skipped when a shop is busy.

When one driver carries several parcels of the same order, that's detected
by comparing normalised numbers (`sharedCourierGroups`) and stated once —
"Cabdi Xasan is bringing 2 of your parcels together" — instead of showing
the same number on three cards.

Timeline honesty is enforced in `lib/delivery.ts`: re-saving courier details
doesn't restamp a step, so a parcel can't look like it shipped twice; and
moving one backwards drops the steps that no longer apply, so a parcel
returned to "packing" stops claiming it was delivered an hour ago.

> **Dev note:** without Supabase configured, new orders are never persisted
> server-side (`submitOrderAction` only writes them to Supabase), so they
> won't appear in the seller dashboard locally. Seed orders still work for
> testing dispatch.

### Vendor numbers

Sellers add theirs in **Store Settings → Order WhatsApp number**. It's
normalised on save, so every way it gets typed (`+252…`, `00252…`, `061…`,
spaced, bracketed) resolves to the bare international digits `wa.me` needs.

A store with no number falls back to `NEXT_PUBLIC_SUPPORT_WHATSAPP` (or the
platform default), and the confirmation screen **says so plainly** rather
than implying a direct line to the shop.

Run `supabase/migration-vendor-whatsapp.sql` to add the column. It
backfills from the older `stores.phone` column, which existed but was never
read, so no seller re-types a number they already gave.

> **This is customer-initiated**, not a push notification — the customer
> taps to send. Server-side delivery would need the WhatsApp Business API;
> the message composition here is reusable as-is if you add it.

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

## Product identity: barcodes, internal references & the category tree

The catalogue is built on the same three identity fields Odoo keys a product
on, so the two systems can be connected later **without a reconciliation
project**. Run `supabase/migration-odoo-catalog.sql` to add them.

| Odoo | Here | Where a seller edits it |
|---|---|---|
| `product.template.default_code` | `Product.internalReference` | Product form → *Product codes* |
| `product.template.barcode` | `Product.barcode` | Product form → *Product codes* |
| `product.template.uom_id` | `Product.uom` | Product form → *Product codes* |
| `product.product.default_code` | `Variant.sku` | Variant editor, per row |
| `product.product.barcode` | `Variant.barcode` | Variant editor, per row |
| `product.category.parent_id` | `Category.parentSlug` | Admin → Categories → *Parent category* |

### A variant is a `product.product`

Odoo always materialises **at least one** `product.product` per template.
This app mirrors that exactly: a product with no variants *is* its own single
sellable unit. `sellableUnits(product)` in `lib/odoo/mapping.ts` resolves
that for you — always iterate it rather than branching on `variants?.length`,
so the two cases can never drift apart.

The variant's barcode is the one a scanner reads; the product's is the
fallback for variants that have none. Same precedence as Odoo.

### Three layers enforce uniqueness — keep all of them

A barcode that identifies two items is worse than no barcode at all, so the
rule is enforced three times over:

1. **In the browser** (`components/dashboard/ProductCodesFields.tsx`) — a
   barcode reused across two variants of the same product is flagged while
   the seller is still filling the rows in.
2. **In the server action** (`assertCodesAreFree` in `app/actions.ts`) — the
   only layer that can say *"8691… is already on Karaca Tencere Seti"*. A
   database constraint can't name the conflict, and an error you can't act
   on is an error that gets worked around.
3. **In Postgres** (`banaadir_check_product_codes` trigger) — covers direct
   SQL, bulk imports, and two sellers racing on the same code. Variant codes
   live inside JSONB where no unique index reaches, which is why this is a
   trigger and not just an index.

`lib/barcode.ts` is shared by layers 1 and 2, so they can't disagree.

**Codes are sanitised, not rejected.** `normalizeBarcode` and
`normalizeReference` clean what's typed — scanner preambles, invisible
characters pasted from Excel, stray symbols — and store the result.
Validation never blocks a save, because a seller who can't save their
product will simply stop entering codes at all, which is a worse outcome
than an imperfect one. `gtinCheckDigit()` is still exported if you want to
warn (not block) on a GTIN whose check digit doesn't add up.

### Categories are a tree

`parentSlug` makes categories hierarchical, matching Odoo's
`product.category`. Two consequences worth knowing:

- **A parent page includes its children's products.**
  `getProductsByCategory("home-living")` returns everything under *Cookware*
  and *Bedding* too — otherwise a parent category looks empty the moment
  sellers start using subcategories.
- **Cycles are impossible.** The admin UI won't offer a descendant as a
  parent, the server action rejects one, and a database trigger rejects it
  again. A category that is its own ancestor would make every breadcrumb
  walk infinite.

`lib/category-tree.ts` holds every walk of the hierarchy as pure functions
(safe to import from client and server, like `lib/product-utils.ts`);
`lib/api.ts` wraps them with data fetching as `getCategoryTree()`,
`getCategoriesFlat()`, `getCategoryPath()` and
`getCategoryWithDescendants()`. Nothing else should walk `parentSlug` by
hand — the cycle guards live in those functions.

> **Note:** `Category.parentSlug` is the structural hierarchy. The older
> free-text `Product.subcategory` still exists for the seller-typed
> groupings that predate it — it's a display label, not part of the tree.

### Scanning

`findByCode()` resolves a barcode or internal reference to a single sellable
unit, and the storefront search box tries it **first** — scanning a code
returns that one product rather than burying it in fuzzy name matches. In
SQL the same lookup is `SELECT * FROM find_by_code('869…')`.

## Connecting Odoo (the recommended path)

Your product/store/order data already lives in Odoo. The mapping is already
written — `lib/odoo/mapping.ts` holds pure functions in both directions
(`productFromOdoo`, `categoryFromOdoo`, `variantFromOdoo`, `productToOdoo`),
so the remaining work is fetching and scheduling, not deciding what fields
mean.

1. Odoo exposes an external API over **JSON-RPC / XML-RPC**
   (`/web/session/authenticate` + `call_kw` with `search_read`).
2. Read `product.category` first, then `product.template` with its
   `product.product` rows, and pass each through the mapper.
3. **Match in this order** — `odooId`, then `barcode`, then
   `internalReference` (case-insensitive), then create. Never match on
   *name*: two vendors selling "Cotton Towel" would silently merge.
4. Pass the existing product as the mapper's `base` argument on updates, so
   merchandising done in the dashboard (photos, badges, feature bullets)
   survives the sync instead of being reset to defaults.
5. Add credentials via environment variables (`ODOO_URL`, `ODOO_DB`,
   `ODOO_USER`, `ODOO_API_KEY`) — never commit them.
6. For incremental runs, ask Odoo for `write_date > max(odoo_synced_at)`
   rather than re-reading the whole catalogue.

**Do not push stock quantities to Odoo.** `productToOdoo` deliberately omits
`qty_available`: writing it bypasses stock moves and corrupts inventory
valuation. Stock flows Odoo → here, and sales flow back as `sale.order`.

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
