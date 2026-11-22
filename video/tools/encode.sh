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
# a silent 18-second animated preview for the README (GitHub does not play <video> tags that point at repository files)
ffmpeg -v error -y -i "$OUT/gmail-storage-lens-teaser.mp4" -filter_complex "[0:v]split=6[a0][a1][a2][a3][a4][a5];[a0]trim=1.8:4.8,setpts=PTS-STARTPTS[c0];[a1]trim=6.8:9.8,setpts=PTS-STARTPTS[c1];[a2]trim=14.8:17.8,setpts=PTS-STARTPTS[c2];[a3]trim=24.0:27.0,setpts=PTS-STARTPTS[c3];[a4]trim=38.8:41.8,setpts=PTS-STARTPTS[c4];[a5]trim=44.9:47.9,setpts=PTS-STARTPTS[c5];[c0][c1][c2][c3][c4][c5]concat=n=6:v=1:a=0,fps=10,scale=720:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" -loop 0 "$OUT/teaser-preview.gif"
ffprobe -v error -show_entries stream=codec_type,codec_name,width,height,r_frame_rate,duration -show_entries format=size -of compact=p=0 "$OUT/gmail-storage-lens-teaser.mp4"
