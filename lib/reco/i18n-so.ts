/**
 * Somali for the recommendation rows (lib/reco/shelves.ts writes them in
 * English). Matched on the exact English text in the browser
 * (components/reco/RecoShelf.tsx), so a title the admin overrode in
 * Discovery is shown as typed, and a new English shelf simply stays
 * English until it is added here. Review with lib/i18n.ts.
 */

const EXACT: Record<string, string> = {
  // Eyebrows
  "Where you left off": "Halkii aad joogtay",
  "Price watch": "Ilaalinta qiimaha",
  Yours: "Adiga kuu gaar ah",
  "Your basket": "Dambiishaada",
  "Right now": "Hadda",
  "From your wishlist": "Kuwa aad keydisay",
  "New in": "Cusub",
  "Popular now": "Hadda la jecel yahay",
  "Something new": "Wax cusub",
  "Goes together": "Way wada socdaan",
  "Shoppers compared": "Dadku way is barbardhigeen",
  Alternatives: "Beddelaadyo",
  "This shop": "Dukaankan",
  "Your order": "Dalabkaaga",
  "Next time": "Marka xigta",
  // Titles
  "Pick up where you left off": "Ka sii wad halkii aad joogtay",
  "Cheaper than when you looked": "Way ka jaban yihiin markii aad eegtay",
  "Chosen for you": "Adiga laguu doortay",
  "Finish what you started": "Dhammee wixii aad bilowday",
  "Moving fast this week": "Si degdeg ah ayay u iibsamayaan toddobaadkan",
  "More like the things you saved": "Kuwo la mid ah waxa aad keydisay",
  "Just landed": "Hadda yimid",
  "Popular across the mall": "Kuwa ugu jecel suuqa oo dhan",
  "Worth a look": "Mudan in la eego",
  "Complete the look": "Dhammaystir muuqaalka",
  "Complete the room": "Dhammaystir qolka",
  "Completes your routine": "Dhammaystir caadadaada",
  "Goes well with it": "Si fiican ayay ula socdaan",
  "You'll want these with it": "Kuwan ayaad la rabi doontaa",
  "Shoppers also viewed": "Dadku waxay sidoo kale eegeen",
  "You may also like": "Waxaa laga yaabaa inaad jeclaato",
  "More from this shop": "Wax kale oo dukaankan ah",
  "Because of what you've been browsing": "Waxa aad eegaysay awgood",
  "Goes with what's in your basket": "Waxay la socdaan waxa dambiishaada ku jira",
  "Still on your wishlist": "Weli waa ku jiraan kuwa aad keydisay",
  "Price dropped on your saved items": "Qiimaha ayaa ka dhacay waxa aad keydisay",
  "More like what you saved": "Kuwo la mid ah waxa aad keydisay",
  "Would go with them": "Way la socon lahaayeen",
  "Goes with what you just ordered": "Waxay la socdaan waxa aad hadda dalbatay",
  "For next time": "Marka xigta",
  // Subtitles
  "Still in your basket-to-be": "Weli waxaad doonaysaa inaad iibsato",
  "Live promotions on things you'd already found": "Qiimo-dhimis hadda socda oo ku saabsan waxa aad horey u heshay",
  "Built from what you've browsed, saved and bought": "Laga sameeyay waxa aad eegtay, keydisay iyo iibsatay",
  "Goes with what's already in your basket": "Waxay la socdaan waxa horey dambiishaada ugu jiray",
  "What the mall is buying more of": "Waxa suuqu sii badanayo iibsashadiisa",
  "What shoppers are actually buying": "Waxa dadku dhab ahaan iibsanayaan",
  "Outside your usual departments, on purpose": "Qaybo aanad caadi ahaan eegin — si ula kac ah",
  "What shoppers pair it with": "Waxa dadku la iibsadaan",
  "From orders that contained the same items": "Dalabyo ay ku jireen alaab isku mid ah",
  "Add them now and they ship together": "Hadda ku dar, si wada jir ah ayaa loo soo diraa",
  "Add before it ships and it travels in the same parcel": "Ku dar ka hor inta aan la dirin, isla xirmada ayuu ku imaanayaa",
};

const PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Chosen for you, (.+)$/, (m) => `${m[1]}, adiga laguu doortay`],
  [/^More from (.+)$/, (m) => `Wax kale oo ka yimid ${m[1]}`],
  [/^Just landed at (.+)$/, (m) => `Hadda yimid ${m[1]}`],
  [/^What (.+) is buying more of$/, (m) => `Waxa ${m[1]} sii badanayso iibsashadiisa`],
  [/^Looked at by people viewing (.+)$/, (m) => `Waxa eegay dadka daawaday ${m[1]}`],
  [/^Alternatives to (.+)$/, (m) => `Beddelaadyo ${m[1]}`],
];

/** Somali for a shelf string, or the English unchanged. */
export function shelfTextSo(text: string | undefined): string | undefined {
  if (!text) return text;
  if (EXACT[text]) return EXACT[text];
  for (const [re, fn] of PATTERNS) {
    const m = text.match(re);
    if (m) return fn(m);
  }
  return text;
}

/** Card badges (RecoShelf REASON_LABELS). */
export const REASON_LABELS_SO: Record<string, string> = {
  "viewed-together": "Sidoo kale la eegay",
  viewed: "Waad eegtay",
  saved: "Waad keydisay",
  "in-cart": "Dambiishaada",
  "bought-together": "Wada iibsi",
  similar: "La mid ah",
  completes: "La socda",
  store: "Isla dukaan",
  brand: "Isla summad",
  rising: "Kor u kacaya",
  "price-fit": "Miisaaniyaddaada",
  new: "Cusub",
  popular: "Caan ah",
  discover: "Soo hel",
  "price-drop": "Qiimo dhacay",
};
