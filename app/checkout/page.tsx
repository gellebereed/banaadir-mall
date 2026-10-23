import type { Metadata } from "next";
import CheckoutClient from "@/components/checkout/CheckoutClient";
import { getMarketingSettings, getOrders, getStores } from "@/lib/api";
import { getSession } from "@/lib/session";
import { orderBelongsTo } from "@/lib/order-utils";
import { splitPhone } from "@/lib/data/locations";

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
   * gives us the name, email and the phone they registered with; their last
   * order gives the phone and the city, which are the fields nobody enjoys
   * typing on a phone.
   *
   * The most recent order wins over older ones: people move.
   */
  // The country code is its own field, so only the local part goes in the box.
  const registered = session?.phone ? splitPhone(session.phone) : undefined;
  let defaults: CheckoutDefaults = {
    name: session?.name ?? "",
    email: session?.email ?? "",
    phone: registered?.local ?? "",
    countryCode: registered?.countryCode ?? "SO",
    city: "",
    district: "",
  };

  if (session) {
    const orders = await getOrders();
    // Their orders by email only — matching on the name filled this form
    // with a stranger's phone and address whenever two people shared one.
    const latest = orders
      .filter((order) => orderBelongsTo(order, session))
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0];

    if (latest?.phone) {
      const fromOrder = splitPhone(latest.phone);
      defaults = {
        ...defaults,
        phone: fromOrder.local,
        countryCode: fromOrder.countryCode,
        city: latest.city ?? "",
        // "Hodan, Mogadishu, Somalia" — the first part is the district.
        district: (latest.address ?? "").split(",")[0]?.trim() ?? "",
      };
    }
  }

  return <CheckoutClient settings={settings} stores={stores} defaults={defaults} />;
}
