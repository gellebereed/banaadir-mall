import type { Metadata } from "next";
import ReviewModeration, { type ModerationRow } from "@/components/dashboard/ReviewModeration";
import { getAllStores, getBaseProducts, getCustomerReviews } from "@/lib/api";
import { needsAttention, REPORTS_TO_HIDE } from "@/lib/review-moderation";

export const metadata: Metadata = { title: "Reviews" };
export const dynamic = "force-dynamic";

/** Every customer review, with what was reported first. See lib/review-moderation.ts. */
export default async function AdminReviewsPage() {
  const [reviews, products, stores] = await Promise.all([getCustomerReviews(), getBaseProducts(), getAllStores()]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const storeName = new Map(stores.map((s) => [s.slug, s.name]));

  const rows: ModerationRow[] = reviews
    .map((r) => {
      const product = productById.get(r.productId);
      return {
        id: r.id,
        productName: product?.name ?? r.productId,
        productSlug: product?.slug,
        storeName: product ? storeName.get(product.store) ?? product.store : "",
        author: r.author,
        rating: r.rating,
        text: r.text ?? "",
        date: r.date,
        photos: r.photos ?? [],
        verified: Boolean(r.verified),
        reports: r.reportedBy?.length ?? 0,
        hidden: Boolean(r.hidden),
        hiddenReason: r.hiddenReason,
        approved: Boolean(r.approved),
        attention: needsAttention(r),
      };
    })
    .sort((a, b) => Number(b.attention) - Number(a.attention) || b.reports - a.reports || b.date.localeCompare(a.date));

  return <ReviewModeration rows={rows} reportsToHide={REPORTS_TO_HIDE} />;
}
