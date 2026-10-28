/**
 * Writing stock — the one place product counts are saved from, so online
 * orders, the stock page and file uploads all persist the same way
 * (Supabase when configured, the local overlay otherwise).
 *
 * Server only.
 */

import { getBaseProduct } from "./api";
import { mutateDB } from "./db";
import { findVariant } from "./product-utils";
import { applyToProduct } from "./stock-sync";
import { updateProductFields, useSupabaseMutations } from "./supabase/mutations";
import type { Product } from "./types";

/** Save new stock fields for one product. */
export async function saveStock(
  productId: string,
  fields: Pick<Product, "stock"> & Partial<Pick<Product, "variants" | "sold">>,
): Promise<boolean> {
  if (useSupabaseMutations()) return updateProductFields(productId, fields);
  await mutateDB((db) => {
    db.productOverrides[productId] = { ...db.productOverrides[productId], ...fields };
  });
  return true;
}

/** A line the shop cannot fill: what was asked for and what is on the shelf. */
export interface StockShortage {
  productId: string;
  name: string;
  selectedColor?: string;
  selectedSize?: string;
  requested: number;
  available: number;
}

/**
 * The lines of an order the shelf can't cover — checked before the order is
 * written, with the same per-variant rules deductStock uses.
 *
 * Orders used to be accepted whatever the count: a cart holding 3 kettles
 * went through after the shop had dropped its stock to 1, and deductStock
 * quietly clamped the shelf at zero. The shop had sold two kettles that did
 * not exist and found out only when it went to pack them.
 *
 * Quantities of the same product/variant on separate lines are added up,
 * so splitting a basket across lines can't get round the check.
 */
export async function findShortages(
  lines: { productId: string; qty: number; selectedColor?: string; selectedSize?: string }[],
): Promise<StockShortage[]> {
  const wanted = new Map<string, { line: (typeof lines)[number]; qty: number }>();
  for (const line of lines) {
    const key = `${line.productId}|${line.selectedColor ?? ""}|${line.selectedSize ?? ""}`;
    const prev = wanted.get(key);
    wanted.set(key, { line, qty: (prev?.qty ?? 0) + line.qty });
  }

  const shortages: StockShortage[] = [];
  for (const { line, qty } of wanted.values()) {
    const product = await getBaseProduct(line.productId);
    // A product the catalogue no longer knows is priced and filed elsewhere;
    // it is not this check's to refuse.
    if (!product) continue;
    const variant = product.variants?.length ? findVariant(product, line.selectedColor, line.selectedSize) : undefined;
    if (product.variants?.length && !variant) continue;
    const available = Math.max(0, variant ? variant.stock : product.stock);
    if (qty > available) {
      shortages.push({
        productId: line.productId,
        name: product.name,
        selectedColor: line.selectedColor,
        selectedSize: line.selectedSize,
        requested: qty,
        available,
      });
    }
  }
  return shortages;
}

/**
 * Take sold items off the shelf — the size/colour they chose when the
 * product has variants. Never below zero: the order is already placed, and
 * a negative count would only hide the item from everyone else.
 */
export async function deductStock(
  lines: { productId: string; qty: number; selectedColor?: string; selectedSize?: string }[],
): Promise<void> {
  const byProduct = new Map<string, typeof lines>();
  for (const line of lines) byProduct.set(line.productId, [...(byProduct.get(line.productId) ?? []), line]);

  for (const [productId, productLines] of byProduct) {
    const product = await getBaseProduct(productId);
    if (!product) continue;
    // The "sold" count on product cards and the seller's list. It never
    // moved with real orders — a product kept saying "Sold 0" after selling.
    const sold = productLines.reduce((t, l) => t + l.qty, 0);
    if (product.variants?.length) {
      const changes = new Map<string, number>();
      for (const line of productLines) {
        const variant = findVariant(product, line.selectedColor, line.selectedSize);
        if (!variant) continue;
        const current = changes.get(variant.id) ?? variant.stock;
        changes.set(variant.id, Math.max(0, current - line.qty));
      }
      if (changes.size === 0) continue;
      await saveStock(productId, {
        ...applyToProduct(product, [...changes].map(([variantId, to]) => ({ variantId, to }))),
        sold: (product.sold ?? 0) + sold,
      });
    } else {
      await saveStock(productId, { stock: Math.max(0, product.stock - sold), sold: (product.sold ?? 0) + sold });
    }
  }
}

/**
 * Put a cancelled parcel's items back on the shelf — the reverse of
 * deductStock. Cancelling used to leave them sold, so every unpaid or
 * refused parcel quietly took stock out of the shop for good.
 */
export async function returnStock(
  lines: { productId: string; qty: number; selectedColor?: string; selectedSize?: string }[],
): Promise<void> {
  const byProduct = new Map<string, typeof lines>();
  for (const line of lines) byProduct.set(line.productId, [...(byProduct.get(line.productId) ?? []), line]);

  for (const [productId, productLines] of byProduct) {
    const product = await getBaseProduct(productId);
    if (!product) continue;
    const returned = productLines.reduce((t, l) => t + l.qty, 0);
    const sold = Math.max(0, (product.sold ?? 0) - returned);
    if (product.variants?.length) {
      const changes = new Map<string, number>();
      for (const line of productLines) {
        const variant = findVariant(product, line.selectedColor, line.selectedSize);
        if (!variant) continue;
        changes.set(variant.id, (changes.get(variant.id) ?? variant.stock) + line.qty);
      }
      if (changes.size === 0) continue;
      await saveStock(productId, {
        ...applyToProduct(product, [...changes].map(([variantId, to]) => ({ variantId, to }))),
        sold,
      });
    } else {
      await saveStock(productId, { stock: product.stock + returned, sold });
    }
  }
}
