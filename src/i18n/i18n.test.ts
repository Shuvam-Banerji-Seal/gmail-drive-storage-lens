// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it } from 'vitest'
import { getLocale, registerLocale, setLocale, t } from './index'

afterEach(() => setLocale('en'))

describe('t', () => {
  it('returns the English string for a key', () => {
    expect(t('nav.overview')).toBe('Overview')
  })

  it('interpolates named variables', () => {
    expect(t('app.selected', { count: 3, bytes: '2 MiB' })).toBe('Selected 3 · 2 MiB')
    expect(t('tour.step', { current: 2, total: 5 })).toBe('Step 2 of 5')
  })

  it('leaves placeholders it has no value for', () => {
    expect(t('tour.step', { current: 1 })).toBe('Step 1 of {total}')
    expect(t('tour.step')).toBe('Step {current} of {total}')
  })

  it('falls back to English for a missing key in a registered locale', () => {
    registerLocale('xx', { 'nav.overview': 'Aperçu' })
    setLocale('xx')
    expect(getLocale()).toBe('xx')
    expect(t('nav.overview')).toBe('Aperçu')
    expect(t('nav.gmail')).toBe('Gmail')
  })

  it('ignores unknown locale codes and stays on English', () => {
    setLocale('zz-nope')
    expect(getLocale()).toBe('en')
    expect(t('common.back')).toBe('Back')
  })
})
