import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Help & FAQ" };

const FAQS = [
  {
    q: "How do I pay for my order?",
    a: "We accept EVC Plus, Zaad, eDahab, Visa/Mastercard and cash on delivery. For mobile money, you'll get a payment prompt on your phone right after placing the order.",
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
    a: "Use the Track My Order page with the order number we sent you by SMS. You'll see exactly which stage your delivery is at.",
  },
  {
    q: "How do I open my own store?",
    a: "Head to the Sell on Banaadir page and fill in the application. Approval usually takes under 48 hours, then you can start listing products from your seller dashboard.",
  },
  {
    q: "Is my money safe?",
    a: "Yes. Payments are held by Banaadir Mall and only released to the store after your order is delivered. If something goes wrong, our buyer protection covers you.",
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
          { icon: "📞", title: "Call us", text: "+252 61 BANAADIR", sub: "Sat–Thu, 8am–8pm" },
          { icon: "💚", title: "WhatsApp", text: "+252 61 000 0000", sub: "Fastest response" },
          { icon: "✉️", title: "Email", text: "salaam@banaadirmall.so", sub: "Reply within 24h" },
        ].map((c) => (
          <div key={c.title} className="card p-5 text-center">
            <span className="text-3xl">{c.icon}</span>
            <h3 className="mt-2 font-display font-bold text-ocean-950">{c.title}</h3>
            <p className="mt-1 text-sm font-semibold text-ocean-700">{c.text}</p>
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
