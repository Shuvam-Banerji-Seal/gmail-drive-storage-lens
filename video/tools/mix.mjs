// Assembles the soundtrack: narration lines placed on the timeline, music and effects ducked under the voice, loudness set.
// usage: node video/tools/mix.mjs   (needs ffmpeg; reads build/timeline.json, build/vo/*.wav, build/audio/{bed,fx}.wav)
// writes: build/audio/{voice,bed_ducked,fx_ducked}.wav (stems for checking) and build/audio/final.wav (stereo, 48 kHz)
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const B = (p) => join(ROOT, 'build', p)
const T = JSON.parse(readFileSync(B('timeline.json'), 'utf8'))
const words = JSON.parse(readFileSync(B('vo/words.json'), 'utf8'))
const D = T.duration

const run = (args) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`)
}
/** Integrated loudness (LUFS) and true peak of a file, from ffmpeg's loudnorm analysis pass. */
function measure(file, I = -23) {
  const r = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-nostats', '-i', file, '-af', `loudnorm=I=${I}:TP=-1.5:LRA=11:print_format=json`, '-f', 'null', '-'],
    { encoding: 'utf8' },
  )
  const m = r.stderr.match(/\{[\s\S]*?\}/g)
  return JSON.parse(m[m.length - 1])
}

// ---- 1. voice: each line trimmed to its speech, sped up 5%, placed at its start time ----------------------------
const inputs = []
const chains = []
T.lines.forEach((L, i) => {
  const s0 = Math.max(0, words[i].speech[0] - 0.02)
  const delay = Math.max(0, Math.round((L.start - 0.02 / T.tempo) * 1000))
  inputs.push('-i', B(`vo/${L.file}`))
  chains.push(
    `[${i}:a]atrim=start=${s0.toFixed(3)},asetpts=PTS-STARTPTS,atempo=${T.tempo},aresample=48000,` +
      `highpass=f=80,equalizer=f=240:t=q:w=1:g=-1.5,equalizer=f=3400:t=q:w=1:g=2.4,` +
      `afade=t=out:st=${(L.length + 0.02 / T.tempo - 0.06).toFixed(3)}:d=0.06,adelay=delays=${delay}:all=1[v${i}]`,
  )
})
const mixIn = T.lines.map((_, i) => `[v${i}]`).join('')
const voiceGraph =
  `${chains.join(';')};${mixIn}amix=inputs=${T.lines.length}:normalize=0:duration=longest,` +
  `apad=whole_dur=${D},atrim=0:${D},acompressor=threshold=-21dB:ratio=2.6:attack=6:release=140:makeup=2[out]`
run([...inputs, '-filter_complex', voiceGraph, '-map', '[out]', '-ac', '1', '-ar', '48000', B('audio/voice_raw.wav')])
// two-pass loudness on the voice alone: -17 LUFS
const vm = measure(B('audio/voice_raw.wav'), -17)
run([
  '-i',
  B('audio/voice_raw.wav'),
  '-af',
  `loudnorm=I=-17:TP=-2:LRA=7:measured_I=${vm.input_i}:measured_TP=${vm.input_tp}:measured_LRA=${vm.input_lra}:measured_thresh=${vm.input_thresh}:offset=${vm.target_offset}:linear=true,aresample=48000,apad=whole_dur=${D},atrim=0:${D}`,
  '-ar',
  '48000',
  B('audio/voice.wav'),
])

// ---- 2. music and effects: calibrate levels, duck under the voice -------------------------------------------------
const bedM = measure(B('audio/bed.wav'))
const fxM = measure(B('audio/fx.wav'))
const BED_LUFS = -22.5 // before ducking; the sidechain then takes it ~8 dB lower while someone speaks
const FX_LUFS = -28.5
const bedGain = BED_LUFS - parseFloat(bedM.input_i)
const fxGain = FX_LUFS - parseFloat(fxM.input_i)
console.log(
  `voice ${vm.input_i} -> -17 LUFS; bed ${bedM.input_i} (gain ${bedGain.toFixed(1)} dB); fx ${fxM.input_i} (gain ${fxGain.toFixed(1)} dB)`,
)
const duck =
  `[0:a]asplit=3[v][k1][k2];` +
  `[1:a]volume=${bedGain.toFixed(2)}dB[b];[b][k1]sidechaincompress=threshold=0.03:ratio=4:attack=12:release=280:makeup=1:level_sc=1[bd];` +
  `[2:a]volume=${fxGain.toFixed(2)}dB[f];[f][k2]sidechaincompress=threshold=0.035:ratio=3:attack=10:release=200:makeup=1:level_sc=1[fd];` +
  `[v]aformat=channel_layouts=stereo[vs];[vs][bd][fd]amix=inputs=3:normalize=0,alimiter=limit=0.9:level=disabled:latency=1[m]`
run([
  '-i',
  B('audio/voice.wav'),
  '-i',
  B('audio/bed.wav'),
  '-i',
  B('audio/fx.wav'),
  '-filter_complex',
  duck,
  '-map',
  '[m]',
  '-ar',
  '48000',
  B('audio/premaster.wav'),
])
// final loudness: -16 LUFS integrated, true peak below -1.5 dB, two passes
const pm = measure(B('audio/premaster.wav'), -16)
run([
  '-i',
  B('audio/premaster.wav'),
  '-af',
  `loudnorm=I=-16:TP=-1.5:LRA=9:measured_I=${pm.input_i}:measured_TP=${pm.input_tp}:measured_LRA=${pm.input_lra}:measured_thresh=${pm.input_thresh}:offset=${pm.target_offset}:linear=true,aresample=48000,apad=whole_dur=${D},atrim=0:${D}`,
  '-ar',
  '48000',
  B('audio/final.wav'),
])
const fm = measure(B('audio/final.wav'), -16)
console.log(`final: ${fm.input_i} LUFS, true peak ${fm.input_tp} dBTP, LRA ${fm.input_lra}`)
