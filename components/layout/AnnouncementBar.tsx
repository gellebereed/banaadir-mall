"use client";

import React from "react";

interface AnnouncementBarProps {
  announcement: string;
  bgColor?: string;
  textColor?: string;
  autoScroll?: boolean;
  speed?: number;
}

/**
 * Announcement Bar:
 * Auto-scrolling infinite marquee header banner with rich text formatting (bold, italic, emojis)
 * and custom background & text colors controlled from /admin/marketing.
 */
export default function AnnouncementBar({
  announcement,
  bgColor = "#0c2b34",
  textColor = "#ffffff",
  autoScroll = true,
  speed = 25,
}: AnnouncementBarProps) {
  if (!announcement) return null;

  return (
    <div
      className="relative z-40 overflow-hidden text-xs font-semibold select-none transition-colors duration-300"
      style={{
        backgroundColor: bgColor || "#0c2b34",
        color: textColor || "#ffffff",
      }}
    >
      {autoScroll ? (
        <div
          className="group flex py-2 cursor-pointer"
          title="Hover to pause announcement"
        >
          <div
            className="flex min-w-full shrink-0 items-center justify-around gap-12 whitespace-nowrap animate-marquee group-hover:[animation-play-state:paused]"
            style={{ animationDuration: `${speed}s` }}
          >
            <AnnouncementContent text={announcement} />
            <AnnouncementContent text={announcement} />
            <AnnouncementContent text={announcement} />
          </div>
          <div
            className="flex min-w-full shrink-0 items-center justify-around gap-12 whitespace-nowrap animate-marquee group-hover:[animation-play-state:paused]"
            style={{ animationDuration: `${speed}s` }}
            aria-hidden="true"
          >
            <AnnouncementContent text={announcement} />
            <AnnouncementContent text={announcement} />
            <AnnouncementContent text={announcement} />
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-7xl px-4 py-2 text-center">
          <AnnouncementContent text={announcement} />
        </div>
      )}
    </div>
  );
}

/** Parses formatting like **bold**, *italic*, and line breaks into stylized spans. */
function AnnouncementContent({ text }: { text: string }) {
  if (!text) return null;

  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);

  return (
    <span className="inline-flex items-center gap-3">
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-extrabold tracking-wide uppercase opacity-95">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return (
            <em key={i} className="italic font-medium opacity-90">
              {part.slice(1, -1)}
            </em>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}
