import type { OrderStatus } from "@/lib/types";

const STATUS_CONFIG: Record<
  OrderStatus,
  { bg: string; text: string; ring: string; dot: string; label: string; icon: string }
> = {
  pending: {
    bg: "bg-slate-100",
    text: "text-slate-700",
    ring: "ring-slate-300/60",
    dot: "bg-slate-400",
    label: "Order Placed",
    icon: "🧾",
  },
  processing: {
    bg: "bg-amber-50",
    text: "text-amber-800",
    ring: "ring-amber-300/70",
    dot: "bg-amber-500",
    label: "Being Packed",
    icon: "📦",
  },
  shipped: {
    bg: "bg-sky-50",
    text: "text-sky-800",
    ring: "ring-sky-300/70",
    dot: "bg-sky-500",
    label: "On the Way",
    icon: "🚚",
  },
  delivered: {
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    ring: "ring-emerald-400/80",
    dot: "bg-emerald-500",
    label: "Delivered",
    icon: "✓",
  },
  cancelled: {
    bg: "bg-rose-50",
    text: "text-rose-800",
    ring: "ring-rose-300/70",
    dot: "bg-rose-500",
    label: "Cancelled",
    icon: "✕",
  },
};

/** Coloured pill for an order status — used across admin, vendor and customer views. */
export default function StatusBadge({
  status,
  size = "md",
}: {
  status: OrderStatus;
  size?: "sm" | "md" | "lg";
}) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const padding = size === "sm" ? "px-2 py-0.5 text-[10px]" : size === "lg" ? "px-3.5 py-1.5 text-xs" : "px-2.5 py-1 text-[11px]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-extrabold tracking-wide ring-1 shadow-2xs transition-all ${config.bg} ${config.text} ${config.ring} ${padding}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot} ${status === "delivered" ? "animate-pulse" : ""}`} />
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}

