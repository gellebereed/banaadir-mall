/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE IMPORT SCHEMA — the columns this system understands.
 * ─────────────────────────────────────────────────────────────────────────
 * One list, three jobs:
 *
 *   1. the wizard's "columns we need" panel,
 *   2. auto-detection of the supplier's headers,
 *   3. the downloadable sample template.
 *
 * Keeping them from drifting apart is the whole point of the file. Add a
 * field here and it appears in all three.
 *
 * ── What is actually required ────────────────────────────────────────────
 * Two things: a quantity, because a catalogue entry with no stock is not
 * sellable, and SOME identity — a barcode, a product code, or a variant
 * code. Any one of the three is enough.
 *
 * That last part used to read "barcode AND product code", which was written
 * against a fashion invoice where both always exist. It does not survive
 * contact with the rest of retail. A kitchenware export out of Odoo carries
 * an Internal Reference and a barcode per LINE, with no style code grouping
 * anything — every row is already its own product. Demanding a separate
 * product code there blocks an import that has everything it needs, so the
 * requirement is now a group: fill any identity column and the file passes.
 *
 * Everything else improves the result and none of it blocks the import.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type FieldKey =
  | "itemCode"
  | "variantCode"
  | "barcode"
  | "name"
  | "description"
  | "colorCode"
  | "colorName"
  | "size"
  | "drop"
  | "qty"
  | "cost"
  | "price"
  | "category"
  | "family"
  | "productType"
  | "brand"
  | "line"
  | "season"
  | "composition"
  | "gender"
  | "hsCode"
  | "invoiceNo"
  | "date";

/** What a column contributes, which is how the wizard groups them. */
export type FieldRole = "identity" | "variant" | "product" | "commercial" | "reference";

export interface ImportField {
  key: FieldKey;
  label: string;
  role: FieldRole;
  required: boolean;
  /** What the importer does with it — shown under the label in the wizard. */
  hint: string;
  /** Header texts that mean this field, normalised the same way as input. */
  synonyms: string[];
  /** The Odoo field this ends up in, where there is one. */
  odoo?: string;
  /** Example values for the downloadable template. */
  examples: [string, string, string];
}

