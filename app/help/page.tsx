import type { Metadata } from "next";
import Link from "next/link";
import { formatWhatsAppNumber, SUPPORT_WHATSAPP_CONFIGURED } from "@/lib/whatsapp";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "ahgbered10@gmail.com";

export const metadata: Metadata = {
  title: "Help & FAQ",
  description:
    "Paying with EVC Plus, eDahab and other mobile money, delivery times across Somalia, returns and tracking your order — answers from Banaadir Mall.",
  alternates: { canonical: "/help" },
};

const FAQS = [
  {
    q: "How do I pay for my order?",
    a: "You pay each shop directly with mobile money — EVC Plus, eDahab, Premier Wallet and the others each shop lists at checkout. After you place the order, the confirmation screen and your tracking page show the shop's number (or pay code) and the exact amount; send it, then tap \"I've paid\" so the shop knows. Delivery is paid to the Banaadir Mall driver. We don't take card payments yet.",
  },
  {
    q: "How long does delivery take?",
    a: "Same-day delivery in Mogadishu for orders placed before 2pm. Other cities take 2–4 working days depending on the courier route.",
  },
  {
    q: "Can I return a product?",
    a: "Yes — you have 7 days from delivery to request a return for most items. The product must be unused and in its original packaging. Groceries and beauty products that have been opened can't be returned for hygiene reasons.",
  },
  {
    q: "How do I track my order?",
    a: "Use the Track My Order page with the order number shown when you placed the order (it starts with BM-). You'll see exactly which stage your delivery is at.",
  },
  {
    q: "How do I open my own store?",
    a: "Head to the Sell on Banaadir page and fill in the application. Approval usually takes under 48 hours, then you can start listing products from your seller dashboard.",
  },
  {
    q: "Is my money safe?",
    a: "Every shop on Banaadir Mall is checked before it can sell. Pay only to the number or pay code shown on your order page, check that your wallet shows the shop's name before you confirm, and tap \"I've paid\" so the shop can see it. If something goes wrong, message us on WhatsApp with your order number and we'll sort it out with the shop.",
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="text-center">
        <span className="text-5xl">💬</span>
        <h1 className="mt-4 font-display text-3xl font-extrabold text-ocean-950">
          How can we help?
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Answers to common questions — or reach us directly below.
        </p>
      </div>

      {/* FAQ accordion (native <details> — zero JavaScript needed) */}
      <div className="mt-8 space-y-3">
        {FAQS.map((f) => (
          <details key={f.q} className="card group p-5 open:shadow-md">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display font-bold text-ocean-950 [&::-webkit-details-marker]:hidden">
              {f.q}
              <span className="shrink-0 text-mango-500 transition group-open:rotate-45">＋</span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{f.a}</p>
          </details>
        ))}
      </div>

      {/* Contact cards */}
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          // Driven by NEXT_PUBLIC_SUPPORT_WHATSAPP so there is one number to
          // change, not a copy of it in every file that mentions support.
          // Left out when it isn't set: the code's fallback is a placeholder,
          // and publishing it sent customers to a number nobody answers.
          ...(SUPPORT_WHATSAPP_CONFIGURED
            ? [
                { icon: "📞", title: "Call us", text: formatWhatsAppNumber(SUPPORT_WHATSAPP_CONFIGURED), sub: "Sat–Thu, 8am–8pm" },
                { icon: "💚", title: "WhatsApp", text: formatWhatsAppNumber(SUPPORT_WHATSAPP_CONFIGURED), sub: "Fastest response" },
              ]
            : []),
          // salaam@banaadirmall.so was never a real inbox. The owner reads
          // this one daily; NEXT_PUBLIC_SUPPORT_EMAIL can move it to a
          // company address later without a code change.
          { icon: "✉️", title: "Email", text: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}`, sub: "Reply within 24h" },
        ].map((c) => (
          <div key={c.title} className="card p-5 text-center">
            <span className="text-3xl">{c.icon}</span>
            <h3 className="mt-2 font-display font-bold text-ocean-950">{c.title}</h3>
            {"href" in c && c.href ? (
              <a href={c.href} className="mt-1 block break-all text-sm font-semibold text-ocean-700 hover:underline">
                {c.text}
              </a>
            ) : (
              <p className="mt-1 text-sm font-semibold text-ocean-700">{c.text}</p>
            )}
            <p className="text-xs text-slate-400">{c.sub}</p>
          </div>
        ))}
      </div>

      <p className="mt-10 text-center text-sm text-slate-500">
        Still stuck?{" "}
        <Link href="/track" className="font-bold text-ocean-700 hover:underline">
          Track your order
        </Link>{" "}
        or visit{" "}
        <Link href="/account" className="font-bold text-ocean-700 hover:underline">
          your account
        </Link>
        .
      </p>
    </div>
  );
}
