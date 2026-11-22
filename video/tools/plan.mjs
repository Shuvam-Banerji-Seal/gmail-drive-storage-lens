// Lays the narration out on a timeline and resolves named cues (spoken words) to seconds.
// usage: node video/tools/plan.mjs   (reads video/build/vo/words.json or the committed video/data/words.json, writes video/build/timeline.json)
// The picture, the music and the sound effects all read that one file, so they cannot drift apart.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const wordsFile = existsSync(join(ROOT, 'build/vo/words.json')) ? join(ROOT, 'build/vo/words.json') : join(ROOT, 'data/words.json')
const words = JSON.parse(readFileSync(wordsFile, 'utf8'))

const FPS = 30
const BPM = 120
const GRID = 0.25 // scene boundaries snap to a sixteenth-note-ish grid so cuts land on the music
const TEMPO = 1.05 // the narration is sped up by 5% (pitch preserved) for a tighter promo pace
const END_CARD = 2.5
const QUOTE_HOLD = 0.8

// scenes in order: which narration lines they carry and how long the picture leads the voice
const SCENES = [
  { id: 'problem', lines: [0, 1, 2], pre: 0.85 },
  { id: 'reveal', lines: [3], pre: 1.1 },
  { id: 'private', lines: [4], pre: 0.3 },
  { id: 'explore', lines: [5], pre: 0.25 },
  { id: 'find', lines: [6], pre: 0.25 },
  { id: 'airlock', lines: [7], pre: 0.3 },
  { id: 'open', lines: [8], pre: 0.25 },
  { id: 'quote', lines: [9], pre: 0.6 },
]
const INNER_GAP = 0.25 // between two lines of the same scene
const SCENE_GAP = 0.1 // after the last word before the next scene's cut

const snapUp = (t) => Math.ceil(t / GRID - 1e-9) * GRID

const lines = words.map((l, i) => {
  const s0 = l.speech[0] / TEMPO
  const s1 = l.speech[1] / TEMPO
  return {
    i,
    text: l.text,
    file: `line_${String(i).padStart(3, '0')}.wav`,
    trim: s0, // seconds of leading silence to drop (already tempo-adjusted)
    length: s1 - s0, // speech duration after tempo
    words: l.words.map((w) => ({ w: w.w, s: w.s / TEMPO - s0, e: w.e / TEMPO - s0 })), // relative to speech start
    start: 0,
    end: 0,
  }
})

const scenes = []
let prevEnd = 0
for (const sc of SCENES) {
  const start = scenes.length === 0 ? 0 : snapUp(prevEnd + SCENE_GAP)
  let cursor = start + sc.pre
  for (const [k, li] of sc.lines.entries()) {
    if (k > 0) cursor += INNER_GAP
    lines[li].start = cursor
    lines[li].end = cursor + lines[li].length
    cursor = lines[li].end
  }
  prevEnd = cursor
  scenes.push({ id: sc.id, start, lines: sc.lines })
}
const quoteEnd = lines[9].end
const endCardStart = snapUp(quoteEnd + QUOTE_HOLD)
const duration = Math.ceil((endCardStart + END_CARD) * FPS) / FPS
scenes.push({ id: 'end', start: endCardStart, lines: [] })
for (let i = 0; i < scenes.length; i++) scenes[i].end = i + 1 < scenes.length ? scenes[i + 1].start : duration

// cue name -> [line, regex of the word, which occurrence]
const CUE_WORDS = {
  full: [0, /^full/],
  sliver: [1, /^sliver/],
  weight: [1, /^weight/],
  gmail: [1, /^Gmail/],
  years: [1, /^years/],
  chains: [1, /^chains/],
  again: [1, /^again/],
  tells: [2, /^tells/],
  never: [2, /^never/],
  why: [2, /^why/],
  meet: [3, /^Meet/],
  lens: [3, /^Lens/],
  browser: [4, /^browser/],
  client: [4, /^client/],
  noserver: [4, /^server/],
  tracking: [4, /^tracking/],
  senders: [5, /^See/],
  inbox: [5, /^inbox/],
  rivers: [5, /^Follow/],
  action: [5, /^action/],
  tides: [5, /^watch/],
  month: [5, /^month/],
  lasso: [6, /^Lasso/],
  dups: [6, /^duplicate/],
  ghosts: [6, /^hidden/],
  select: [7, /^clean/],
  protect: [7, /^Starred/],
  sent: [7, /^sent/],
  trash: [7, /^Trash/],
  undo: [7, /^undo/],
  type: [7, /^Permanent/],
  free: [8, /^Free/],
  open: [8, /^Open/],
  verify: [8, /^Verifiable/],
  quote: [9, /^Your/],
  love: [9, /^love/],
  forgot: [9, /^forgot/],
}
const cues = {}
for (const [name, [li, re]] of Object.entries(CUE_WORDS)) {
  const w = lines[li].words.find((x) => re.test(x.w))
  if (!w) throw new Error(`cue ${name}: no word matches ${re} in line ${li}`)
  cues[name] = { s: lines[li].start + w.s, e: lines[li].start + w.e }
}
for (const sc of scenes) cues[`scene.${sc.id}`] = { s: sc.start, e: sc.start }

const timeline = { fps: FPS, bpm: BPM, beat: 60 / BPM, tempo: TEMPO, duration, lines, scenes, cues }
mkdirSync(join(ROOT, 'build'), { recursive: true })
writeFileSync(join(ROOT, 'build/timeline.json'), JSON.stringify(timeline, null, 1))
console.log(`duration ${duration.toFixed(2)} s, ${Math.round(duration * FPS)} frames`)
for (const sc of scenes) console.log(`${sc.id.padEnd(8)} ${sc.start.toFixed(2).padStart(6)} - ${sc.end.toFixed(2).padStart(6)}`)
