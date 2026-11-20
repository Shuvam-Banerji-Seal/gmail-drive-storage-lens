// SPDX-License-Identifier: AGPL-3.0-or-later
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="lg-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <circle cx="28" cy="28" r="17" fill="none" stroke="url(#lg-a)" strokeWidth="5" />
      <ellipse cx="28" cy="28" rx="26" ry="9" fill="none" stroke="var(--accent-2)" strokeWidth="2" opacity="0.7" transform="rotate(-25 28 28)" />
      <circle cx="49" cy="18" r="3" fill="var(--accent)" />
      <path d="M40 40 L56 56" stroke="url(#lg-a)" strokeWidth="6" strokeLinecap="round" />
    </svg>
  )
}