export const IMPORT_FIELDS: ImportField[] = [
  // ── Identity ─────────────────────────────────────────────────────────
  {
    key: "itemCode",
    label: "Product code",
    role: "identity",
    required: false,
    hint: "The style code shared by every colour and size. This is what groups rows into one product. Left blank, each row is its own product.",
    synonyms: [
      "ITEM", "ITEM CODE", "ITEM NO", "PRODUCT CODE", "STYLE", "STYLE CODE",
      "MODEL", "MODEL CODE", "TEMPLATE", "TEMPLATE CODE", "ARTICLE", "ARTICLE CODE",
      "URUN KODU", "MODEL KODU", "STOK KODU",
      // Odoo's own name for default_code, in the languages its exports ship in.
      "INTERNAL REFERENCE", "INTERNAL REF", "DEFAULT CODE", "PRODUCT REFERENCE",
      "REFERENCE INTERNE", "REFERENCIA INTERNA", "STOK KODU REF",
    ],
    odoo: "product.template.default_code",
    examples: ["4A2021200056", "4A2021200056", "YDA222520013"],
  },
  {
    key: "variantCode",
    label: "Variant code",
    role: "identity",
    required: false,
    hint: "The full code for one colour+size. Left blank, it is built from the product code, colour and size.",
    synonyms: [
      "LONG CODE", "LONGCODE", "VARIANT CODE", "FULL CODE", "SKU", "SKU CODE",
      "UNIQUE CODE", "VARYANT KODU", "BARKOD KODU",
    ],
    odoo: "product.product.default_code",
    examples: ["4A2021200056ATRM", "4A2021200056ATRL", "YDA222520013SYH45"],
  },
  {
    key: "barcode",
    label: "Barcode",
    role: "identity",
    required: false,
    hint: "EAN-13, UPC or the supplier's own code. Must be unique — this is what a scanner reads, and what makes a re-import update instead of duplicate.",
    synonyms: ["BARCODE", "BAR CODE", "EAN", "EAN13", "EAN 13", "GTIN", "UPC", "BARKOD"],
    odoo: "product.product.barcode",
    examples: ["2850001793832", "2850001793849", "8684310729862"],
  },

  // ── Variant axes ─────────────────────────────────────────────────────
  {
    key: "colorName",
    label: "Colour",
    role: "variant",
    required: false,
    hint: "Shown to the customer as a swatch. English names are matched to a colour automatically.",
    synonyms: [
      "COLOR DESCRIPTION", "COLOUR DESCRIPTION", "COLOR NAME", "COLOUR NAME",
      "COLOR", "COLOUR", "RENK", "RENK ACIKLAMA",
    ],
    odoo: "product.product attribute value",
    examples: ["ANTHRACITE", "ANTHRACITE", "BLACK"],
  },
  {
    key: "colorCode",
    label: "Colour code",
    role: "variant",
    required: false,
    hint: "The supplier's short code (ATR, SYH). Used to build the variant code and to spot the same colour spelt two ways.",
    synonyms: ["COLOR CODE", "COLOUR CODE", "RENK KODU", "COLORCODE"],
    examples: ["ATR", "ATR", "SYH"],
  },
  {
    key: "size",
    label: "Size",
    role: "variant",
    required: false,
    hint: "S/M/L or a number. Sorted into wearing order rather than alphabetically.",
    synonyms: ["SIZE", "SIZES", "BEDEN", "NUMARA", "CABBIR"],
    odoo: "product.product attribute value",
    examples: ["M", "L", "45"],
  },
  {
    key: "drop",
    label: "Drop",
    role: "variant",
    required: false,
    hint: "Suit and jacket drop (6N, 4N). Shown alongside the size — never treated as a separate size.",
    synonyms: ["DROP", "DROP CODE", "BEDEN DROP"],
    examples: ["", "", ""],
  },

  // ── Commercial ───────────────────────────────────────────────────────
  {
    key: "qty",
    label: "Quantity",
    role: "commercial",
    required: true,
    hint: "Units of this exact colour+size. Rows repeating the same barcode are added together.",
    synonyms: [
      "QTY", "QUANTITY", "PCS", "PIECES", "UNITS", "STOCK", "ADET", "MIKTAR",
      // Odoo stock exports.
      "QUANTITY ON HAND", "QTY ON HAND", "ON HAND", "ON HAND QUANTITY",
      "STOCK ON HAND", "QUANTITY AVAILABLE", "QTY AVAILABLE", "AVAILABLE QUANTITY",
    ],
    odoo: "qty_available",
    examples: ["1", "3", "2"],
  },
  {
    key: "cost",
    label: "Cost price",
    role: "commercial",
    required: false,
    hint: "What you paid per unit. Never shown to customers — the selling price is calculated from it using your markup.",
    synonyms: [
      "PRICE", "UNIT PRICE", "COST", "COST PRICE", "BUY PRICE", "PURCHASE PRICE",
      "FOB", "FOB PRICE", "BIRIM FIYAT", "ALIS FIYATI", "MALIYET",
    ],
    odoo: "standard_price",
    examples: ["9.66", "9.66", "48.83"],
  },
  {
    key: "price",
    label: "Selling price",
    role: "commercial",
    required: false,
    hint: "Your retail price, if the file already has one. Supplied here, it wins over the markup calculation.",
    synonyms: [
      "SELLING PRICE", "SALE PRICE", "SALES PRICE", "SELL PRICE", "RETAIL PRICE",
      "LIST PRICE", "PUBLIC PRICE", "RRP", "MSRP",
      "SATIS FIYATI", "PERAKENDE FIYAT",
    ],
    odoo: "list_price",
    examples: ["", "", ""],
  },

  // ── Product-level description ────────────────────────────────────────
  {
    key: "name",
    label: "Product name",
    role: "product",
    required: false,
    hint: "The title customers see. Left blank, it is built from the brand and product type.",
    synonyms: ["NAME", "PRODUCT NAME", "TITLE", "PRODUCT TITLE", "URUN ADI", "ITEM NAME"],
    odoo: "product.template.name",
    examples: ["", "", ""],
  },
  {
    key: "description",
    label: "Description",
    role: "product",
    required: false,
    /*
     * Deliberately NOT synonymous with a bare "DESCRIPTION" — in the fashion
     * exports this importer was built against, that header is the sub-group
     * ("SHIRT", "SHOES"), and stealing it would file every garment under a
     * category called by its own sales copy. Only the unambiguous spellings
     * are claimed here; a bare "DESCRIPTION" still goes to Sub-group, and a
     * seller can always reassign it by hand.
     */
    hint: "The supplier's own sales copy. Used as the product description when present, instead of the generated one.",
    synonyms: [
      "PRODUCT DESCRIPTION", "SALES DESCRIPTION", "LONG DESCRIPTION",
      "ITEM DESCRIPTION", "DESCRIPTION SALE", "URUN ACIKLAMASI",
    ],
    odoo: "description_sale",
    examples: ["", "", ""],
  },
  {
    key: "category",
    label: "Category",
    role: "product",
    required: false,
    hint: "Becomes a category under your chosen parent, creating it if it does not exist yet.",
    synonyms: [
      "CATEGORY", "CATEGORIES", "MAIN CATEGORY", "KATEGORI", "GRUP",
      "PRODUCT CATEGORY", "INTERNAL CATEGORY", "POS CATEGORY", "CATEG",
    ],
    odoo: "product.category",
    examples: ["SHIRT", "SHIRT", "SHOES"],
  },
  {
    key: "family",
    label: "Sub-group",
    role: "product",
    required: false,
    hint: "A finer grouping than the category. Used to split mixed categories — ceremony shoes belong under shoes, not ceremony.",
    synonyms: [
      "DESCRIPTION", "SUB CATEGORY", "SUBCATEGORY", "SUB GROUP", "SUBGROUP",
      "GROUP", "FAMILY", "ALT GRUP",
    ],
    examples: ["SHIRT", "SHIRT", "SHOES"],
  },
  {
    key: "productType",
    label: "Product type",
    role: "product",
    required: false,
    hint: "The specific model (Dobby Shirt, Casual Shoes). Used in the product name and as the subcategory shoppers filter by.",
    synonyms: [
      "PRODUCT TYPE 2", "PRODUCT TYPE", "PRODUCTTYPE", "TYPE", "MODEL NAME",
      "STYLE NAME", "URUN TIPI", "URUN TURU",
    ],
    examples: ["DOBBY SHIRT", "DOBBY SHIRT", "CASUAL SHOES"],
  },
  {
    key: "brand",
    label: "Brand",
    role: "product",
    required: false,
    hint: "Shown in the product name and kept for filtering.",
    synonyms: ["BRAND", "BRAND NAME", "MARKA", "MAKER", "MANUFACTURER"],
    examples: ["AC&CO", "AC&CO", "ALTINYILDIZ CLASSICS"],
  },
  {
    key: "composition",
    label: "Composition",
    role: "product",
    required: false,
    hint: "Fabric make-up. Becomes a feature bullet on the product page.",
    synonyms: [
      "COMPOSITION DESCRIPTION", "COMPOSITION", "FABRIC", "MATERIAL", "CONTENT",
      "KOMPOZISYON", "KUMAS", "ICERIK",
    ],
    examples: ["%100 Cotton", "%100 Cotton", "%100 NUBUK"],
  },
  {
    key: "season",
    label: "Season",
    role: "product",
    required: false,
    hint: "Kept as a feature and used to mark this season's arrivals as New.",
    synonyms: ["SEASON", "SEZON", "COLLECTION SEASON"],
    examples: ["2026 SUMMER", "2026 SUMMER", "2025 SUMMER"],
  },
  {
    key: "line",
    label: "Product line",
    role: "product",
    required: false,
    hint: "The sub-brand or range. Kept for reference.",
    synonyms: ["LINE", "PRODUCT LINE", "COLLECTION", "SUB BRAND", "SUBBRAND", "SERI"],
    examples: ["AC&CO", "AC&CO", "AC&CO"],
  },
  {
    key: "gender",
    label: "Gender / department",
    role: "product",
    required: false,
    hint: "Men, Women, Kids. Used to pick the parent category when you have not chosen one.",
    synonyms: ["GENDER", "GENDER DEPARTMENT", "DEPARTMENT", "SEX", "CINSIYET", "BOLUM"],
    examples: ["MEN", "MEN", "MEN"],
  },

  // ── Reference only ───────────────────────────────────────────────────
  {
    key: "hsCode",
    label: "HS code",
    role: "reference",
    required: false,
    hint: "Customs tariff code. Stored with the product but never shown to customers.",
    synonyms: ["HS CODE", "HSCODE", "TARIFF", "TARIFF CODE", "GTIP", "CUSTOMS CODE"],
    examples: ["620520000018", "620520000018", "640399930000"],
  },
  {
    key: "invoiceNo",
    label: "Invoice number",
    role: "reference",
    required: false,
    hint: "Recorded against the stock this import adds, so a shipment can be traced later.",
    /*
     * "REFERENCE" used to sit in this list, which meant Odoo's "Internal
     * Reference" — the product's own code — was read as a shipment number
     * and the product code was left unmapped, blocking the whole import.
     * Only invoice-specific spellings belong here.
     */
    synonyms: [
      "INVOICE NR", "INVOICE NO", "INVOICE", "INVOICE NUMBER",
      "INVOICE REFERENCE", "SHIPMENT NO", "FATURA NO",
    ],
    examples: ["IHR2026000000033", "IHR2026000000033", "IHR2026000000033"],
  },
  {
    key: "date",
    label: "Invoice date",
    role: "reference",
    required: false,
    hint: "Recorded with the shipment.",
    synonyms: ["DATE", "INVOICE DATE", "DOC DATE", "TARIH", "FATURA TARIHI"],
    examples: ["2026-06-11", "2026-06-11", "2026-06-11"],
  },
];

