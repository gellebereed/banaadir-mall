# End-to-end test report: customer & store-owner journeys

**Date:** 22 Oct 2026 · **Build:** `npm run build` + `next start` (production mode)
**Data:** local JSON mode (no Supabase configured in the test sandbox)
**Method:** real browser sessions (Playwright + Chromium), mostly at phone size
(390 × 844), clicking what a person would click. Screenshots were taken at
every step.

## Status

Fixed and re-tested in the browser: **#1** cart sizes/colours · **#2**
overselling · **#3** phone numbers · **#4** name-only order matching ·
**#6** order status saves on change (Cancel asks first) · **#7/#22**
confirmation screen in Somali, with a 3-step "what happens next" (**#26**) ·
**#7 (shop notification)** WhatsApp is now optional, the placeholder number
is never offered (confirmation, account, Help page) · **#19** Buy Now goes to
checkout · **#20** guest orders appear in the account created after them.

Second round, also re-tested: **#27** store applicants — a pending applicant
sees "awaiting approval" on their account; an approved one is linked as owner
at sign-in even if approval didn't link them, with an "Open my store
dashboard" button · checkout no longer says "Order confirmed" when the order
failed to save · **#30** order numbers are 10 random digits and the server
refuses a taken one · **#22–24** Somali home hero, top bar (admin can write
their own Somali; needs `supabase/migration-marketing-translations.sql`),
status labels, tracking steps, zoom hint, one word for cart · **#12** phone
from registration pre-filled; checkout pre-fill and "verified buyer" no longer
match by name · **#8** dashboard says where "awaiting action" orders come from
· **#11** sold count rises with orders · **#13** a promo no shop accepts no
longer shows as applied · **#14** suggestions: real same-department add-ons,
cross-department only on a real shared trait; the cart's wishlist shelf shows
the saved items themselves · **#18** broken thumbnails.

Waiting: **#5** mobile money (to be connected later). Still open: #9, #10, #15,
#16, #17, #21, #29, and the rest of the tracking page text in Somali.

## Who was tested

| Persona | Device | Journey |
|---|---|---|
| **Hodan** (store owner) | Phone | Applied at `/sell` → admin approval → dashboard → added a product with photo → added WhatsApp number → moved orders Packed → On the way (with driver) → Delivered |
| **Amina** (expert shopper) | Desktop | Registered → searched, sorted, filtered → wishlist → cart from 2 shops, 2 sizes of one blazer → promo codes → stock limit → paid EVC Plus → account + tracking |
| **Khalid** (intermediate) | Phone | Home → Men's Fashion → picked colour + size → *Buy Now* → guest checkout to Hargeisa, cash on delivery → registered afterwards |
| **Abdi** (first time online) | Phone, Somali | Switched to Somali → double-tapped *Add to cart* → submitted an empty form → typed his number "0615 22 33 44" → double-tapped *Place order* → tracked his order |

Orders placed: **BM-63149** (Amina, 2 parcels), **BM-82387** (Khalid),
**BM-92541** (Abdi), **BM-56570** (stock race test).

---

## 🔴 Fix first: these lose money, orders or trust

### 1. Cart merges different sizes and colours of the same product
`lib/cart-context.tsx:257-270`: cart lines are keyed by `productId` only.
Amina added the Sultan blazer in **Black · S**, then in **Black · M**. Her cart
showed **one line: "Black · M × 2"**, so the S was silently replaced. She would
receive the wrong item. The same merge adds quantities without re-checking
stock.
**Fix:** key lines by `productId + variantId` (or colour + size), and have
`updateQty`/`removeFromCart` take that key.

### 2. The shop can sell more than it has (overselling)
The guest put 3 kettles in the cart. The owner then set the stock to **1**. Checkout still
accepted the order for **3**, and stock was clamped to 0
(`lib/stock-write.ts:51` `Math.max(0, product.stock - sold)`).
`submitOrderAction` (`app/actions.ts:2557`) never checks availability, and the
cart doesn't re-check stock before checkout.
**Fix:** in `submitOrderAction`, re-read stock for every line (and variant) and
return `{ error }` naming the item and how many are left. Show the same warning
in the cart.

### 3. Local phone numbers are saved wrongly, so the courier can't call
Khalid typed `063 444 5566` and it was saved as **`+252 063 444 5566`**. Abdi's
`0615 22 33 44` became **`+252 0615 22 33 44`**. This is how most Somalis write
their number. `CheckoutClient.tsx:387` just glues the country code on.
The seller settings page already gets this right (`normalizeWhatsAppNumber`
turned `0615551234` into `+252 615 551 234`), so reuse that at checkout.

