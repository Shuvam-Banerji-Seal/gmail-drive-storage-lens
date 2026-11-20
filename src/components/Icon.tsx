// SPDX-License-Identifier: AGPL-3.0-or-later
// One consistent 24px stroke icon set, drawn for this project.
import type { SVGProps } from 'react'

const P: Record<string, string> = {
  overview: 'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M21 3l-7.5 7.5M12 12h.01',
  mail: 'M3.5 6.5h17v11h-17zM4 7l8 6 8-6',
  drive: 'M8.2 4h7.6l5.2 9-3.8 6.5H6.8L3 13zM8.2 4 12 10.5 15.8 4M3 13h18',
  planner: 'M12 21a9 9 0 1 1 9-9M12 12l6-3M12 3v2M3 12h2M12 19v2M19.5 15.5l1.5 1.5-3 3-1.5-1.5',
  insights: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  airlock: 'M12 3l8 3.5v5.5c0 4.6-3.4 8.2-8 9-4.6-.8-8-4.4-8-9V6.5zM9 12h6M12 9v6',
  verify: 'M12 3l8 3.5v5.5c0 4.6-3.4 8.2-8 9-4.6-.8-8-4.4-8-9V6.5zM8.5 12l2.5 2.5 4.5-5',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 0 1-1.8 1l-.3 2H11l-.3-2a7 7 0 0 1-1.8-1l-1.9.7-2-3.4 1.6-1.2a7 7 0 0 1 0-3L5 9.3l2-3.4 1.9.7a7 7 0 0 1 1.8-1l.3-2h4l.3 2a7 7 0 0 1 1.8 1l1.9-.7 2 3.4-1.6 1.2a7 7 0 0 1 0 3z',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20',
  info: 'M12 11v6M12 7.5v.01',
  menu: 'M4 7h16M4 12h16M4 17h16',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  close: 'M6 6l12 12M18 6 6 18',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  play: 'M8 5v14l11-7z',
  pause: 'M8 5v14M16 5v14',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  warn: 'M12 4 2.5 20h19zM12 10v4M12 17v.01',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  key: 'M14.5 9.5a4.5 4.5 0 1 1-1.3 3.2L4 22H2v-3l2-2h2v-2h2l1.5-1.5',
  cloud: 'M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 8.5a4.8 4.8 0 0 1-1 9.5z',
  browser: 'M3 5h18v14H3zM3 9h18M6 7h.01M9 7h.01',
  server: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01',
  filter: 'M4 5h16l-6 7.5V19l-4 1v-7.5z',
  label: 'M3 12V4h8l10 10-7 7z M7.5 8.5h.01',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  sparkle: 'M12 4v4M12 16v4M4 12h4M16 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  layers: 'M12 3 2.5 8 12 13l9.5-5zM2.5 12.5 12 17.5l9.5-5M2.5 16.5 12 21.5l9.5-5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  refresh: 'M20 11a8 8 0 0 0-14.7-4.4L4 8M4 4v4h4M4 13a8 8 0 0 0 14.7 4.4L20 16M20 20v-4h-4',
}
export type IconName = keyof typeof P

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      {name === 'info' && <circle cx="12" cy="12" r="9" />}
      <path d={P[name]} />
    </svg>
  )
}
