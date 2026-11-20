// SPDX-License-Identifier: AGPL-3.0-or-later
// Minimal string lookup. English is always the fallback; other locales are registered at runtime.
import { messages, type MessageKey } from './en'

export type { MessageKey }
export type Dictionary = Partial<Record<MessageKey, string>>

const locales = new Map<string, Dictionary>()
let current = 'en'

/** Adds or replaces a locale's strings. Missing keys fall back to English. */
export function registerLocale(code: string, dict: Dictionary): void {
  locales.set(code, { ...(locales.get(code) ?? {}), ...dict })
}

/** Switches the active locale. Unknown codes keep English, so a typo never blanks the UI. */
export function setLocale(code: string): void {
  current = locales.has(code) || code === 'en' ? code : 'en'
}

export function getLocale(): string {
  return current
}

/** Replaces {name} with vars.name. Unknown placeholders are left visible so gaps show up in review. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  )
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const template = locales.get(current)?.[key] ?? messages[key]
  return interpolate(template, vars)
}
