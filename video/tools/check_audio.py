"""Checks the finished soundtrack: loudness, how far the music sits under the voice while someone speaks, and how loud
it is in the pauses.  usage: python3 video/tools/check_audio.py"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

B = Path(__file__).resolve().parents[1] / "build"
T = json.loads((B / "timeline.json").read_text())
final, sr = sf.read(B / "audio/final.wav")
voice, _ = sf.read(B / "audio/voice.wav")
mono = final.mean(1)
n = min(len(mono), len(voice))
mono, voice = mono[:n], voice[:n]
# the mix may be delayed by a few samples (limiter lookahead): find the lag first
c = signal.correlate(mono[: sr * 20], voice[: sr * 20], mode="full", method="fft")
lag = int(np.argmax(c)) - (sr * 20 - 1)
voice = np.roll(voice, lag)
g = float((mono * voice).sum() / (voice * voice).sum())
res = mono - g * voice
db = lambda x: 20 * np.log10(np.sqrt((x**2).mean()) + 1e-9)  # noqa: E731
print(f"lag {lag} samples ({lag / sr * 1000:.1f} ms), voice gain in the mix {20 * np.log10(abs(g) + 1e-9):+.1f} dB")
# speech band only (300 Hz - 4 kHz): kick and bass live below it and do not mask words
sos = signal.butter(4, [300, 4000], "bandpass", fs=sr, output="sos")
vb, rb = signal.sosfilt(sos, g * voice), signal.sosfilt(sos, res)
ratios, broad = [], []
for L in T["lines"]:
    a, b = int(L["start"] * sr), int(L["end"] * sr)
    rv, rm = db(vb[a:b]), db(rb[a:b])
    ratios.append(rv - rm)
    broad.append(db(g * voice[a:b]) - db(res[a:b]))
    print(f"line {L['i']}: speech band voice {rv:6.1f} dB  music+fx {rm:6.1f} dB  voice over music {rv - rm:5.1f} dB (broadband {broad[-1]:5.1f})")
print(f"voice over music while speaking, speech band: mean {np.mean(ratios):.1f} dB, min {min(ratios):.1f} dB (broadband mean {np.mean(broad):.1f})")
for i in range(len(T["lines"]) - 1):
    a, b = T["lines"][i]["end"] + 0.15, T["lines"][i + 1]["start"] - 0.05
    if b - a > 0.2:
        print(f"pause {a:5.1f}-{b:5.1f} s: music {db(res[int(a * sr) : int(b * sr)]):6.1f} dB")
