import type { Metadata } from "next";
import CheckoutClient from "@/components/checkout/CheckoutClient";
import { getMarketingSettings, getOrders, getStores } from "@/lib/api";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Checkout" };

// Delivery fee and free-delivery threshold come from /admin/marketing.
export const dynamic = "force-dynamic";

/** What we already know about this customer, so they don't retype it. */
export interface CheckoutDefaults {
  name: string;
  email: string;
  /** Local part only — the country code is a separate field. */
  phone: string;
  countryCode: string;
  city: string;
  district: string;
}

export default async function CheckoutPage() {
  // Stores travel with the page so the confirmation screen can address each
  // vendor by name and message them on their own WhatsApp number. Cart
  // lines carry only a store SLUG, which is neither something to show a
  // customer nor a number to send an order to.
  const [settings, stores, session] = await Promise.all([
    getMarketingSettings(),
    getStores(),
    getSession(),
  ]);

  /*
   * Pre-fill from what the marketplace already holds.
   *
   * A signed-in customer typing their own name and phone number into a
   * checkout form is the shop admitting it wasn't paying attention — and
   * every extra field is somewhere an order gets abandoned. The account
   * gives us the name and email; their last order gives the phone and the
   * city, which are the fields nobody enjoys typing on a phone.
   *
   * The most recent order wins over older ones: people move.
   */
  let defaults: CheckoutDefaults = {
    name: session?.name ?? "",
    email: session?.email ?? "",
    phone: "",
    countryCode: "SO",
    city: "",
    district: "",
  };

  if (session) {
    const orders = await getOrders();
    const email = session.email.trim().toLowerCase();
    const name = session.name.trim().toLowerCase();

    const latest = orders
      .filter((order) =>
        order.email
          ? order.email.trim().toLowerCase() === email
          : order.customer?.trim().toLowerCase() === name,
      )
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0];

    if (latest) {
      defaults = {
        ...defaults,
        // Stored as "+252 61 …" — the country code is picked separately, so
        // only the local part goes back into the field.
        phone: (latest.phone ?? "").replace(/^\+\d{1,4}\s*/, "").trim(),
        city: latest.city ?? "",
        // "Hodan, Mogadishu, Somalia" — the first part is the district.
        district: (latest.address ?? "").split(",")[0]?.trim() ?? "",
      };
    }
  }

  return <CheckoutClient settings={settings} stores={stores} defaults={defaults} />;
}
