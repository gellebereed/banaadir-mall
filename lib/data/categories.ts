import type { Category } from "../types";

/**
 * Marketplace categories.
 * In Odoo these map to `product.category` records — when the connector is
 * built, replace this array with fetched categories in lib/api.ts.
 */
export const categories: Category[] = [
  {
    slug: "electronics",
    name: "Electronics",
    icon: "📱",
    tagline: "Phones, audio & smart tech",
    art: { from: "#dbeafe", to: "#bfdbfe" },
  },
  {
    slug: "womens-fashion",
    name: "Women's Fashion",
    icon: "👗",
    tagline: "Dresses, abayas & accessories",
    art: { from: "#ffe4e6", to: "#fecdd3" },
  },
  {
    slug: "mens-fashion",
    name: "Men's Fashion",
    icon: "👔",
    tagline: "Sharp looks for every day",
    art: { from: "#e0f2fe", to: "#bae6fd" },
  },
  {
    slug: "beauty",
    name: "Beauty & Care",
    icon: "💄",
    tagline: "Qasil, serums & fragrance",
    art: { from: "#fce7f3", to: "#fbcfe8" },
  },
  {
    slug: "home-living",
    name: "Home & Living",
    icon: "🛋️",
    tagline: "Make your guri beautiful",
    art: { from: "#fef3c7", to: "#fde68a" },
  },
  {
    slug: "kids-baby",
    name: "Kids & Baby",
    icon: "🧸",
    tagline: "Toys, learning & baby gear",
    art: { from: "#ecfccb", to: "#d9f99d" },
  },
  {
    slug: "sports-outdoor",
    name: "Sports & Outdoor",
    icon: "⚽",
    tagline: "Train hard, play harder",
    art: { from: "#ccfbf1", to: "#99f6e4" },
  },
  {
    slug: "groceries",
    name: "Groceries",
    icon: "🧺",
    tagline: "Fresh staples & spices",
    art: { from: "#ffedd5", to: "#fed7aa" },
  },
];