export const FIELDS_BY_KEY: Record<FieldKey, ImportField> = Object.fromEntries(
  IMPORT_FIELDS.map((field) => [field.key, field]),
) as Record<FieldKey, ImportField>;

export const REQUIRED_FIELDS: FieldKey[] = IMPORT_FIELDS.filter((f) => f.required).map(
  (f) => f.key,
);

export const ROLE_LABELS: Record<FieldRole, string> = {
  identity: "Identity",
  variant: "Colour & size",
  commercial: "Stock & price",
  product: "Product details",
  reference: "Reference only",
};

/** header label → column index, or undefined when the field is unmapped. */
export type ColumnMapping = Partial<Record<FieldKey, number>>;

// ── Auto-detection ───────────────────────────────────────────────────────

/**
 * Reduce a header to something comparable with a synonym.
 *
 * Suppliers number their columns ("1.GENDER", "3.PRODUCT TYPE 2") and vary
 * punctuation and accents freely. Stripping all of it means one synonym
 * covers "COLOR CODE", "color_code" and "Colour Code" alike.
 */
export function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // Turkish dotless/dotted i survive NFD, so map them explicitly.
    .replace(/[ıİ]/g, "I")
    .replace(/[şŞ]/g, "S")
    .replace(/[ğĞ]/g, "G")
    .replace(/[çÇ]/g, "C")
    .replace(/[üÜ]/g, "U")
    .replace(/[öÖ]/g, "O")
    .toUpperCase()
    // Leading "3." column numbering is ordering, not meaning.
    .replace(/^\s*\d+\s*[.)-]\s*/, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * The forms of a header worth matching against a synonym.
 *
 * Odoo exports a related model's field as "Products/Barcode",
 * "Products/Product Category" — the relation, a slash, then the field. The
 * relation part carries no meaning for us and stops "BARCODE" matching
 * exactly, so the segment after the last slash is offered as an
 * alternative. The full header is still offered first, because a header
 * that genuinely contains a slash ("S/M") must not be truncated to
 * something that happens to match.
 */
