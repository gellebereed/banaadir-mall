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
    // Hide popover first so user has an unobstructed view of all product photos on screen
    setOpen(false);

    setTimeout(async () => {
      if (typeof window !== "undefined" && "EyeDropper" in window) {
        try {
          // @ts-expect-error EyeDropper API is supported in Chromium browsers
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
          "Eyedropper tool is supported on modern desktop browsers (Chrome, Edge, Opera, Brave). You can also use the inline color picker!"
        );
      }
    }, 100);
  }

  return (
    <div ref={popoverRef} className="relative inline-flex items-center gap-1">
      {/* Direct Native Color Input Swatch */}
      <label
        title="Click to pick custom color"
        className="relative flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-black/10 shadow-xs transition hover:scale-105 hover:shadow-md"
        style={{ background: activeSwatch }}
      >
        <input
          type="color"
          value={colorInputVal}
          onChange={(e) => onChangeHex(e.target.value)}
          className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
        />
      </label>

      {/* Eyedropper & Palette Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="More color options (Eyedropper from image & presets)"
        className="flex items-center gap-1 rounded-xl border border-sand-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-ocean-50 hover:text-ocean-900"
      >
        <span>💧</span>
        <span className="hidden sm:inline">Palette</span>
      </button>

      {/* Popover — Positioned ABOVE input (bottom-full) to never cover photos below */}
      {open && (
        <div className="absolute bottom-full left-0 z-[100] mb-2 w-64 rounded-2xl border border-sand-200 bg-white p-4 shadow-2xl animate-fade-up">
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
            <p className="mt-1 text-[10px] text-slate-400 text-center">
              Click & hover over your product photo to sample exact color
            </p>
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
                  onClick={() => {
                    onChangeHex(preset.hex);
                    setOpen(false);
                  }}
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
              onClick={() => {
                onChangeHex(undefined);
                setOpen(false);
              }}
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
