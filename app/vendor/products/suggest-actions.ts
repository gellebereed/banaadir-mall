"use server";

/**
 * The product editor's "✨ Suggest" button — category and attribute
 * suggestions for the product being typed in. Reads only; the seller
 * applies what they agree with and saves as usual.
 */

import { getCategories } from "@/lib/api";
import { may } from "@/lib/auth";
import { classifyProduct, type ClassifyResult } from "@/lib/product-classify";
import { getSession } from "@/lib/session";

export async function suggestProductDetails(input: {
  name: string;
  description: string;
  category?: string;
  image?: string;
}): Promise<ClassifyResult & { notAllowed?: boolean }> {
  const session = await getSession();
  if (!session || session.role === "customer" || !may(session, "products.edit")) {
    return { attributes: {}, source: "words", notAllowed: true };
  }
  if (input.name.trim().length < 3) {
    return { attributes: {}, source: "words", error: "Type the product's name first." };
  }
  return classifyProduct(
    {
      name: String(input.name),
      description: String(input.description ?? ""),
      category: input.category ? String(input.category) : undefined,
      image: typeof input.image === "string" ? input.image : undefined,
    },
    await getCategories(),
  );
}
