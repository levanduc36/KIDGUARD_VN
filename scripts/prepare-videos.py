"""Create browser-compatible copies, leaving original videos untouched.
Usage: python -X utf8 scripts/prepare-videos.py SOURCE_DIRECTORY
Requires imageio-ffmpeg (or set FFMPEG_BINARY).
"""
import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'.tools'))
import imageio_ffmpeg

ffmpeg = os.environ.get('FFMPEG_BINARY') or imageio_ffmpeg.get_ffmpeg_exe()
source = Path(sys.argv[1])
def convert(file):
    lesson = 'bao-luc-hoc-duong' if file.stem.startswith('C_') else 'lua-dao'
    name = re.sub(r'[^a-z0-9]+', '-', file.stem.lower()).strip('-')
    dest = ROOT/'public/videos'/lesson/(name+'.mp4')
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists():
        subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', str(file),
                        '-map', '0:v:0', '-map', '0:a:0?', '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1',
                        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p', '-threads', '2',
                        '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', str(dest)], check=True)
    poster = dest.with_suffix('.webp')
    subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-ss', '1', '-i', str(dest),
                    '-frames:v', '1', '-vf', 'scale=640:-1', str(poster)], check=True)
    print(f'Ready: {lesson}/{name}', flush=True)
    return {'original': file.name, 'output': str(dest.relative_to(ROOT)).replace('\\', '/'), 'bytes': dest.stat().st_size}
with ThreadPoolExecutor(max_workers=2) as pool:
    result = list(pool.map(convert, sorted(source.glob('*.mp4'))))
(ROOT/'public/videos/manifest.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(f'Completed {len(result)} videos; {sum(x["bytes"] for x in result)/1024/1024:.1f} MiB', flush=True)
