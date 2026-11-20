// SPDX-License-Identifier: AGPL-3.0-or-later
export type Point2 = readonly [number, number]

/** Even-odd (ray casting) point-in-polygon test. Polygon is an open list of vertices. */
export function pointInPolygon(x: number, y: number, polygon: ReadonlyArray<Point2>): boolean {
  let inside = false
  const n = polygon.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    if (!a || !b) continue
    const [xi, yi] = a
    const [xj, yj] = b
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
