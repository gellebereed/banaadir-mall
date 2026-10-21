import type { Metadata } from "next";

// The page itself is a client component, which cannot export metadata.
export const metadata: Metadata = {
  title: "Track your order",
  description: "See where your Banaadir Mall order is, parcel by parcel.",
  // Personal to the visitor: nothing here for a search engine.
  robots: { index: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
