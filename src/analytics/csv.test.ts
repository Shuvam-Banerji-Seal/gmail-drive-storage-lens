// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { planToCsv, sizeQuery, toCsv } from './csv'

describe('toCsv quoting', () => {
  it('uses CRLF line endings and joins cells with commas', () => {
    expect(toCsv([['a', 1, undefined], ['b', 2.5, 'x']])).toBe('a,1,\r\nb,2.5,x\r\n')
  })
  it('returns empty string for no rows', () => {
    expect(toCsv([])).toBe('')
  })
  it('quotes cells containing commas, quotes, CR or LF and doubles quotes', () => {
    expect(toCsv([['x,y', 'say "hi"', 'l1\nl2', 'c\rd']])).toBe('"x,y","say ""hi""","l1\nl2","c\rd"\r\n')
  })
  it('does not quote plain cells', () => {
    expect(toCsv([['plain words', 'a b']])).toBe('plain words,a b\r\n')
  })
})

describe('toCsv injection guard', () => {
  it.each([
    ['=SUM(1,1)'],
    ['+CMD'],
    ['-2+3'],
    ['@SUM(A1)'],
    ['\tTAB'],
    ['\rCR'],
    [' =leading space formula'],
  ])('neutralises %j with a leading apostrophe', (v) => {
    // Cells that also need quoting are wrapped in double quotes, so look past an opening quote.
    const out = toCsv([[v]]).replace(/^"/, '')
    expect(out.startsWith("'")).toBe(true)
  })
  it('neutralises and quotes together', () => {
    expect(toCsv([['=1,2']])).toBe(`"'=1,2"\r\n`)
  })
  it('does not touch numbers or ordinary text', () => {
    expect(toCsv([[-5, 'hello'], ['a=b', 'x-y']])).toBe('-5,hello\r\na=b,x-y\r\n')
  })
})

describe('planToCsv', () => {
  it('writes a header and one row per basket item, guarding labels', () => {
    const csv = planToCsv([
      { kind: 'gmail', id: 'm1', bytes: 1024, label: 'Newsletter' },
      { kind: 'drive', id: 'f1', bytes: 5, label: '=HYPERLINK("http://x")' },
    ])
    expect(csv).toBe(
      'kind,id,bytes,label\r\n' + 'gmail,m1,1024,Newsletter\r\n' + `drive,f1,5,"'=HYPERLINK(""http://x"")"\r\n`,
    )
  })
})

describe('sizeQuery', () => {
  it('uses whole MiB at and above 1 MiB', () => {
    expect(sizeQuery(5 * 2 ** 20)).toBe('larger:5M')
    expect(sizeQuery(2 ** 20)).toBe('larger:1M')
    expect(sizeQuery(1.5 * 2 ** 30)).toBe('larger:1536M')
  })
  it('rounds MiB up so the term is never looser than the size', () => {
    expect(sizeQuery(5 * 2 ** 20 + 1)).toBe('larger:6M')
  })
  it('uses KiB below 1 MiB', () => {
    expect(sizeQuery(2 ** 20 - 1)).toBe('larger:1024k')
    expect(sizeQuery(2 ** 20 - 1024)).toBe('larger:1023k')
    expect(sizeQuery(1024)).toBe('larger:1k')
    expect(sizeQuery(1)).toBe('larger:1k')
    expect(sizeQuery(0)).toBe('larger:0k')
  })
  it('rejects negative and non-finite sizes', () => {
    expect(() => sizeQuery(-1)).toThrow(RangeError)
    expect(() => sizeQuery(Number.NaN)).toThrow(RangeError)
    expect(() => sizeQuery(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })
})
