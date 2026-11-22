#!/bin/sh
# Encodes the rendered frames and the mixed soundtrack into the final 1080p30 MP4, and extracts the poster frame.
# usage: sh video/tools/encode.sh        (run from the repository root, after video:render and video:mix)
set -eu
B=video/build
OUT=public/media
mkdir -p "$OUT" "$B/out"
ffmpeg -v error -y -framerate 30 -i "$B/frames/%05d.png" -i "$B/audio/final.wav" \
  -vf "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p" \
  -c:v libx264 -preset slow -crf 17 -profile:v high -level 4.2 -tune animation \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart "$OUT/gmail-storage-lens-teaser.mp4"
ffmpeg -v error -y -ss 17.2 -i "$OUT/gmail-storage-lens-teaser.mp4" -frames:v 1 -vf "scale=1600:-2" -q:v 3 "$OUT/teaser-poster.jpg"
ffprobe -v error -show_entries stream=codec_type,codec_name,width,height,r_frame_rate,duration -show_entries format=size -of compact=p=0 "$OUT/gmail-storage-lens-teaser.mp4"
