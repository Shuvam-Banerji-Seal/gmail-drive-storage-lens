"""Whisper round trip: does a recogniser hear the same words as the script?

usage:  uv run --no-sync --project <CH5103>/video/tts python -E -s tools/asr_check.py <wav_dir> <lines.txt> <tts_root>
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

vo_dir, narration, tts_root = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
lines = [l.strip() for l in narration.read_text(encoding="utf-8").splitlines() if l.strip()]
# round trip: does a recogniser hear the same words?
import torch  # noqa: E402
from transformers import WhisperForConditionalGeneration, WhisperProcessor  # noqa: E402

ck = tts_root / "checkpoints" / "whisper-small.en"
proc, model = WhisperProcessor.from_pretrained(ck), WhisperForConditionalGeneration.from_pretrained(ck).eval()


def norm(s: str) -> list[str]:
    return re.sub(r"[^a-z0-9' ]", " ", s.lower()).split()


for i, text in enumerate(lines):
    audio, rate = sf.read(vo_dir / f"line_{i:03d}.wav", dtype="float32")
    import torchaudio.functional as AF
    wav16 = AF.resample(torch.from_numpy(audio)[None], rate, 16000)[0].numpy()
    feats = proc(wav16, sampling_rate=16000, return_tensors="pt").input_features
    with torch.inference_mode():
        ids = model.generate(feats, max_new_tokens=120)
    heard = proc.batch_decode(ids, skip_special_tokens=True)[0].strip()
    a, b = norm(text), norm(heard)
    # word error rate by edit distance
    d = np.zeros((len(a) + 1, len(b) + 1), int)
    d[:, 0], d[0, :] = range(len(a) + 1), range(len(b) + 1)
    for x in range(1, len(a) + 1):
        for y in range(1, len(b) + 1):
            d[x, y] = min(d[x - 1, y] + 1, d[x, y - 1] + 1, d[x - 1, y - 1] + (a[x - 1] != b[y - 1]))
    print(f"line {i}: WER {d[-1, -1] / len(a):.0%} | heard: {heard}")