### 4. Guest orders are matched to accounts by name alone (privacy)
`lib/order-utils.ts:148-150`: when an order has no email (email is optional at
checkout, so most guest orders), it belongs to any account whose **full name**
matches. On the live site, anyone who registers as e.g. "Mohamed Ali" would see
every email-less guest order under that name, with address and phone. The
comment above it says the opposite. *(Found in code; local mode doesn't store
orders on the server, so it couldn't be shown in the browser.)*
**Fix:** match email-less orders on the verified phone number, or not at all.

### 5. Mobile-money payment is promised but doesn't exist
At checkout, choosing EVC Plus / Zaad / eDahab says *"You'll get a payment prompt on your
phone after placing the order"* (`lib/i18n.ts:330`). No payment integration
exists for shop orders, so the confirmation just says "PAYMENT: EVC Plus" with
no instructions and no paid/unpaid status. The Help page (`app/help/page.tsx:10`)
also lists **Visa/Mastercard**, which checkout doesn't offer.
**Needed:** either integrate (e.g. WaafiPay) or, for now, show the merchant
number + amount + "dial *712*…" steps, mark orders "awaiting payment", and let
the seller tick "paid". Remove the card claim from Help.

---

## 🟠 Important: the journey breaks or confuses

### Store owner (Hodan)
6. **Order status needs a hidden "Save" click.** Changing the status dropdown
   on `/vendor/orders` does nothing until a small *Save* button is pressed.
   After a reload, the order was still "Order placed" and the customer saw no update.
   Save on change, or make the button impossible to miss.
7. **Customers must notify the shop themselves.** The confirmation page asks the
   buyer to send each shop a WhatsApp message. If they don't, the shop finds out only when it
   opens the dashboard. When a shop has no number, it falls back to
   `252610000000` (`lib/whatsapp.ts:49`) unless `NEXT_PUBLIC_SUPPORT_WHATSAPP`
   is set. **Check that this is set on the live site.**
8. **Dashboard numbers contradict each other:** "2 Orders awaiting action" next to
   KPI tiles saying 0 orders / "No orders in this period" (the tiles only count
   the last 30 days).
9. Add-product form: **Description is required but has no `*`**. The
   subcategory box showed no suggestions when typing "Kitch".
10. `/sell` says *"your store will be created instantly"*, then *"awaiting
    admin approval… within 48 hours"*. Pick one.
11. Products keep showing **"Sold 0"** after 4 kettles were sold.

### Expert shopper (Amina)
12. **Phone from registration isn't pre-filled at checkout** (name and email are).
13. **Promo code that doesn't apply still shows as applied:** `BANAADIR10` shows
    "Promo BANAADIR10 (10%) −$0" plus "isn't accepted by the shops in your
    cart". Reject it outright instead.
14. **Recommendations look random:** "Goes together" under earbuds suggests a
    football ("matches on brand and materials") and a kettle. The cart's
    "Still on your wishlist ♥ YOU SAVED" shows a TV and a phone she **never
    saved**.
15. **Trust signals clash:** "No reviews yet" sits next to "2.3k sold" and a
    4.8★ shop.
16. **Search has no synonyms:** "airpods" finds nothing, though the shop sells
    "AuraPods… Earbuds". At least suggest close matches.
17. **Track page says "Sign in to see all your orders"** while she is signed
    in, and counts "3 items" where the order says "6 items".
18. **Broken thumbnails on My account:** `CheckoutClient.tsx:437` saves the
    product's background **colour** (`#e0f2fe`) as its image, giving 400 errors.

### Intermediate shopper (Khalid)
19. **"Buy Now" goes to the cart, not checkout.** It's just *Add to cart* plus
    one extra tap, and anything already in the cart gets bought too.
20. **His guest order didn't follow him** after he registered on the same phone
    ("My orders (0)"). Offer "Create an account with these details" on the
    confirmation page, and link the order to it.
21. Product photo for "Sultan **Slim-Fit Blazer**" is a double-breasted coat
    (seed data).

### First-time shopper (Abdi, Somali)
22. **The order confirmation is entirely in English** in Somali mode ("Order
    confirmed", "NOTIFY THE STORE", "KEEP A COPY"…). This is the most important screen for
    a first-timer. Also English: the home hero, the top announcement bar,
    "Delivery is on us", order status labels ("Order Placed"), category names.
23. **"Hover to zoom · click to expand"** is shown on phones, where there is no hover.
24. The cart is called **"Dambiil"** in the bottom menu but **"Gaari"** on the
    cart page. Use one word.
25. A **double-tap on Add to cart added 2**, silently. A short "2 in your cart
    · undo" would help beginners.
26. What a beginner needed and didn't get: after "Order confirmed", **what
    happens next, in Somali, in 3 steps** (we call you → driver brings it → you
    pay), plus a big "Call/WhatsApp us" button.

---

## 🟡 Local/demo-mode only (live Supabase site not affected, or not testable here)

27. **New seller applications vanish in local mode.** `signUpSeller` writes to
    `db.stores`, but `getAllStores()` (`lib/api.ts`) only reads the seed stores,
    so the admin never sees the applicant. No login is created either, so the
    applicant gets *"Invalid email or password"*. On the live site, check what a
    **pending** seller sees when signing in; it should be "Your store is awaiting
    approval", not "invalid password".
28. New orders aren't stored on the server in local mode
    (`app/actions.ts:2719`), so they never reach the seller dashboard. For that reason,
    fulfilment was tested on seeded orders.
29. Project skill doc lists `admin@banaadirmall.com` as the demo admin; the
    actual default is `ADMIN_EMAIL` in `lib/auth.ts`.
30. Order numbers are short and sequential-looking (`BM-` + 5 digits), and
    `/track` shows items, city and the driver's phone to anyone who types one.
    Consider requiring the phone's last 4 digits.

---

## ✅ What worked well

- Registration → lands on a clear account page.
- Search, price filters, sort, colour/size swatches (accessible labels), wishlist.
- Quantity can't exceed stock on the product page; stock drops after orders.
- Multi-shop cart clearly says "2 shops — each sends its own parcel"; the order is
  split into per-shop parcels (BM-63149-HODA / -DEEQ).
- Checkout: Somali cities and districts, +252 prefix, mobile money + cash, field-level
  validation **in Somali**, delivery time changes with city (Hargeisa 2–4 days).
- **Double-tap on Place order created only one order.**
- Seller: add-product with photo, listing-quality score, low-res photo warning,
  WhatsApp number normalised, driver details on dispatch.
- **Full fulfilment loop:** Packed → On the way (driver) → Delivered showed up on the
  customer's tracker with timestamps; tracking accepts lowercase / extra spaces.
- Customers are redirected away from `/vendor` and `/admin`.

## Not covered (needs the live Supabase site)
Real payments, emails/password reset, reviews after a delivered order, the
admin approving a brand-new applicant, seller order notifications.
