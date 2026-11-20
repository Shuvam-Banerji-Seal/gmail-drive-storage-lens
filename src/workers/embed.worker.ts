// SPDX-License-Identifier: AGPL-3.0-or-later
// Runs the subject embedding off the main thread so the Nebula tab stays responsive while UMAP works.
import { embed2d } from '../analytics/embed'

export interface EmbedRequest {
  texts: string[]
  seed: number
}

export interface EmbedResponse {
  points: Array<[number, number]>
}

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<EmbedRequest>) => void) | null
  postMessage: (msg: EmbedResponse) => void
}

scope.onmessage = (e) => {
  const points = embed2d(e.data.texts, e.data.seed)
  scope.postMessage({ points })
}
