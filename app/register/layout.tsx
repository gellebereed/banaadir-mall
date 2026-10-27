import type { Metadata } from "next";

// The page itself is a client component, which cannot export metadata.
export const metadata: Metadata = {
  title: "Create an account",
  description: "Join Banaadir Mall — shop trusted Somali stores and pay with EVC Plus, Zaad, eDahab or cash.",
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