function headerVariants(header: string): string[] {
  const full = normalizeHeader(header);
  if (!header.includes("/")) return [full];

  const tail = normalizeHeader(header.slice(header.lastIndexOf("/") + 1));
  if (!tail || tail === full) return [full];
  return [full, tail];
}

/** Does this header name a *code* column rather than a value column? */
function isCodeHeader(normalized: string): boolean {
  return /\bCODE\b/.test(normalized) || /\bKODU?\b/.test(normalized);
}

/**
 * Score how well a header matches a field. 0 means no match.
 *
 * The scale matters more than the numbers: an exact synonym must always
 * beat a partial one, or "3.PRODUCT TYPE 2 CODE" wins the Product type
 * slot over the plain "3.PRODUCT TYPE 2" sitting right next to it and the
 * catalogue fills with names like "GM20".
 */
function scoreHeader(header: string, field: ImportField): number {
  return Math.max(...headerVariants(header).map((form) => scoreForm(form, field)));
}

function scoreForm(normalized: string, field: ImportField): number {
  if (!normalized) return 0;

  const synonyms = field.synonyms.map(normalizeHeader);
  const fieldWantsCode = /code/i.test(field.key) || field.key === "barcode";

  // A "… CODE" column can only fill a field that is itself a code.
  if (isCodeHeader(normalized) && !fieldWantsCode) {
    const exactCodeSynonym = synonyms.includes(normalized);
    if (!exactCodeSynonym) return 0;
  }

  if (synonyms.includes(normalized)) return 100;

  // Whole-phrase containment, longer synonyms first so "PRODUCT TYPE 2"
  // outranks "TYPE".
  for (const synonym of synonyms.slice().sort((a, b) => b.length - a.length)) {
    if (!synonym) continue;
    if (normalized === synonym) return 100;
    if (normalized.startsWith(synonym + " ") || normalized.endsWith(" " + synonym)) {
      return 70 + Math.min(synonym.length, 20);
    }
    if (normalized.includes(synonym)) return 40 + Math.min(synonym.length, 20);
  }

  return 0;
}

