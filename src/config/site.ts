// SPDX-License-Identifier: AGPL-3.0-or-later
export const REPO_URL = 'https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens'
export const SITE_URL = 'https://shuvam-banerji-seal.github.io/gmail-drive-storage-lens/'
export const COMMIT = (import.meta.env.VITE_COMMIT ?? 'dev').slice(0, 40)
export const SOURCE_URL = COMMIT === 'dev' ? REPO_URL : `${REPO_URL}/tree/${COMMIT}`
export const APP_NAME = 'Gmail Storage Lens'
