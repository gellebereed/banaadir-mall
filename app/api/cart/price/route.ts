import { NextResponse, type NextRequest } from "next/server";
import { priceItems } from "@/lib/cart-pricing";

/**
 * The basket priced by the server — the confirmation behind the prices the
 * cart and checkout already show (components/cart/useCartPricing.ts).
 *
 * A route rather than a server action on purpose. Next.js runs a page's
 * server actions one at a time, and the cart page also asks for its
 * recommendation shelves through one — so the price check used to queue
 * behind a catalogue-wide similarity build, and the discount appeared
 * seconds after the item did.
 *
 * Same engine and same answer as submitOrderAction, which prices the order
 * again when it is placed: nothing here is trusted later.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      items?: { productId: string; qty: number; selectedColor?: string; selectedSize?: string }[];
      promoCode?: string;
    };
    const items = (Array.isArray(body.items) ? body.items : []).slice(0, 200).map((item) => ({
      productId: String(item.productId ?? ""),
      qty: Number(item.qty) || 0,
      selectedColor: item.selectedColor ? String(item.selectedColor) : undefined,
      selectedSize: item.selectedSize ? String(item.selectedSize) : undefined,
    }));
    const { pricing, promo, deals } = await priceItems(
      items,
      body.promoCode ? String(body.promoCode).slice(0, 30) : undefined,
    );
    return NextResponse.json({ pricing, promo, deals }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not price the basket." }, { status: 400 });
  }
}
