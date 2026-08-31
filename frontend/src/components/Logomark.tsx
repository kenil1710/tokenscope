/** The shield-and-scan mark. Inline so it can take `currentColor`. */
export function Logomark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M16 2.8 5.4 7.1v8.6c0 6.6 4.5 12.7 10.6 14.3 6.1-1.6 10.6-7.7 10.6-14.3V7.1L16 2.8Z"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <circle cx="14.6" cy="14.4" r="4.2" stroke="currentColor" strokeWidth="1.9" />
      <path
        d="m17.8 17.6 3.6 3.6"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}
