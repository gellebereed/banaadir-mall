/**
 * ─────────────────────────────────────────────────────────────────────────
 *  LANGUAGE — English and Somali (af-Soomaali) for the shopping pages.
 * ─────────────────────────────────────────────────────────────────────────
 * The choice lives in the `bm-lang` cookie, so the server renders the
 * right language on the first byte (no flash of English). Server
 * components call `translate(await getLang(), key)` (lib/prefs-server.ts);
 * client components call `useT()` (components/prefs/PrefsProvider.tsx).
 *
 * What is translated: the shop's own words — navigation, buttons, section
 * headings, labels. What is not: what people wrote — product names and
 * descriptions, store names, and the admin's own marketing text — which
 * stay exactly as entered.
 *
 * The Somali here was written for this site and should be read by a native
 * speaker before it is promoted; every string is in this one file so that
 * review is a single pass.
 *
 * Shared by server and client, so nothing server-only may be imported.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type Lang = "en" | "so";
export const LANG_COOKIE = "bm-lang";
export const LITE_COOKIE = "bm-lite";

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "so";
}

const M = {
  // ── Header & navigation ───────────────────────────────────────────────
  "nav.search": { en: "Search products, brands and stores...", so: "Raadi alaab, summado iyo dukaamo..." },
  "nav.search.button": { en: "Search", so: "Raadi" },
  "nav.dailyDeals": { en: "⚡ Daily Deals", so: "⚡ Qiimo-dhimis Maanta" },
  "nav.signIn": { en: "Sign in", so: "Soo gal" },
  "nav.signUp": { en: "Sign up", so: "Isdiiwaangeli" },
  "nav.wishlist": { en: "Wishlist", so: "Waxa aan keydiyay" },
  "nav.cart": { en: "Cart", so: "Dambiil" },
  "nav.openMenu": { en: "Open menu", so: "Fur liiska" },
  "nav.allDepartments": { en: "All departments", so: "Dhammaan qaybaha" },
  "nav.allProducts": { en: "All Products", so: "Dhammaan alaabta" },
  "nav.allStores": { en: "All Stores", so: "Dhammaan dukaamada" },
  "nav.sell": { en: "Sell on Banaadir", so: "Ka iibi Banaadir" },
  "nav.browseStores": { en: "Browse Stores", so: "Eeg dukaamada" },
  "nav.allOf": { en: "All of {name} →", so: "Dhammaan {name} →" },
  "tab.home": { en: "Home", so: "Hoyga" },
  "tab.shop": { en: "Shop", so: "Suuq" },
  "tab.cart": { en: "Cart", so: "Dambiil" },
  "tab.saved": { en: "Saved", so: "Keydsan" },
  "tab.account": { en: "Account", so: "Akoon" },

  // ── Preferences ───────────────────────────────────────────────────────
  "pref.language": { en: "Language", so: "Luqadda" },
  "pref.lite": { en: "Light data mode", so: "Habka xog yar" },
  "pref.lite.on": { en: "On — smaller photos, no autoplay", so: "Shidan — sawirro yar, ma isbeddelaan" },
  "pref.lite.off": { en: "Off", so: "Dansan" },

  // ── Delivery ──────────────────────────────────────────────────────────
  "delivery.to": { en: "Deliver to {city}", so: "U geeya {city}" },
  "delivery.toLabel": { en: "Deliver to", so: "U geeya" },
  "delivery.time": { en: "Delivery: {time}", so: "Keenis: {time}" },
  "delivery.search": { en: "Search cities", so: "Raadi magaalo" },
  "delivery.choose": { en: "Where should we deliver?", so: "Halkee loo keenaa?" },
  "delivery.chooseHint": {
    en: "We'll show delivery times for this city and fill it in at checkout.",
    so: "Waxaan kuu tusi doonnaa waqtiga keenista magaaladan, waxaana lagu buuxin doonaa marka aad lacag bixinayso.",
  },
  "delivery.close": { en: "Close", so: "Xir" },

  // ── WhatsApp & install ────────────────────────────────────────────────
  "help.whatsapp": { en: "Questions? Chat with us on WhatsApp", so: "Su'aal ma qabtaa? Nagala soo xiriir WhatsApp" },
  "help.whatsapp.message": { en: "Hello Banaadir Mall, I have a question", so: "Salaan Banaadir Mall, su'aal ayaan qabaa" },
  "help.whatsapp.about": { en: "about: {page}", so: "ku saabsan: {page}" },
  "install.title": { en: "Get the Banaadir Mall app", so: "Soo dego app-ka Banaadir Mall" },
  "install.text": { en: "Opens from your home screen, faster on mobile data.", so: "Ka fur shaashaddaada hore, wuuna ka dheereeyaa xogta mobile-ka." },
  "install.button": { en: "Install", so: "Ku rakib" },
  "install.ios": { en: "Tap Share ⬆️ then “Add to Home Screen”.", so: "Riix Share ⬆️ kadibna “Add to Home Screen”." },
  "install.dismiss": { en: "Not now", so: "Hadda maya" },

  // ── Home page ─────────────────────────────────────────────────────────
  "home.startShopping": { en: "Start Shopping", so: "Bilow Iibsashada" },
  "home.welcome": { en: "Welcome back, {name} 👋", so: "Ku soo dhowow, {name} 👋" },
  "home.order.pending": { en: "Order #{id} has been received — track it", so: "Dalabka #{id} waa la helay — la soco" },
  "home.order.processing": { en: "Order #{id} is being prepared — track it", so: "Dalabka #{id} waa la diyaarinayaa — la soco" },
  "home.order.shipped": { en: "Order #{id} is on the way — track it", so: "Dalabka #{id} waa soo socdaa — la soco" },
  "home.yourAccount": { en: "Your orders & saved items →", so: "Dalabyadaada iyo waxa aad keydisay →" },
  "trust.freeOver": { en: "Free delivery over {amount}", so: "Keenis bilaash ah wixii ka badan {amount}" },
  "trust.delivery": { en: "Delivery {estimate}", so: "Keenis {estimate}" },
  "trust.fast": { en: "Fast delivery", so: "Keenis degdeg ah" },
  "trust.cod": { en: "Cash on delivery", so: "Lacagta bixi marka laguu keeno" },
  "trust.returns": { en: "7-day returns", so: "Celin 7 maalmood gudahood" },
  "trust.local": { en: "Trusted Somali stores", so: "Dukaamo Soomaaliyeed oo la aamini karo" },
  "quick.new": { en: "New In", so: "Cusub" },
  "quick.best": { en: "Best Sellers", so: "Ugu iibsi badan" },
  "quick.deals": { en: "Daily Deals", so: "Qiimo-dhimis" },
  "quick.savings": { en: "Big Savings", so: "Qiimo jaban" },
  "quick.stores": { en: "All Stores", so: "Dukaamada" },
  "quick.hot": { en: "Hot", so: "Kulul" },
  "section.viewAll": { en: "View all", so: "Eeg dhammaan" },
  "section.brands": { en: "Official Brand Stores", so: "Dukaamada Summadaha Rasmiga ah" },
  "section.brands.sub": {
    en: "World-famous brands, franchised exclusively by Banaadir Mall",
    so: "Summado caalami ah oo si gaar ah ugu jira Banaadir Mall",
  },
  "section.flash": { en: "Flash Deals", so: "Qiimo-dhimis Degdeg ah" },
  "section.flash.all": { en: "See all deals →", so: "Eeg dhammaan →" },
  "section.endsIn": { en: "Ends in", so: "Wuxuu dhammaanayaa" },
  "section.trending": { en: "Trending Now", so: "Hadda La Jecel Yahay" },
  "section.trending.sub": { en: "What everyone is buying this week", so: "Waxa dadku iibsanayaan toddobaadkan" },
  "section.budget": { en: "Shop by budget", so: "Ku iibso miisaaniyaddaada" },
  "section.budget.sub": { en: "Best sellers at every price", so: "Kuwa ugu iibsiga badan qiimo kasta" },
  "section.budget.under": { en: "Under {amount}", so: "Ka hooseeya {amount}" },
  "section.budget.all": { en: "See everything under {amount}", so: "Eeg wax walba oo ka hooseeya {amount}" },
  "section.stores": { en: "Featured Stores", so: "Dukaamo La Xushay" },
  "section.stores.sub": { en: "Trusted sellers with top ratings", so: "Iibiyeyaal la aamini karo oo qiimeyn sare leh" },
  "section.new": { en: "Just Landed", so: "Hadda Yimid" },
  "section.new.sub": { en: "Fresh finds from our stores", so: "Alaab cusub oo dukaamadu keeneen" },
  "section.campaigns": { en: "Today's Campaigns", so: "Ololayaasha Maanta" },
  "section.campaigns.sub": { en: "Handpicked offers across the mall", so: "Dalabyo la xushay oo suuqa oo dhan ah" },
  "brand.shopNow": { en: "Shop now →", so: "Iibso →" },
  "deal.label": { en: "Deal of the day", so: "Dalabka Maanta" },
  "deal.shop": { en: "Shop the deal", so: "Iibso hadda" },
  "deal.left": { en: "Only {n} left", so: "{n} kaliya ayaa haray" },
  "reco.why": { en: "Why these?", so: "Maxay kuwan yihiin?" },
  "reco.hideWhy": { en: "Hide", so: "Qari" },

  // ── Product cards & product page ──────────────────────────────────────
  "product.sold": { en: "{n} sold", so: "{n} la iibiyay" },
  "product.sizes": { en: "{n} sizes", so: "{n} cabbir" },
  "product.add": { en: "Add to cart", so: "Ku dar dambiisha" },
  "product.addToCart": { en: "Add to Cart", so: "Ku dar dambiisha" },
  "product.added": { en: "✓ Added to Cart", so: "✓ Waa lagu daray" },
  "product.buyNow": { en: "Buy Now", so: "Iibso Hadda" },
  "product.soldOut": { en: "Out of Stock", so: "Waa dhammaaday" },
  "product.soldOutOption": { en: "Out of stock in this option", so: "Kan hadda lama hayo" },
  "product.lowStock": { en: "🔥 Only {n} left — order soon", so: "🔥 {n} kaliya ayaa haray — dhakhso u dalbo" },
  "product.inStock": { en: "✓ In stock ({n} available)", so: "✓ Waa diyaar ({n} ayaa jira)" },
  "product.colour": { en: "Colour", so: "Midab" },
  "product.size": { en: "Size", so: "Cabbir" },
  "product.save": { en: "Save {pct}%", so: "Badbaadi {pct}%" },
  "product.noReviews": { en: "No reviews yet", so: "Weli faallo ma jirto" },
  "product.share": { en: "Share this product", so: "La wadaag alaabtan" },
  "product.wishAdd": { en: "Add to wishlist", so: "Ku keydi" },
  "product.wishRemove": { en: "Remove from wishlist", so: "Ka saar kuwa la keydiyay" },
  "product.from": { en: "from", so: "laga bilaabo" },
  "product.options": { en: "Options", so: "Doorashooyin" },
  "product.outOfStock": { en: "Out of stock", so: "Waa dhammaaday" },
  "badge.New": { en: "New", so: "Cusub" },
  "badge.Bestseller": { en: "Bestseller", so: "Ugu iibsi badan" },
  "badge.Sale": { en: "Sale", so: "Qiimo-dhimis" },
  "badge.Hot": { en: "Hot", so: "Kulul" },
  "share.title": { en: "Share", so: "La wadaag" },
  "share.copy": { en: "Copy link", so: "Koobiyee linkiga" },
  "share.copied": { en: "✓ Link copied", so: "✓ Waa la koobiyeeyay" },
  "share.store": { en: "Share this store", so: "La wadaag dukaankan" },

  // ── Product list (components/shop/ShopClient) ─────────────────────────
  "shop.allProducts.sub": { en: "Everything on Banaadir Mall, from every store", so: "Wax walba oo Banaadir Mall ku jira, dukaan kasta" },
  "shop.count": { en: "{n} products", so: "{n} alaab" },
  "shop.count.one": { en: "1 product", so: "1 alaab" },
  "shop.showing": { en: "Showing {shown} of {total}", so: "Waxaa la muujiyay {shown} ka mid ah {total}" },
  "shop.filters": { en: "Filters", so: "Shaandheyn" },
  "shop.sort": { en: "Sort", so: "Kala saar" },
  "shop.sortBy": { en: "Sort by", so: "Ku kala saar" },
  "shop.clearAll": { en: "Clear all", so: "Tirtir dhammaan" },
  "shop.showResults": { en: "Show {n} products", so: "Tus {n} alaab" },
  "shop.showResults.one": { en: "Show 1 product", so: "Tus 1 alaab" },
  "shop.noResults": { en: "No products match these filters", so: "Wax alaab ah oo ku habboon shaandheyntan ma jiro" },
  "shop.noResults.hint": { en: "Try removing a filter:", so: "Isku day inaad ka saarto shaandheyn:" },
  "shop.end": { en: "You've seen all {n} products", so: "Waad aragtay dhammaan {n} alaab" },
  "shop.loading": { en: "Loading more…", so: "Waxaa soo dhacaya kuwo kale…" },
  "shop.loadMore": { en: "Show more", so: "Tus kuwo kale" },
  "shop.tuned": { en: "✨ tuned to you", so: "✨ adiga loo habeeyay" },
  "shop.view": { en: "View", so: "Muuqaal" },
  "shop.showAll": { en: "Show all {n}", so: "Tus dhammaan {n}" },
  "shop.showFewer": { en: "Show fewer", so: "Tus wax yar" },
  "shop.searchIn": { en: "Search {label}…", so: "Raadi {label}…" },
  "shop.f.category": { en: "Category", so: "Qayb" },
  "shop.f.store": { en: "Brand / Store", so: "Summad / Dukaan" },
  "shop.f.price": { en: "Price", so: "Qiimo" },
  "shop.f.rating": { en: "Customer rating", so: "Qiimeynta macaamiisha" },
  "shop.f.deals": { en: "Deals", so: "Dalabyo" },
  "shop.f.sale": { en: "On sale", so: "Qiimo-dhimis" },
  "shop.f.inStock": { en: "In stock", so: "Diyaar ah" },
  "shop.f.min": { en: "Min", so: "Ugu yar" },
  "shop.f.max": { en: "Max", so: "Ugu badan" },
  "shop.f.apply": { en: "Go", so: "Tag" },
  "shop.f.under": { en: "Under {amount}", so: "Ka hooseeya {amount}" },
  "shop.f.range": { en: "{min} – {max}", so: "{min} – {max}" },
  "shop.f.from": { en: "From {min}", so: "Laga bilaabo {min}" },
  "shop.f.upTo": { en: "Up to {max}", so: "Ilaa {max}" },
  "shop.f.stars": { en: "{n}★ & up", so: "{n}★ iyo ka badan" },
  "shop.f.in": { en: "in {name}", so: "gudaha {name}" },
  "shop.f.brand": { en: "BRAND", so: "SUMMAD" },
  "shop.sort.featured": { en: "Featured", so: "La soo xulay" },
  "shop.sort.sold": { en: "Best selling", so: "Ugu iibsi badan" },
  "shop.sort.price-asc": { en: "Price: low to high", so: "Qiimo: hoose ilaa sare" },
  "shop.sort.price-desc": { en: "Price: high to low", so: "Qiimo: sare ilaa hoose" },
  "shop.sort.rating": { en: "Top rated", so: "Qiimeynta ugu sareysa" },
  "shop.sort.discount": { en: "Biggest discount", so: "Qiimo-dhimista ugu weyn" },
  "shop.sort.new": { en: "Newest", so: "Ugu cusub" },
  "shop.chips.all": { en: "All", so: "Dhammaan" },

  // ── Footer ────────────────────────────────────────────────────────────
  "footer.tagline": {
    en: "Somalia's online marketplace. Trusted local stores, honest prices, delivered to your door.",
    so: "Suuqa online-ka ee Soomaaliya. Dukaamo maxalli ah oo la aamini karo, qiimo daacad ah, laguugu keeno albaabka.",
  },
  "footer.newsletter": { en: "Email for deals & updates", so: "Iimayl si aad u hesho dalabyada" },
  "footer.join": { en: "Join", so: "Ku biir" },
  "footer.shop": { en: "Shop", so: "Iibso" },
  "footer.sell": { en: "Sell", so: "Iibi" },
  "footer.help": { en: "Help", so: "Caawimaad" },
  "footer.flash": { en: "Flash Deals", so: "Qiimo-dhimis Degdeg ah" },
  "footer.bestsellers": { en: "Bestsellers", so: "Ugu iibsi badan" },
  "footer.openStore": { en: "Open a Store", so: "Fur dukaan" },
  "footer.sellerSignIn": { en: "Seller Sign In", so: "Galitaanka iibiyaha" },
  "footer.track": { en: "Track My Order", so: "La soco dalabkayga" },
  "footer.faq": { en: "FAQ & Contact", so: "Su'aalaha & La xiriir" },
  "footer.myAccount": { en: "My Account", so: "Akoonkayga" },
  "footer.rights": { en: "All rights reserved.", so: "Xuquuqda oo dhan way dhowran tahay." },
  "footer.sellBand.title": { en: "Have products to sell?", so: "Alaab ma haysaa aad iibiso?" },
  "footer.sellBand.text": {
    en: "Free to start · your own dashboard · paid to your mobile money",
    so: "Bilaash ku bilow · dashboard kuu gaar ah · lacagta waxaa loo diraa mobile-kaaga",
  },
  "footer.sellBand.cta": { en: "Open your store", so: "Fur dukaankaaga" },
} satisfies Record<string, { en: string; so: string }>;

export type MessageKey = keyof typeof M;

/** The message in `lang`, with {placeholders} filled in. */
export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  const entry = M[key];
  let text: string = entry ? entry[lang] ?? entry.en : key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

/** A translator bound to one language. */
export function translator(lang: Lang) {
  return (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
}
export type T = ReturnType<typeof translator>;
