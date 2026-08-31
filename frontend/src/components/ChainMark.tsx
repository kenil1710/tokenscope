/**
 * Chain glyphs, drawn inline.
 *
 * Inline SVG rather than image files: four marks at a handful of sizes is less
 * bytes than four network requests, they inherit `currentColor` where useful,
 * and they cannot 404 on a deploy that forgot the public folder.
 */
import type { ChainName } from "@/types";

export function ChainMark({
  chain,
  size = 16,
  className = "",
}: {
  chain: ChainName;
  size?: number;
  className?: string;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 32 32",
    className,
    "aria-hidden": true as const,
  };

  if (chain === "ethereum") {
    return (
      <svg {...common}>
        <circle cx="16" cy="16" r="16" fill="#627EEA" />
        <path d="M16 4.5v8.4l7.1 3.2L16 4.5Z" fill="#fff" fillOpacity=".62" />
        <path d="M16 4.5 8.9 16.1 16 12.9V4.5Z" fill="#fff" />
        <path d="M16 21.5v5.9l7.1-9.9L16 21.5Z" fill="#fff" fillOpacity=".62" />
        <path d="M16 27.4v-5.9l-7.1-4L16 27.4Z" fill="#fff" />
        <path d="m16 20.2 7.1-4.1L16 12.9v7.3Z" fill="#fff" fillOpacity=".2" />
        <path d="M8.9 16.1 16 20.2v-7.3l-7.1 3.2Z" fill="#fff" fillOpacity=".62" />
      </svg>
    );
  }

  if (chain === "base") {
    return (
      <svg {...common}>
        <circle cx="16" cy="16" r="16" fill="#0052FF" />
        <path
          d="M15.9 26.6c5.9 0 10.6-4.7 10.6-10.6S21.8 5.4 15.9 5.4C10.3 5.4 5.8 9.6 5.3 15h14v2h-14c.5 5.4 5 9.6 10.6 9.6Z"
          fill="#fff"
        />
      </svg>
    );
  }

  if (chain === "arbitrum") {
    return (
      <svg {...common}>
        <circle cx="16" cy="16" r="16" fill="#2D374B" />
        <path
          d="m14.4 11.6 1.9-3.2 5.1 8.7v3.9l-1.9-3.3-5.1-6.1Z"
          fill="#28A0F0"
        />
        <path d="m22.4 21.9-2.3-3.9-1.6 2.7 1.4 2.4 2.5-1.2Z" fill="#28A0F0" />
        <path
          d="m9.6 21.4 3.6-6.2 3.6 6.2-1.8 3.1h-3.6l-1.8-3.1Z"
          fill="#fff"
        />
        <path d="M16.3 8.4 9.6 19.9v2.5l6.7-11.6.9-1.5-.9-.9Z" fill="#96BEDC" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="16" cy="16" r="16" fill="#8247E5" />
      <path
        d="M21.3 12.9c-.4-.2-.9-.2-1.3 0l-3 1.7-2 1.1-2.9 1.7c-.4.2-.9.2-1.3 0l-2.3-1.4a1.3 1.3 0 0 1-.7-1.1v-2.7c0-.4.2-.9.7-1.1l2.3-1.3c.4-.2.9-.2 1.3 0l2.3 1.3c.4.2.7.7.7 1.1v1.7l2-1.2v-1.7c0-.4-.2-.9-.7-1.1l-4.2-2.5c-.4-.2-.9-.2-1.3 0L6.6 9.9c-.5.2-.7.7-.7 1.1v4.9c0 .4.2.9.7 1.1l4.3 2.4c.4.3.9.3 1.3 0l2.9-1.6 2-1.2 2.9-1.6c.4-.3.9-.3 1.3 0l2.3 1.3c.4.2.7.7.7 1.1v2.7c0 .4-.2.9-.7 1.1l-2.3 1.4c-.4.2-.9.2-1.3 0l-2.3-1.3a1.3 1.3 0 0 1-.7-1.1v-1.7l-2 1.2v1.7c0 .4.2.9.7 1.1l4.3 2.4c.4.3.9.3 1.3 0l4.3-2.4c.4-.2.7-.7.7-1.1v-5c0-.4-.2-.9-.7-1.1l-4.3-2.4Z"
        fill="#fff"
      />
    </svg>
  );
}
