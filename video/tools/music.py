"""Original score and sound effects for the teaser, generated in code (additive / FM synthesis, filtered noise).

No samples, no recordings, nothing to license: every sound is computed here. It reads video/build/timeline.json, so the
music changes key, builds and drops on exactly the same cues as the picture.

usage:  python3 video/tools/music.py [--timeline video/build/timeline.json] [--out video/build/audio]
writes:  <out>/bed.wav (music, stereo 48 kHz) and <out>/fx.wav (sound effects), both as long as the film.

Structure (A minor / C major, 120 BPM):
  problem  tense: low pad on Am - F - Dm - E, a clock-like tick, a riser, then a breath of silence
  reveal   the drop: sub boom + cymbal, C major 9, a plucked arpeggio, the beat enters
  features groove on C - G - Am - F: kick, bass, plucks, claps, higher bells as the film opens up
  airlock  the beat strips back while the confirmation is typed, and returns when the bar falls under the limit
  quote    breakdown: a quiet pad and a few bell notes; resolution to C major on the end card
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

SR = 48000
RNG = np.random.default_rng(1234)


def mtof(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def tarr(n: int) -> np.ndarray:
    return np.arange(n) / SR


def lp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, "lowpass", fs=SR, output="sos"), x)


def hp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, "highpass", fs=SR, output="sos"), x)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(signal.butter(order, [lo, hi], "bandpass", fs=SR, output="sos"), x)


def noise(n: int) -> np.ndarray:
    return RNG.standard_normal(n)


# ---------------------------------------------------------------------------------------------------------------------
# instruments (all return mono float arrays)
# ---------------------------------------------------------------------------------------------------------------------
def kick(power=1.0):
    n = int(0.5 * SR)
    t = tarr(n)
    f = 44 + 120 * np.exp(-t / 0.032)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.17)
    click = hp(noise(n), 2500) * np.exp(-t / 0.0025) * 0.22
    return power * (body + click)


def hat(open_=False):
    n = int((0.30 if open_ else 0.06) * SR)
    t = tarr(n)
    return hp(noise(n), 7500, 3) * np.exp(-t / (0.09 if open_ else 0.014))


def clap():
    n = int(0.28 * SR)
    t = tarr(n)
    bursts = sum(np.exp(-np.maximum(t - d, 0) / 0.006) * (t >= d) for d in (0.0, 0.011, 0.022))
    tail = np.exp(-t / 0.07) * (t >= 0.03)
    return bp(noise(n), 1100, 3600) * (bursts * 0.55 + tail * 0.5)


def bass(f, dur):
    n = int(dur * SR)
    t = tarr(n)
    env = np.minimum(t / 0.006, 1) * np.exp(-t / (dur * 0.55)) * np.minimum((dur - t) / 0.03, 1)
    return (np.sin(2 * np.pi * f * t) + 0.32 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)) * env


def pluck(f, dur=0.55):
    n = int(dur * SR)
    t = tarr(n)
    idx = 2.2 * np.exp(-t * 11)
    x = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t)) * np.exp(-t * 7.5)
    return x + 0.25 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 12)


def bell(f, dur=2.4, bright=1.0):
    n = int(dur * SR)
    t = tarr(n)
    idx = 3.6 * bright * np.exp(-t * 2.6)
    x = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * 3.5 * f * t)) * np.exp(-t * 1.5)
    x += 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 2.2)
    return x * np.minimum(t / 0.003, 1)


def pad(freqs, dur, attack=0.7, release=0.9, bright=1.0):
    n = int((dur + release) * SR)
    t = tarr(n)
    out = np.zeros(n)
    for k, f in enumerate(freqs):
        for cents in (-5, 0, 5):
            ff = f * 2 ** (cents / 1200)
            ph = RNG.uniform(0, 2 * np.pi)
            for h, amp in ((1, 1.0), (2, 0.45 * bright), (3, 0.22 * bright), (4, 0.1 * bright)):
                out += amp / (1 + 0.15 * k) * np.sin(2 * np.pi * ff * h * t + ph * h)
    env = np.minimum(t / attack, 1) * np.minimum(np.maximum((dur + release - t) / release, 0), 1)
    lfo = 1 + 0.06 * np.sin(2 * np.pi * 0.23 * t)
    return out * env * lfo / (len(freqs) * 3)


def sub(f, dur):
    n = int(dur * SR)
    t = tarr(n)
    return np.sin(2 * np.pi * f * t) * np.minimum(t / 0.01, 1) * np.exp(-t / (dur * 0.4))


def swept_noise(dur, f0, f1, width=0.5):
    """Band-limited noise whose centre frequency glides from f0 to f1 (overlap-add of filtered slices)."""
    n = int(dur * SR)
    slice_n = 2048
    hop = slice_n // 2
    win = np.hanning(slice_n)
    src = noise(n + slice_n)
    out = np.zeros(n + slice_n)
    nslices = max(1, n // hop)
    for i in range(nslices):
        u = i / max(1, nslices - 1)
        fc = f0 * (f1 / f0) ** u
        lo, hi = fc * (1 - width / 2), min(fc * (1 + width / 2), SR / 2 - 100)
        seg = src[i * hop : i * hop + slice_n]
        spec = np.fft.rfft(seg * win)
        freqs = np.fft.rfftfreq(slice_n, 1 / SR)
        spec *= ((freqs > lo) & (freqs < hi)).astype(float)
        out[i * hop : i * hop + slice_n] += np.fft.irfft(spec) * win
    return out[:n]


def reverb_ir(seconds=2.8, tau=0.5):
    n = int(seconds * SR)
    t = tarr(n)
    ir = np.stack([noise(n), noise(n)]) * np.exp(-t / tau)
    for ch in range(2):
        spec = np.fft.rfft(ir[ch])
        f = np.fft.rfftfreq(n, 1 / SR)
        ir[ch] = np.fft.irfft(spec * np.exp(-f / 5200))
    ir[:, : int(0.018 * SR)] = 0
    for d, a in ((0.031, 0.5), (0.047, 0.4), (0.061, 0.3)):
        ir[0, int(d * SR)] += a
        ir[1, int(d * 1.13 * SR)] += a
    return ir / np.sqrt((ir**2).sum() / 2) * 0.55


def convolve_stereo(x, ir):
    n = x.shape[1] + ir.shape[1]
    size = 1 << (n - 1).bit_length()
    out = np.zeros((2, x.shape[1]))
    for ch in range(2):
        y = np.fft.irfft(np.fft.rfft(x[ch], size) * np.fft.rfft(ir[ch], size), size)
        out[ch] = y[: x.shape[1]]
    return out


# ---------------------------------------------------------------------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser()
    root = Path(__file__).resolve().parents[1]
    built = root / "build/timeline.json"
    ap.add_argument("--timeline", default=str(built if built.exists() else root / "data/timeline.json"))
    ap.add_argument("--out", default=str(root / "build/audio"))
    args = ap.parse_args()
    T = json.loads(Path(args.timeline).read_text())
    D = T["duration"]
    N = int((D + 3.5) * SR)  # tail for reverb
    cue = lambda n: T["cues"][n]["s"]  # noqa: E731
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    pad_bus = np.zeros((2, N))   # pads (pumped by the kick, reverberated)
    low_bus = np.zeros((2, N))   # bass and kick (dry)
    arp_bus = np.zeros((2, N))   # plucks and bells (pumped, reverberated)
    drum_bus = np.zeros((2, N))  # hats, claps (dry)
    fx_bus = np.zeros((2, N))    # sound effects (dry)
    fx_wet = np.zeros((2, N))    # sound effects sent to the reverb

    def put(bus, t0, x, gain=1.0, pan=0.0):
        i0 = int(t0 * SR)
        if i0 >= N or i0 + len(x) <= 0:
            return
        if i0 < 0:
            x = x[-i0:]
            i0 = 0
        n = min(len(x), N - i0)
        a = (pan + 1) * np.pi / 4
        bus[0, i0 : i0 + n] += x[:n] * gain * np.cos(a)
        bus[1, i0 : i0 + n] += x[:n] * gain * np.sin(a)

    BEAT = T["beat"]
    CH = {  # chord tones (MIDI)
        "Am": [45, 52, 57, 60, 64], "F": [41, 48, 53, 57, 60], "C": [48, 55, 60, 64, 67], "G": [43, 50, 55, 59, 62],
        "Dm": [38, 45, 50, 53, 57], "E": [40, 47, 52, 56, 59], "Cmaj9": [48, 55, 59, 62, 64, 71], "Fadd9": [41, 48, 53, 57, 60, 67],
    }
    ROOT = {"Am": 45, "F": 41, "C": 36, "G": 43, "Dm": 38, "E": 40, "Cmaj9": 36}

    # ---- chord map over time ----
    t_rev, t_priv, t_open, t_quote, t_end = cue("scene.reveal"), cue("scene.private"), cue("scene.open"), cue("scene.quote"), cue("scene.end")
    segs = [(0.0, 4.0, "Am"), (4.0, 8.0, "F"), (8.0, 12.0, "Dm"), (12.0, t_rev, "E"), (t_rev, t_priv, "Cmaj9")]
    groove = ["C", "G", "Am", "F"]
    t = t_priv
    k = 0
    while t < t_quote - 1e-6:
        e = min(t + 2 * BEAT * 2, t_quote)
        segs.append((t, e, groove[k % 4]))
        t = e
        k += 1
    segs += [(t_quote, t_quote + 2.0, "Am"), (t_quote + 2.0, t_quote + 4.0, "F"), (t_quote + 4.0, t_end, "Dm"), (t_end, D + 0.5, "Cmaj9")]

    def chord_at(tt):
        for a, b, name in segs:
            if a <= tt < b:
                return name
        return "C"

    # ---- pads ----
    for a, b, name in segs:
        quiet = 0.55 if a >= t_quote else (0.8 if a < t_rev else 1.0)
        put(pad_bus, a - 0.25, pad([mtof(m) for m in CH[name]], b - a + 0.25, bright=0.8 if a < t_rev else 1.2), 0.5 * quiet, 0)

    # ---- the tense opening: clock tick, thud on "full", riser, the breath before the drop ----
    t0 = 0.85
    while t0 < t_rev - 0.6:
        put(drum_bus, t0, hp(noise(int(0.02 * SR)), 5000) * np.exp(-tarr(int(0.02 * SR)) / 0.004), 0.16 + 0.1 * (t0 / t_rev), 0.2 * (-1) ** int(t0 / BEAT))
        t0 += BEAT
    for t0 in np.arange(0.85, t_rev - 0.8, 2 * BEAT * 2):  # a slow sub pulse on each bar
        put(low_bus, t0, sub(mtof(ROOT[chord_at(t0)] - 12 + 12), 0.9), 0.3, 0)
    put(fx_bus, cue("full") - 0.02, sub(52, 0.9), 0.9, 0)
    put(fx_wet, cue("full"), bell(mtof(81), 1.6, 0.8) * 0.5 + bell(mtof(82), 1.6, 0.8) * 0.5, 0.18, -0.3)
    for i in range(26):  # mosaic: a shimmer of small blips as the tiles fill in
        tt = cue("gmail") + 0.62 + i * 0.045
        note = [76, 79, 81, 84, 88][int(RNG.integers(0, 5))]
        put(fx_wet, tt, pluck(mtof(note), 0.25), 0.07, float(RNG.uniform(-0.8, 0.8)))
    for i, m in enumerate([74, 77, 81, 86]):  # the reply chain: four plucks, one per card
        put(fx_wet, cue("again") - 0.05 + i * 0.42 + 0.1, pluck(mtof(m), 0.6), 0.2, -0.5 + i * 0.33)
    put(fx_wet, cue("chains"), bell(mtof(69), 2.0), 0.2, 0)
    put(fx_bus, cue("tells") - 0.1, sub(46, 1.2), 0.5, 0)
    for i in range(5):
        put(fx_bus, cue("never") - 0.05 + i * 0.16 + 0.05, pluck(mtof(57 - i), 0.3), 0.1, 0.4 - i * 0.2)
    put(fx_wet, cue("why") + 0.0, bell(mtof(76), 2.0), 0.16, 0.2)
    put(fx_wet, cue("why") + 0.18, bell(mtof(83), 2.0), 0.12, -0.2)
    rise = t_rev - 0.14 - 11.3  # riser into the drop
    riser = swept_noise(rise, 300, 9000, 0.9) * np.linspace(0, 1, int(rise * SR)) ** 2.2
    put(fx_wet, 11.3, riser, 0.5, 0)
    tt = tarr(int(rise * SR))
    put(fx_bus, 11.3, np.sin(2 * np.pi * np.cumsum(mtof(45) * 2 ** (tt / rise * 2)) / SR) * (tt / rise) ** 2.5, 0.12, 0)

    # ---- the drop on the reveal ----
    put(low_bus, t_rev, sub(40, 2.2) * 1.2, 0.75, 0)
    put(fx_bus, t_rev, kick(1.2), 0.8, 0)
    crash = hp(noise(int(3.2 * SR)), 4500, 2) * np.exp(-tarr(int(3.2 * SR)) / 0.9)
    put(fx_wet, t_rev, crash, 0.35, 0)
    for i, m in enumerate([72, 76, 79, 83, 86, 83, 79, 76, 72, 76, 79, 83]):  # C major 9 arpeggio while the mark draws
        put(arp_bus, t_rev + 0.3 + i * 0.25, pluck(mtof(m), 0.7), 0.26, -0.5 + 0.1 * (i % 11))
        put(arp_bus, t_rev + 0.3 + i * 0.25 + 0.375, pluck(mtof(m), 0.7), 0.1, 0.5 - 0.1 * (i % 11))
    L3 = T["lines"][3]
    for w, m in zip(L3["words"][1:], (79, 83, 88)):
        put(fx_wet, L3["start"] + w["s"], bell(mtof(m), 1.8, 0.7), 0.16, 0.0)

    # ---- the groove ----
    t_type = cue("type") - 0.25
    t_conf = t_type + 1.15
    strip_a, strip_b = t_type - 0.3, t_conf
    groove_spans = [(t_rev + 2.0, strip_a), (strip_b, t_quote - 0.5)]

    def in_groove(tt, margin=0.0):
        return any(a - 1e-6 <= tt < b - margin for a, b in groove_spans)

    pump_times = []
    beat_t = t_rev + 2.0
    kick_s = kick(0.9)
    while beat_t < t_quote - 0.5:
        if in_groove(beat_t):
            soft = 0.5 if beat_t < t_priv else 0.78
            put(low_bus, beat_t, kick_s, soft, 0)
            pump_times.append(beat_t)
        beat_t += BEAT
    # offbeat hats from the first feature, ghost sixteenths and claps once the film is moving
    tt = t_priv
    while tt < t_quote - 0.5:
        if in_groove(tt):
            ph = ((tt - t_priv) / BEAT)
            if abs(ph - round(ph)) < 1e-3:
                put(drum_bus, tt + BEAT / 2, hat(), 0.2, 0.25)
                if tt >= cue("scene.explore") and int(round(ph)) % 2 == 1:
                    put(drum_bus, tt, clap(), 0.3, -0.1)
                if tt >= cue("scene.explore"):
                    put(drum_bus, tt + BEAT / 4, hat(), 0.07, -0.3)
                    put(drum_bus, tt + 3 * BEAT / 4, hat(), 0.07, 0.3)
                if int(round(ph)) % 8 == 7:
                    put(drum_bus, tt + BEAT / 2, hat(True), 0.2, 0.2)
        tt += BEAT
    # bass
    tt = t_priv
    while tt < t_quote - 0.5:
        if in_groove(tt):
            r = mtof(ROOT[chord_at(tt)])
            put(low_bus, tt, bass(r, 0.4), 0.5, 0)
            put(low_bus, tt + BEAT / 2, bass(r * 2, 0.16), 0.2, 0)
        tt += BEAT
    # plucked arpeggio (eighths in the first feature, sixteenths afterwards, a thin line while the confirmation is typed)
    pat = [0, 2, 4, 2, 1, 3, 5, 3]
    step_i = 0
    tt = t_priv
    while tt < t_quote - 0.5:
        sixteenth = tt >= cue("scene.explore")
        step = BEAT / 4 if sixteenth else BEAT / 2
        name = chord_at(tt)
        tones = [m + 12 for m in CH[name]] + [CH[name][0] + 24]
        thin = strip_a <= tt < strip_b
        if in_groove(tt) or thin:
            idx = pat[step_i % 8] % len(tones)
            amp = (0.17 if not sixteenth else 0.13) * (1.35 if step_i % 4 == 0 else 1.0)
            if thin:
                amp, idx = (0.1, 0) if step_i % 4 == 0 else (0, 0)
            if amp:
                f = mtof(tones[idx])
                put(arp_bus, tt, pluck(f, 0.5), amp, -0.4 if step_i % 2 else 0.4)
                put(arp_bus, tt + 3 * BEAT / 4, pluck(f, 0.5), amp * 0.33, 0.4 if step_i % 2 else -0.4)
        step_i += 1
        tt += step
    # bells above the groove once the film opens out
    tt = cue("scene.find")
    while tt < t_quote - 0.5:
        if in_groove(tt) and abs(((tt - t_priv) / BEAT) % 2) < 1e-3:
            name = chord_at(tt)
            put(arp_bus, tt, bell(mtof(CH[name][3] + 24), 1.6, 0.6), 0.12, 0.3 * (-1) ** int(tt))
        tt += BEAT
    # strip-back and release around the typed confirmation
    put(fx_wet, strip_a - 0.1, hp(noise(int(0.9 * SR)), 4000) * np.exp(-tarr(int(0.9 * SR)) / 0.3), 0.1, 0)
    rise2 = swept_noise(t_conf - strip_a, 400, 8000, 0.8) * np.linspace(0, 1, int((t_conf - strip_a) * SR)) ** 2
    put(fx_wet, strip_a, rise2, 0.22, 0)
    for k_ in range(10):  # typed characters
        tk = t_type + k_ * 0.1
        click = bp(noise(int(0.03 * SR)), 1800, 6000) * np.exp(-tarr(int(0.03 * SR)) / 0.006)
        thock = np.sin(2 * np.pi * (170 + 15 * (k_ % 3)) * tarr(int(0.05 * SR))) * np.exp(-tarr(int(0.05 * SR)) / 0.012)
        key = np.zeros(len(thock))
        key[: len(click)] += click * 0.7
        put(fx_bus, tk, key + thock * 0.5, 0.35, 0.3 + 0.05 * (k_ % 3))
    put(fx_bus, t_conf, kick(1.0), 0.9, 0)
    put(fx_bus, t_conf, sub(46, 1.1), 0.7, 0)
    put(fx_wet, t_conf, hp(noise(int(1.6 * SR)), 5000) * np.exp(-tarr(int(1.6 * SR)) / 0.4), 0.22, 0)
    for i, m in enumerate([84, 88, 91, 96]):  # success arpeggio as the bar falls
        put(fx_wet, t_conf + 0.55 + i * 0.1, bell(mtof(m), 2.2, 0.8), 0.17, -0.3 + i * 0.2)

    # ---- sound effects keyed to the picture ----
    def whoosh(tc, dur=0.5, gain=0.5):
        x = swept_noise(dur, 250, 5500, 0.9) * np.sin(np.pi * np.linspace(0, 1, int(dur * SR))) ** 1.5
        n = len(x)
        a = np.linspace(-0.8, 0.8, n)  # the scan line travels left to right
        i0 = int((tc - dur / 2) * SR)
        fx_bus[0, i0 : i0 + n] += x * gain * np.cos((a + 1) * np.pi / 4)
        fx_bus[1, i0 : i0 + n] += x * gain * np.sin((a + 1) * np.pi / 4)

    for name, g_ in (("private", 0.5), ("find", 0.5), ("airlock", 0.5), ("open", 0.45), ("quote", 0.3), ("end", 0.3)):
        whoosh(cue(f"scene.{name}"), 0.5, g_)
    whoosh(cue("rivers") - 0.1, 0.5, 0.5)
    whoosh(cue("tides") - 0.1, 0.5, 0.5)
    whoosh(cue("dups") - 0.1, 0.5, 0.5)
    pent = [69, 72, 74, 76, 79, 81, 84]
    for i in range(34):  # constellation nodes pop in
        put(fx_wet, cue("senders") + 0.05 + i * 0.022 + 0.08, pluck(mtof(pent[int(RNG.integers(0, 7))] + 12), 0.3), 0.09, float(RNG.uniform(-0.7, 0.7)))
    put(fx_wet, cue("inbox"), bell(mtof(81), 2.0), 0.2, 0.2)
    sk = swept_noise(1.9, 500, 3500, 0.5) * np.sin(np.pi * np.linspace(0, 1, int(1.9 * SR))) ** 2
    put(fx_wet, cue("rivers") + 0.0, sk, 0.28, 0)
    span = cue("month") + 0.5 - cue("tides") - 0.1
    t_spike = cue("tides") + 0.1 + (17 / 41) * span + 0.4
    put(fx_wet, cue("tides") + 0.1, swept_noise(span, 200, 2500, 0.6) * np.sin(np.pi * np.linspace(0, 1, int(span * SR))) ** 1.3, 0.2, 0)
    put(fx_wet, t_spike, bell(mtof(88), 1.8), 0.18, 0.2)
    # lasso
    lasso = hp(noise(int(1.25 * SR)), 2500) * np.sin(np.pi * np.linspace(0, 1, int(1.25 * SR))) ** 1.2
    put(fx_bus, cue("lasso"), lasso, 0.14, 0.2)
    put(fx_wet, cue("lasso") + 1.15, bell(mtof(86), 1.8), 0.2, 0)
    for i in range(3):  # twins
        put(fx_wet, cue("dups") - 0.05 + i * 0.16 + 0.15, bell(mtof([79, 83, 86][i]), 1.4), 0.15, -0.4 + i * 0.4)
    put(fx_wet, cue("dups") + 0.6, bell(mtof(91), 1.6), 0.12, 0)
    for i in range(5):  # ghost layers
        put(fx_wet, cue("ghosts") + 0.1 + i * 0.1, pluck(mtof(60 + i * 2), 0.5), 0.12, 0.2 + 0.1 * i)
    # data flow
    put(fx_wet, cue("browser"), bell(mtof(76), 1.4), 0.08, -0.4)
    put(fx_wet, cue("client"), bell(mtof(83), 1.4), 0.09, 0.0)
    put(fx_bus, cue("noserver"), np.sin(2 * np.pi * np.linspace(220, 110, int(0.25 * SR)).cumsum() / SR) * np.exp(-tarr(int(0.25 * SR)) / 0.1), 0.11, 0)
    for i in range(3):
        put(fx_bus, cue("tracking") - 0.05 + i * 0.2 + 0.1, pluck(mtof(64 - i * 2), 0.25), 0.06, -0.3 + 0.3 * i)
    # airlock
    put(fx_wet, cue("select"), bell(mtof(79), 1.6), 0.15, -0.4)
    for k_ in range(4):
        put(fx_bus, cue("protect") + 0.45 + k_ * 0.12, bell(mtof(96), 0.35, 0.5) * 0.6, 0.12, -0.3 + k_ * 0.2)
    put(fx_bus, cue("trash") + 0.05, sub(60, 0.5), 0.5, 0)
    put(fx_wet, cue("trash") + 0.05, bp(noise(int(0.5 * SR)), 600, 4500) * np.exp(-tarr(int(0.5 * SR)) / 0.12), 0.1, 0)
    put(fx_wet, cue("undo") + 0.1, swept_noise(0.5, 400, 2400, 0.5) * np.sin(np.pi * np.linspace(0, 1, int(0.5 * SR))), 0.12, 0)
    put(fx_wet, cue("undo") + 0.25, bell(mtof(79), 1.4), 0.12, 0.3)
    # open
    for key, m in (("free", 84), ("open", 88), ("verify", 91)):
        put(fx_wet, cue(key), bell(mtof(m), 2.2), 0.12, {"free": -0.4, "open": 0.0, "verify": 0.4}[key])
    # quote and end
    for i, m in enumerate([76, 72, 69, 76, 74]):
        put(fx_wet, t_quote + 0.7 + i * 1.0, bell(mtof(m), 3.2, 0.5), 0.17, -0.2 + 0.1 * i)
    put(low_bus, cue("forgot") - 0.05, sub(mtof(33), 2.0), 0.7, 0)
    put(fx_wet, cue("forgot"), bell(mtof(69), 3.0, 0.5), 0.24, 0)
    put(low_bus, t_end, sub(mtof(36), 2.4), 0.55, 0)
    for i, m in enumerate([72, 76, 79, 83, 86, 91]):
        put(arp_bus, t_end + 0.1 + i * 0.2, bell(mtof(m), 2.6, 0.7), 0.2, -0.5 + 0.2 * i)
    put(fx_wet, t_end, hp(noise(int(2.5 * SR)), 5000) * np.exp(-tarr(int(2.5 * SR)) / 0.8), 0.15, 0)

    # ---- sidechain pump: pads, bass and plucks duck briefly on every kick ----
    pump = np.ones(N)
    for kt in pump_times + [t_rev, t_conf]:
        i0 = int(kt * SR)
        n = int(0.28 * SR)
        if i0 + n < N:
            pump[i0 : i0 + n] = np.minimum(pump[i0 : i0 + n], 1 - 0.5 * np.exp(-tarr(n) / 0.09))
    # a breath of silence just before the drop
    gap0, gap1 = t_rev - 0.2, t_rev - 0.01
    pump[int(gap0 * SR) : int(gap1 * SR)] *= 0.0
    # build the beds
    bed = (pad_bus + arp_bus) * pump + low_bus + drum_bus
    wet_in = pad_bus * pump * 0.9 + arp_bus * pump + fx_wet
    wet = convolve_stereo(wet_in, reverb_ir())
    bed += wet * 0.55
    fx = fx_bus + convolve_stereo(fx_wet, reverb_ir(2.2, 0.4)) * 0.4 + fx_wet * 0.55
    # fade the end
    fade_n = int(1.4 * SR)
    end_i = int(D * SR)
    for arr in (bed, fx):
        arr[:, end_i - fade_n : end_i] *= np.linspace(1, 0, fade_n)
        arr[:, end_i:] = 0
        arr[:, 0 : int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))

    # soft limit only: the balance between music and effects is the one written above, final loudness is set when mixing
    def finish(x):
        return np.tanh(x * 0.85) / 0.85

    bed = finish(bed[:, :end_i])
    fx = finish(fx[:, :end_i])
    sf.write(out_dir / "bed.wav", bed.T.astype(np.float32), SR, subtype="FLOAT")
    sf.write(out_dir / "fx.wav", fx.T.astype(np.float32), SR, subtype="FLOAT")
    print(f"bed.wav + fx.wav written, {D:.2f} s, peaks {np.abs(bed).max():.2f} / {np.abs(fx).max():.2f}, rms {np.sqrt((bed**2).mean()):.3f} / {np.sqrt((fx**2).mean()):.3f}")


if __name__ == "__main__":
    main()
