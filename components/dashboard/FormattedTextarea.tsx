"use client";

import { useRef, useState } from "react";

interface FormattedTextareaProps {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  isListMode?: boolean;
}

/**
 * Textarea with formatting toolbar (Bold, Italic, Bullets, Numbers, Headings, Emojis, Templates).
 * Gives sellers professional e-commerce description formatting capabilities.
 */
export default function FormattedTextarea({
  id,
  name,
  label,
  defaultValue = "",
  placeholder,
  rows = 4,
  required = false,
  isListMode = false,
}: FormattedTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(defaultValue);

  const insertFormatting = (prefix: string, suffix: string = "", defaultText: string = "") => {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selectedText = el.value.substring(start, end) || defaultText;
    const replacement = `${prefix}${selectedText}${suffix}`;

    const newValue = el.value.substring(0, start) + replacement + el.value.substring(end);
    setValue(newValue);

    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
    }, 0);
  };

  const insertLinePrefix = (prefix: string) => {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value;

    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = text.indexOf("\n", end);
    const actualEnd = lineEnd === -1 ? text.length : lineEnd;

    const selectedLines = text.substring(lineStart, actualEnd).split("\n");
    const formattedLines = selectedLines.map((line, idx) => {
      const pfx = prefix === "1. " ? `${idx + 1}. ` : prefix;
      if (line.startsWith(pfx)) return line.slice(pfx.length);
      return `${pfx}${line}`;
    });

    const replacement = formattedLines.join("\n");
    const newValue = text.substring(0, lineStart) + replacement + text.substring(actualEnd);
    setValue(newValue);

    setTimeout(() => {
      el.focus();
    }, 0);
  };

  const insertTemplate = () => {
    if (isListMode) {
      setValue(
        "✓ Premium high-durability material\n" +
        "✓ Ergonomic and modern design\n" +
        "✓ Fast same-day delivery in Mogadishu\n" +
        "✓ Includes 1-year warranty and 7-day returns"
      );
    } else {
      setValue(
        "### Product Overview\n" +
        "Crafted with premium materials for long-lasting quality and exceptional performance.\n\n" +
        "### Key Highlights\n" +
        "• Elegant, modern design suitable for everyday use\n" +
        "• High durability and easy-to-clean surface\n" +
        "• Fast delivery & guaranteed authenticity\n\n" +
        "### Package Includes\n" +
        "• 1x Main Product Unit\n" +
        "• 1x User Manual & Guarantee Certificate"
      );
    }
  };

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="label mb-0">
          {label}
        </label>
        <button
          type="button"
          onClick={insertTemplate}
          className="text-xs font-semibold text-ocean-700 transition hover:text-mango-600"
        >
          ✨ Insert Template
        </button>
      </div>

      {/* Formatting Toolbar */}
      <div className="flex flex-wrap items-center gap-1 rounded-t-xl border border-sand-300 bg-sand-100 p-1.5 text-xs font-bold text-slate-700">
        <button
          type="button"
          onClick={() => insertFormatting("**", "**", "bold text")}
          className="rounded px-2 py-1 transition hover:bg-white hover:shadow-xs"
          title="Bold"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => insertFormatting("*", "*", "italic text")}
          className="italic rounded px-2 py-1 transition hover:bg-white hover:shadow-xs"
          title="Italic"
        >
          I
        </button>
        <div className="mx-1 h-4 w-px bg-sand-300" />
        <button
          type="button"
          onClick={() => insertLinePrefix("• ")}
          className="flex items-center gap-1 rounded px-2 py-1 transition hover:bg-white hover:shadow-xs"
          title="Bullet List"
        >
          <span>•</span> List
        </button>
        <button
          type="button"
          onClick={() => insertLinePrefix("1. ")}
          className="flex items-center gap-1 rounded px-2 py-1 transition hover:bg-white hover:shadow-xs"
          title="Numbered List"
        >
          <span>1.</span> List
        </button>
        <button
          type="button"
          onClick={() => insertLinePrefix("### ")}
          className="rounded px-2 py-1 transition hover:bg-white hover:shadow-xs"
          title="Heading"
        >
          H3
        </button>
        <div className="mx-1 h-4 w-px bg-sand-300" />
        {["✨", "🔥", "⭐", "📦", "🚚", "⚡"].map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => insertFormatting(emoji + " ")}
            className="rounded px-1.5 py-0.5 transition hover:bg-white hover:shadow-xs"
            title={`Insert ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>

      <textarea
        ref={textareaRef}
        id={id}
        name={name}
        required={required}
        rows={rows}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="input rounded-t-none border-t-0 resize-none font-sans"
      />
    </div>
  );
}
