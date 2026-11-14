// MissionForge mark: a ceramic hex patch with a teal orbit and a sunlit satellite dot.
// Generic and unbranded (style guide: no real agency logos or patches).
export function BrandMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" width={size} height={size} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="mf-mark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b4562" />
          <stop offset="1" stopColor="#0a1d2e" />
        </linearGradient>
        <linearGradient id="mf-mark-rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f4f8fa" />
          <stop offset="1" stopColor="#9fb4c2" />
        </linearGradient>
      </defs>
      <path d="M20 2.500l15.200 8.750v17.500L20 37.500 4.800 28.750v-17.500z" fill="url(#mf-mark-fill)" stroke="url(#mf-mark-rim)" strokeWidth="2.200" strokeLinejoin="round" />
      <path d="M12.500 27.500c3-6 9-12.500 16.500-15.500" fill="none" stroke="#e8eef0" strokeWidth="2.400" strokeLinecap="round" />
      <ellipse cx="20" cy="21" rx="11.500" ry="5" fill="none" stroke="#55c5cd" strokeWidth="1.600" transform="rotate(-24 20 21)" />
      <circle cx="29" cy="12" r="2.600" fill="#ffce83" />
    </svg>
  );
}
