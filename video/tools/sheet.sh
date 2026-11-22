#!/bin/sh
# usage: sheet.sh out.png a.png b.png c.png d.png   (2x2 contact sheet of four frames, each scaled to 960x540)
out="$1"; shift
ffmpeg -v error -y $(for f in "$@"; do printf -- "-i %s " "$f"; done) -filter_complex "$(i=0; for f in "$@"; do printf "[%d:v]scale=960:540[s%d];" $i $i; i=$((i+1)); done)[s0][s1][s2][s3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0" -frames:v 1 "$out"
