import type { Metadata } from "next";

// The page itself is a client component, which cannot export metadata.
export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to track orders, save favourites and check out faster.",
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
