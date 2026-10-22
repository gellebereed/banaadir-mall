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
export async function saveStock(productId: string, fields: Pick<Product, "stock"> & Partial<Pick<Product, "variants">>): Promise<boolean> {
  if (useSupabaseMutations()) return updateProductFields(productId, fields);
  await mutateDB((db) => {
    db.productOverrides[productId] = { ...db.productOverrides[productId], ...fields };
  });
  return true;
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
    if (product.variants?.length) {
      const changes = new Map<string, number>();
      for (const line of productLines) {
        const variant = findVariant(product, line.selectedColor, line.selectedSize);
        if (!variant) continue;
        const current = changes.get(variant.id) ?? variant.stock;
        changes.set(variant.id, Math.max(0, current - line.qty));
      }
      if (changes.size === 0) continue;
      await saveStock(productId, applyToProduct(product, [...changes].map(([variantId, to]) => ({ variantId, to }))));
    } else {
      const sold = productLines.reduce((t, l) => t + l.qty, 0);
      await saveStock(productId, { stock: Math.max(0, product.stock - sold) });
    }
  }
}
