// SPDX-License-Identifier: AGPL-3.0-or-later
/** Save text or a blob as a file, entirely client-side. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function downloadText(text: string, filename: string, type = 'text/csv;charset=utf-8'): void {
  downloadBlob(new Blob([text], { type }), filename)
}
