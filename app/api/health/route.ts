import { NextResponse } from "next/server";
import { getPublicClient } from "@/lib/supabase/public-client";
import { isSupabaseConfigured } from "@/lib/supabase/storage";

/**
 * Deployment diagnostics — open /api/health on any environment.
 *
 * Its job is to answer one question fast: "is this environment actually
 * persisting my changes?" On Netlify the filesystem is read-only and every
 * request runs in a fresh Lambda, so if the Supabase env vars are missing
 * the app silently falls back to the seed catalog and an in-memory store —
 * edits appear to save and then vanish on the next request.
 *
 * Returns booleans and counts only; never keys or row contents.
 */
export const dynamic = "force-dynamic";

const REQUIRED_PRODUCT_COLUMNS = "stock,icon,art,colors,sizes,default_variant_id,features";
const REQUIRED_STORE_COLUMNS = "icon,followers,joined_year,verified,official,category,art";

export async function GET() {
  const configured = isSupabaseConfigured();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const report: Record<string, unknown> = {
    supabaseConfigured: configured,
    // Reported so a missing Netlify env var is obvious at a glance.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: Boolean(url),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      // Host only — never the key. Confirms which project this build targets.
      projectHost: url ? new URL(url).host : null,
    },
    note:
      "NEXT_PUBLIC_* values are inlined when the app is BUILT, not read at " +
      "runtime. If you changed them in Netlify you must redeploy " +
      "(Deploys → Trigger deploy → Clear cache and deploy site) for the new " +
      "values to take effect.",
  };

  if (!configured) {
    report.status = "NOT_PERSISTING";
    report.problem =
      "Supabase is not configured in this environment. The app is serving the " +
      "built-in seed catalog and writing to an in-memory store, so every " +
      "dashboard change is lost on the next request.";
    report.fix =
      "Netlify → Site configuration → Environment variables → add " +
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then redeploy " +
      "(Deploys → Trigger deploy → Clear cache and deploy site).";
    return NextResponse.json(report, { status: 503 });
  }

  try {
    const supabase = getPublicClient();

    const [products, stores, migrated, storesMigrated] = await Promise.all([
      supabase.from("products").select("id", { count: "exact", head: true }),
      supabase.from("stores").select("slug", { count: "exact", head: true }),
      supabase.from("products").select(REQUIRED_PRODUCT_COLUMNS).limit(1),
      supabase.from("stores").select(REQUIRED_STORE_COLUMNS).limit(1),
    ]);

    report.reachable = !products.error;
    report.counts = { products: products.count ?? 0, stores: stores.count ?? 0 };
    report.schemaMigrated = !migrated.error && !storesMigrated.error;

    if (products.error) {
      report.status = "UNREACHABLE";
      report.problem = `Supabase rejected the request: ${products.error.message}`;
      return NextResponse.json(report, { status: 503 });
    }
    if (!report.schemaMigrated) {
      report.status = "SCHEMA_OUT_OF_DATE";
      report.problem =
        "Tables are missing columns the app writes to (stock, variants metadata, official…).";
      report.fix = "Run supabase/migration.sql in the Supabase SQL editor.";
      return NextResponse.json(report, { status: 503 });
    }

    // Prove writes land, using a no-op update that must report an affected row.
    const { data: sample } = await supabase.from("products").select("id,name").limit(1).single();
    if (sample) {
      const { data: written, error } = await supabase
        .from("products")
        .update({ name: sample.name })
        .eq("id", sample.id)
        .select("id");
      report.writable = !error && (written?.length ?? 0) > 0;
      if (error) report.writeError = error.message;
    }

    // Photo uploads need a public Storage bucket named "uploads". Without it
    // every upload fails silently and products save with no images.
    const { data: buckets } = await supabase.storage.listBuckets();
    const uploads = buckets?.find((b) => b.id === "uploads");
    report.storageBucket = uploads ? (uploads.public ? "public" : "PRIVATE") : "MISSING";

    if (report.writable === false) {
      report.status = "READ_ONLY";
      report.problem = "Reads work but writes are rejected — check RLS policies.";
      report.fix = "Re-run the RLS section at the bottom of supabase/migration.sql.";
    } else if (report.storageBucket !== "public") {
      report.status = "NO_PHOTO_STORAGE";
      report.problem =
        report.storageBucket === "MISSING"
          ? "Storage bucket 'uploads' does not exist — photo uploads fail silently."
          : "Storage bucket 'uploads' is private — uploaded photos cannot be displayed.";
      report.fix = "Run supabase/storage-setup.sql in the Supabase SQL editor.";
    } else {
      report.status = "OK";
    }
    return NextResponse.json(report, { status: report.status === "OK" ? 200 : 503 });
  } catch (err) {
    report.status = "ERROR";
    report.problem = err instanceof Error ? err.message : String(err);
    return NextResponse.json(report, { status: 503 });
  }
}
