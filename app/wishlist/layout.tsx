import type { Metadata } from "next";

// The page itself is a client component, which cannot export metadata.
export const metadata: Metadata = {
  title: "My wishlist",
  description: "Products you saved — with price-drop alerts.",
  // Personal to the visitor: nothing here for a search engine.
  robots: { index: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
