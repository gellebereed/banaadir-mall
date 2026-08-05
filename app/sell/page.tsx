import type { Metadata } from "next";
import Link from "next/link";
import StoreApplicationForm from "@/components/StoreApplicationForm";

export const metadata: Metadata = {
  title: "Sell on Banaadir Mall",
  description:
    "Open your online store on Banaadir Mall for free. Reach customers across Somalia and get paid to your mobile money.",
};

const STEPS = [
  { icon: "📝", title: "Apply in 5 minutes", text: "Tell us about your business — no paperwork mountain, we promise." },
  { icon: "✅", title: "Get approved", text: "Our team reviews and approves new stores within 48 hours." },
  { icon: "📦", title: "Add your products", text: "Upload products from your dashboard, or let us import them from your Odoo system." },
  { icon: "💰", title: "Start earning", text: "Orders roll in, you deliver, and payouts land in your EVC Plus or Zaad." },
];

const PERKS = [
  { icon: "🆓", title: "Free to start", text: "No monthly fee. We only earn a small commission when you sell." },
  { icon: "📊", title: "Full dashboard", text: "Live sales stats, order management and product analytics." },
  { icon: "🚚", title: "Delivery network", text: "Plug into our couriers in 8 cities — or use your own." },
  { icon: "📣", title: "Marketing boost", text: "Get featured in flash deals, category pages and the home page." },
];

/**
 * Why a seller was sent here from /vendor.
 *
 * Being bounced out of a dashboard with no explanation reads as a bug, and
 * the seller's next move is to email support. Each case says what state the
 * application is in and what happens next.
 */
const STATUS_NOTICES: Record<string, { icon: string; title: string; body: string; tone: string }> = {
  pending: {
    icon: "⏳",
    title: "Your store is awaiting approval",
    body: "We review new stores within 48 hours. As soon as yours is approved you'll be able to sign in and open your dashboard — there's nothing more you need to do.",
    tone: "border-amber-300 bg-amber-50 text-amber-900",
  },
  rejected: {
    icon: "❌",
    title: "This application wasn't approved",
    body: "If you think that's a mistake, or you'd like to apply again with more detail about your business, get in touch and we'll take another look.",
    tone: "border-coral-500/40 bg-coral-100 text-coral-800",
  },
  suspended: {
    icon: "⚠️",
    title: "Your store is suspended",
    body: "Dashboard access is paused while we look into something. Contact support and we'll get it resolved.",
    tone: "border-coral-500/40 bg-coral-100 text-coral-800",
  },
  missing: {
    icon: "🔎",
    title: "We couldn't find your store",
    body: "The store linked to your account no longer exists. Apply below and we'll get you set up again.",
    tone: "border-sand-300 bg-sand-100 text-slate-700",
  },
};

/** Seller landing page + store application form. */
export default async function SellPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const notice = status ? STATUS_NOTICES[status] : undefined;

  return (
    <div>
      {notice && (
        <div className="mx-auto max-w-3xl px-4 pt-6">
          <div className={`rounded-2xl border-2 p-5 ${notice.tone}`}>
            <p className="flex items-center gap-2 font-display font-extrabold">
              <span aria-hidden>{notice.icon}</span>
              {notice.title}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed opacity-90">{notice.body}</p>
            {status === "pending" && (
              <Link
                href="/help"
                className="mt-3 inline-block text-sm font-bold underline underline-offset-2"
              >
                Contact support
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="bg-gradient-to-br from-ocean-950 via-ocean-800 to-ocean-600 px-4 py-16 text-center">
        <span className="inline-block rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-mango-300 ring-1 ring-white/20">
          🏪 Join 8+ stores already selling
        </span>
        <h1 className="mx-auto mt-5 max-w-2xl font-display text-4xl font-extrabold text-white sm:text-5xl">
          Turn your shop into an{" "}
          <span className="bg-gradient-to-r from-mango-300 to-mango-500 bg-clip-text text-transparent">
            online business
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-ocean-100">
          Banaadir Mall gives your store a beautiful online front, a sales
          dashboard, and customers across Somalia. You focus on products — we
          handle the technology.
        </p>
        <a href="#apply" className="btn-primary mt-8">
          Apply Now — It&apos;s Free
        </a>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-4 py-14">
        <h2 className="text-center font-display text-2xl font-bold text-ocean-950 sm:text-3xl">
          How it works
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.title} className="card relative p-6">
              <span className="absolute right-4 top-4 font-display text-4xl font-extrabold text-sand-100">
                {i + 1}
              </span>
              <span className="text-3xl">{s.icon}</span>
              <h3 className="mt-3 font-display font-bold text-ocean-950">{s.title}</h3>
              <p className="mt-1.5 text-sm text-slate-500">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Perks */}
      <section className="bg-sand-100 px-4 py-14">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center font-display text-2xl font-bold text-ocean-950 sm:text-3xl">
            Why sellers love us
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PERKS.map((p) => (
              <div key={p.title} className="rounded-2xl bg-white p-6 shadow-sm">
                <span className="text-3xl">{p.icon}</span>
                <h3 className="mt-3 font-display font-bold text-ocean-950">{p.title}</h3>
                <p className="mt-1.5 text-sm text-slate-500">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Application form */}
      <section id="apply" className="mx-auto max-w-2xl px-4 py-14">
        <div className="card p-6 sm:p-8">
          <h2 className="font-display text-2xl font-extrabold text-ocean-950">
            Open your store
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Fill this in and your store will be created instantly.
          </p>

          <StoreApplicationForm />

          <p className="mt-4 text-center text-xs text-slate-400">
            Already a seller?{" "}
            <Link href="/login" className="font-bold text-ocean-700 hover:underline">
              Sign in to your dashboard →
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