/**
 * Best-guess mapping from the file's headers to our fields.
 *
 * Greedy over every (field, column) pair by score, so the strongest match
 * claims its column first and nothing is assigned twice. The wizard shows
 * the result for confirmation — this only has to be right often enough
 * that confirming is quicker than mapping by hand.
 */
export function detectMapping(headers: string[]): ColumnMapping {
  const candidates: { field: FieldKey; column: number; score: number }[] = [];

  for (const field of IMPORT_FIELDS) {
    headers.forEach((header, column) => {
      const score = scoreHeader(header, field);
      if (score > 0) candidates.push({ field: field.key, column, score });
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  const mapping: ColumnMapping = {};
  const usedColumns = new Set<number>();
  for (const candidate of candidates) {
    if (mapping[candidate.field] !== undefined) continue;
    if (usedColumns.has(candidate.column)) continue;
    mapping[candidate.field] = candidate.column;
    usedColumns.add(candidate.column);
  }

  return mapping;
}

/** Required fields the mapping still leaves unfilled. */
export function missingRequired(mapping: ColumnMapping): ImportField[] {
  return IMPORT_FIELDS.filter((field) => field.required && mapping[field.key] === undefined);
}

/** Any one of these identifies a row well enough to import it. */
export const IDENTITY_FIELDS: FieldKey[] = ["barcode", "itemCode", "variantCode"];

/**
 * Everything still standing between this mapping and an import, phrased for
 * the person looking at the wizard. Empty means good to go.
 *
 * This is the real gate — `missingRequired` only covers fields that are
 * required on their own, and identity is required as a GROUP.
 */
export function mappingProblems(mapping: ColumnMapping): string[] {
  const problems = missingRequired(mapping).map((field) => field.label);

  if (IDENTITY_FIELDS.every((key) => mapping[key] === undefined)) {
    problems.push("a Barcode or Product code column — either one is enough");
  }

  return problems;
}

// ── Sample template ──────────────────────────────────────────────────────

/**
 * The template a seller downloads to see the shape we expect. Required
 * columns come first; every column carries three real example rows, so the
 * file doubles as documentation of the format.
 */
export function templateRows(): string[][] {
  const ordered = [
    ...IMPORT_FIELDS.filter((f) => f.required),
    ...IMPORT_FIELDS.filter((f) => !f.required),
  ];

  const header = ordered.map((f) => (f.required ? `${f.label} *` : f.label));
  const examples = [0, 1, 2].map((i) => ordered.map((f) => f.examples[i]));

  return [header, ...examples];
}
