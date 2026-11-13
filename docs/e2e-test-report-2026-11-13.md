# End-to-end test report, round 3: shoppers, sellers and admin

**Date:** 13 Nov 2026 · **Code:** `main` at `78c603c` (after PR #18)
**Build:** `npx tsc --noEmit` ✅ and `npm run build` ✅, then tested on
`next start` (production mode) with local JSON data.
**Live data:** read-only queries on the live Supabase project, to check what
real shoppers see. The live site itself can't be reached from the test
sandbox, so no real orders were placed and nothing live was changed.
**Method:** real browser sessions (Playwright + Chromium) at phone
(iPhone 13), tablet (iPad Mini) and desktop sizes: about 80 pages opened as guest,
shopper, seller and admin, plus the full journeys below.

The previous rounds are in [`e2e-test-report.md`](e2e-test-report.md). Its
open items were #5 (mobile money) and #21 (blazer photo); #5 is now covered by
"pay the shop directly" (PR #11), but some old text still promises otherwise
(see #3 and #4 below).

## Summary

The core journeys work end to end. A guest can buy from two shops at once,
sizes stay separate in the cart, the order splits into one parcel per shop,
the confirmation is clear, and the Somali checkout works. Sellers can add a
product, move orders along and edit their settings. The admin can approve a
store, manage orders and edit products. No page crashed, and no page scrolls
sideways at phone, tablet or desktop size.

The real problems are trust and safety ones. One tap on **Delete product**
erased a product for good, with no question asked. And the site promises
things it doesn't deliver: a 10% code no shop accepts, and payment methods
most shops don't take.

| | Count | Fixed in this PR |
|---|---|---|
| 🔴 Fix first | 3 | 1 (#1) |
| 🟠 Important | 6 | 2 (#4 partly, #6) |
| 🟡 Minor | 5 | 1 (#10) |

---

## 🔴 Fix first: these lose data, money or trust

### 1. One tap deletes a product for good, with no warning ✅ fixed in this PR
On the product edit page, **Delete product** sits at the end of a long form,
next to where a thumb lands when scrolling to **Save**. Tapping it deleted the
product straight away: no "are you sure?", no undo. During testing the admin
deleted *AuraPods Pro* this way by accident. On the live site this deletes the
row in the database.

The same was true for **Delete** on shop offers and promotions, **Remove** on
discovery pushes, **Delete** on stories, **Remove from team**, and the admin
order dropdown, where choosing *Cancelled* cancelled the order (and restocked
it) silently. The seller's own order screen already asked first.

**Fix (this PR):** `PendingButton` takes a `confirm` question; all of the
above now ask first, and say what will happen. Re-tested: tapping
**Delete product** and answering *Cancel* keeps the product live.

### 2. Sign-up promises 10% off with BANAADIR10, but no shop accepts it ✅ line removed in this PR (owner's choice, 13 Nov)
`/register` says *"get 10% off your first order with code BANAADIR10"*. On the
live site **no store has joined** that promotion
(`marketing_settings.promo.stores` is empty, U.S. Polo Assn. declined), so a new
customer who types it is told *"BANAADIR10 isn't accepted by the shops in your
cart."* That is the first thing a new customer tries. (It also isn't limited
to a first order.)

**Owner's decision:** either get shops to join the code (sellers see the
invitation on their dashboard), or show the sign-up line only while at least
one shop accepts it. The second is a small code change.

### 3. The site promises EVC Plus, Zaad and eDahab, but 4 of 5 shops take only cash
Live data: only **U.S. Polo Assn.** has saved a payment number (an EVC
merchant code). Cinnamon House, Altınyıldız Classics, Elite Kitchen and
Özdilek have none, so their checkout offers only cash on delivery, which is
correct. But the shopper is promised mobile money in four places first:

- the top announcement bar: *"Pay with EVC Plus, Zaad & eDahab"*
  (admin text in `/admin/marketing`),
- every product page: *"Pay on delivery, or with EVC Plus · Zaad · eDahab"*
  (`promise.pay` in `lib/i18n.ts`, shown by `DeliveryPromise`), whatever the
  shop accepts,
- the footer lists **Visa** and **Mastercard**, which nobody accepts
  (`components/layout/Footer.tsx`),
- Help → payments says *"Visa/Mastercard… you'll get a payment prompt on your
  phone right after placing the order"* (`app/help/page.tsx`), which hasn't
  been true since customers started paying the shop directly.

**Fix:** ask the four shops to add their numbers in **Settings → Payment
methods**. Then make the product-page line come from the shop's own methods,
drop Visa/Mastercard, and rewrite the Help answer. The text changes are small,
but they describe how customers pay, so they need the owner's wording first.

---

## 🟠 Important: confusing, or quietly wrong

4. **Phone-width cards squashed to one word per line** ✅ fixed in this PR.
   The *"Invitation from Banaadir Mall"* card on the seller dashboard, and the
   *"Banners, campaigns & tiles"* card on `/admin/marketing`, gave all their
   width to the buttons, so the text wrapped one word per line down the whole
   screen. Now the text keeps at least 15rem and the buttons wrap underneath.
   No other page has this problem (checked automatically on all 55
   storefront/seller/admin pages at phone width).
5. **Live orders are all still "Order placed".** All 9 orders in the live
   database are `pending`, the oldest from 21 Oct. If they are real, nobody
   has moved them along, and the customers' tracking pages still say
   *"Order placed"*. If they are tests, cancel them so the counts on the
   dashboards mean something.
6. **Admin can cancel any order, even a delivered one, by mistake** ✅ fixed
   in this PR (see #1): the dropdown now asks first.
7. **509 Altınyıldız products are waiting for a category.** On the live site
   they are on the hidden *needs-category* shelf, so shoppers can't find them.
   They are filed in `/admin/categories` → holding queue. Elite Kitchen
   (1,553) and Özdilek (433) also have most of their catalogue hidden; worth
   checking that this is on purpose.
8. **Elite Kitchen has no WhatsApp number**, so its customers can't send the
   order slip and the shop gets no WhatsApp alerts.
9. **"Not found" pages answer with status 200, not 404.** `/product/<gone>`,
   `/store/<gone>`, `/category/<gone>` and `/campaign/<gone>` show the
   *"Lost at sea?"* page but tell Google the page is fine, so deleted products
   can stay in search results as "soft 404s". A truly unknown URL returns 404
   correctly. This is likely the page-level loading screen streaming before
   `notFound()`; it needs a careful fix, not a quick one.

## 🟡 Minor

10. ✅ Fixed in this PR: *Remove from team* now asks first (see #1).
11. The tracking page hint still says *"Order numbers look like BM-12345"*;
    new numbers are 10 digits (`BM-0967810216`).
12. 5 live Altınyıldız products are visible to shoppers with no photo.
13. A store owner who opens `/admin` lands on the sign-in page without being
    told why. It should say *"This page is for the marketplace admin"*.
14. The admin dashboard opens on *last 30 days*, so with no recent orders it
    shows *Marketplace revenue $0* and *Orders 0* while `/admin/orders` lists
    every order. That's correct, but reads like "the orders disappeared".
    Opening on *All time* until there's 30 days of history would help.

---

## Owner's decisions (13 Nov)

- **#2:** hide the sign-up line for now. Done in this PR.
- **#3:** keep the payment wording as it is while stores finish setting up.
- **#5:** the 9 live orders were tests; cancel them.
- **New:** the admin can hide a store that isn't fully set up, so the site can
  go live without it. Built in this PR: `/admin/stores` → *Who shoppers can
  see*, with a set-up checklist per store (products with photos, WhatsApp,
  logo; a mobile money number is optional). A hidden store's page, products,
  search results, categories and campaigns disappear for shoppers, checkout
  refuses its items from an old basket, and its owner keeps the dashboard
  with a notice saying the store is hidden. Needs
  `supabase/migration-store-hidden.sql` on the live database.

## Journeys tested

| Who | Device | Journey | Result |
|---|---|---|---|
| Guest | Phone | Blazer Navy·M + Black·S + earbuds from a 2nd shop → cart → empty-form checkout (errors shown per field) → typed `0615 22 33 44` → placed | ✅ 2 separate lines, 2 parcels, phone saved as `+252 615 223 344`, cash on delivery, clear "what happens next" |
| Guest | Phone, Somali | Switched to SO → product page, cart, checkout | ✅ Somali throughout |
| New shopper | Phone | Register (terms unticked → blocked) → account → wishlist → promo code → checkout pre-filled → order | ✅ apart from #2 |
| Shopper | Phone | Search "blazer", typo "bluezer" (helpful empty state), Somali "kabo" (3 shoes) | ✅ |
| Seller | Phone | Add product with photo; Publish without a category (scrolls to the error) → choose Electronics → published → found by search | ✅ |
| Seller | Phone | Order Placed → Being Packed; choose Cancelled (asks first) | ✅ |
| Applicant | Phone | Apply at `/sell` → "awaiting approval" | ✅ (local mode can't sign in afterwards; known, see old #27) |
| Admin | Phone | Approve a pending store (appears on `/stores`), change an order, edit a product | ✅ apart from #1 |
| Everyone | Phone / tablet / desktop | Every page in the storefront, `/vendor/**`, `/admin/**`: loads, no crash, no sideways scroll | ✅ |
| Customer | Phone | Opening `/vendor` → sent to `/sell`; `/admin` → sign-in | ✅ |

## Not covered

- Placing real orders on the live site (not reachable from the sandbox, and
  it would notify real shops).
- Emails and password reset, WhatsApp Cloud alerts, the Odoo import, AI
  suggestions (no keys in the sandbox).
- Product photos from the live storage (blocked in the sandbox, so pages show
  placeholder icons).
- Security: handled separately.
