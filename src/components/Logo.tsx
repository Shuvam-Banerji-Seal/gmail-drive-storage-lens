// SPDX-License-Identifier: AGPL-3.0-or-later
/** Mark: a lens over an orbit, with one bright star. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="14" cy="14" r="9.5" fill="none" stroke="var(--accent)" strokeWidth="2.2" />
      <ellipse cx="14" cy="14" rx="13" ry="4.6" fill="none" stroke="var(--text)" strokeWidth="1" opacity="0.55" transform="rotate(-24 14 14)" />
      <circle cx="14" cy="14" r="2.2" fill="var(--accent)" />
      <path d="M21 21l7 7" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
