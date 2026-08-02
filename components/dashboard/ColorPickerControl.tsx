"use client";

import { useEffect, useRef, useState } from "react";
import { colorSwatch } from "@/lib/product-utils";

const POPULAR_PRESETS = [
  { name: "Black", hex: "#111827" },
  { name: "White", hex: "#ffffff" },
  { name: "Navy Blue", hex: "#1e3a8a" },
  { name: "Royal Blue", hex: "#1d4ed8" },
  { name: "Emerald", hex: "#059669" },
  { name: "Olive", hex: "#556b2f" },
  { name: "Rose Gold", hex: "linear-gradient(135deg, #b76e79, #f7cad0)" },
  { name: "Gold", hex: "#d4af37" },
  { name: "Burgundy", hex: "#7f1d1d" },
  { name: "Red", hex: "#dc2626" },
  { name: "Beige", hex: "#e8dcc8" },
  { name: "Khaki", hex: "#c2b280" },
  { name: "Space Grey", hex: "#6b7280" },
  { name: "Silver", hex: "#e5e7eb" },
  { name: "Turquoise", hex: "#40e0d0" },
  { name: "Coral", hex: "#f87171" },
];

export default function ColorPickerControl({
  colorName,
  colorHex,
  onChangeHex,
}: {
  colorName?: string;
  colorHex?: string;
  onChangeHex: (hex: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const activeSwatch = colorHex || colorSwatch(colorName);
  const colorInputVal =
    colorHex && colorHex.startsWith("#") ? colorHex : "#2563eb";

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Eyedropper API for picking exact color from image or screen
  async function handleEyeDropper() {
    if (typeof window !== "undefined" && "EyeDropper" in window) {
      try {
        // @ts-expect-error EyeDropper API is supported in modern Chromium browsers
        const eyeDropper = new window.EyeDropper();
        const result = await eyeDropper.open();
        if (result?.sRGBHex) {
          onChangeHex(result.sRGBHex);
        }
      } catch {
        // User canceled eyedropper selection
      }
    } else {
      alert(
        "Eyedropper tool is supported on modern desktop browsers (Chrome, Edge, Opera, Brave). You can also use the native color picker below!"
      );
    }
  }

  return (
    <div ref={popoverRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="Customize Color Swatch or Pick from Image"
        className="group flex items-center gap-1.5 rounded-xl border border-sand-200 bg-white p-1.5 shadow-xs transition hover:border-ocean-400 hover:shadow-md"
      >
        <span
          className="h-6 w-6 rounded-lg border border-black/10 shadow-inner transition group-hover:scale-110"
          style={{ background: activeSwatch }}
        />
        <span className="text-[10px] font-bold text-slate-500">🎨 Color</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-2xl border border-sand-200 bg-white p-4 shadow-2xl animate-fade-up">
          <div className="flex items-center justify-between border-b border-sand-100 pb-2">
            <p className="font-display text-xs font-bold text-ocean-950">
              Color Swatch Adjuster
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs font-bold text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          </div>

          {/* Eyedropper Tool */}
          <div className="mt-3">
            <button
              type="button"
              onClick={handleEyeDropper}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-ocean-300 bg-ocean-50 py-2 text-xs font-bold text-ocean-800 transition hover:bg-ocean-100"
            >
              <span>💧</span>
              <span>Pick Color from Image</span>
            </button>
          </div>

          {/* Native Hex Picker */}
          <div className="mt-3 flex items-center gap-3">
            <label className="flex flex-1 items-center gap-2 rounded-xl border border-sand-200 px-3 py-1.5 cursor-pointer hover:bg-sand-50">
              <input
                type="color"
                value={colorInputVal}
                onChange={(e) => onChangeHex(e.target.value)}
                className="h-7 w-7 cursor-pointer border-0 bg-transparent"
              />
              <span className="text-xs font-mono font-bold text-slate-700">
                {colorHex || "Default"}
              </span>
            </label>
          </div>

          {/* Preset Colors */}
          <div className="mt-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Preset Swatches
            </p>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {POPULAR_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  title={preset.name}
                  onClick={() => onChangeHex(preset.hex)}
                  className="flex h-7 items-center justify-center rounded-lg border border-black/10 transition hover:scale-110 shadow-xs"
                  style={{ background: preset.hex }}
                />
              ))}
            </div>
          </div>

          {/* Reset to Auto */}
          {colorHex && (
            <button
              type="button"
              onClick={() => onChangeHex(undefined)}
              className="mt-3 w-full rounded-xl border border-sand-200 bg-sand-50 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-sand-100"
            >
              ↺ Reset to Auto-Detect
            </button>
          )}
        </div>
      )}
    </div>
  );
}
