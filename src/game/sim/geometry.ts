import type { Vec2 } from '../types'
import { islandRects } from './map'

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
export const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y)
export const bearing = (a: Vec2, b: Vec2) => Math.atan2(b.x - a.x, a.y - b.y)
export const angleDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from))
export const direction = (angle: number): Vec2 => ({ x: Math.sin(angle), y: -Math.cos(angle) })

export function nearIsland(point: Vec2, radius: number): boolean {
  return islandRects.some(({ left, right, top, bottom }) =>
    Math.hypot(point.x - clamp(point.x, left, right), point.y - clamp(point.y, top, bottom)) < radius,
  )
}

export function pushOutOfIslands(point: Vec2, radius: number): void {
  for (const { left, right, top, bottom } of islandRects) {
    const dx = point.x - clamp(point.x, left, right)
    const dy = point.y - clamp(point.y, top, bottom)
    const separation = Math.hypot(dx, dy)
    if (separation >= radius) continue
    if (separation > 0) {
      point.x += dx / separation * (radius - separation)
      point.y += dy / separation * (radius - separation)
      continue
    }

    const closest = Math.min(point.x - left, right - point.x, point.y - top, bottom - point.y)
    if (closest === point.x - left) point.x = left - radius
    else if (closest === right - point.x) point.x = right + radius
    else if (closest === point.y - top) point.y = top - radius
    else point.y = bottom + radius
  }
}

/** Nearest island contact as a fraction of the segment, or Infinity for a miss. */
export function islandHit(start: Vec2, delta: Vec2, margin = 0): number {
  let nearest = Infinity
  for (const { left, right, top, bottom } of islandRects) {
    if (delta.x === 0 && (start.x < left - margin || start.x > right + margin)) continue
    if (delta.y === 0 && (start.y < top - margin || start.y > bottom + margin)) continue
    const x1 = delta.x === 0 ? -Infinity : (left - margin - start.x) / delta.x
    const x2 = delta.x === 0 ? Infinity : (right + margin - start.x) / delta.x
    const y1 = delta.y === 0 ? -Infinity : (top - margin - start.y) / delta.y
    const y2 = delta.y === 0 ? Infinity : (bottom + margin - start.y) / delta.y
    const entry = Math.max(0, Math.min(x1, x2), Math.min(y1, y2))
    const exit = Math.min(1, Math.max(x1, x2), Math.max(y1, y2))
    if (entry <= exit) nearest = Math.min(nearest, entry)
  }
  return nearest
}

export function circleHit(start: Vec2, delta: Vec2, center: Vec2, radius: number): number {
  const x = start.x - center.x
  const y = start.y - center.y
  const c = x * x + y * y - radius * radius
  if (c <= 0) return 0
  const a = delta.x * delta.x + delta.y * delta.y
  const b = x * delta.x + y * delta.y
  const discriminant = b * b - a * c
  if (a === 0 || b >= 0 || discriminant < 0) return Infinity
  const entry = (-b - Math.sqrt(discriminant)) / a
  return entry <= 1 ? entry : Infinity
}
