import { PageSpinner } from "@/components/Skeletons";

/** Fallback loader for any route without its own loading.tsx. */
export default function Loading() {
  return <PageSpinner />;
}
