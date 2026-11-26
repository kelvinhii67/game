"""Prepare the original ImageGen atlases for Canvas. Requires Pillow."""
from pathlib import Path
from PIL import Image, ImageEnhance

root = Path(__file__).resolve().parents[1]
src, dst = root / 'art-src', root / 'dist' / 'assets'
resample = Image.Resampling.LANCZOS

def open_art(name):
    return Image.open(src / f'{name}.png').convert('RGBA')

def output(im, name, size, quality):
    im.thumbnail(size, resample)
    im.save(dst / f'{name}.webp', 'WEBP', quality=quality, method=6)

cover = open_art('cover').convert('RGB')
output(cover.copy(), 'cover', (1536, 1024), 86)
output(cover.crop((1010, 106, 1281, 377)), 'portrait', (180, 180), 87)
output(ImageEnhance.Color(open_art('map').convert('RGB')).enhance(.87), 'courtyard', (1536, 1024), 86)

def extract(source, rows, cols, names, size):
    atlas = open_art(source)
    for i, name in enumerate(names):
        col, row = i % cols, i // cols
        im = atlas.crop((round(col * atlas.width / cols), round(row * atlas.height / rows),
                         round((col+1) * atlas.width / cols), round((row+1) * atlas.height / rows)))
        alpha = im.getchannel('A').point(lambda v: 255 if v > 32 else 0)
        bounds = alpha.getbbox()
        if bounds:
            output(im.crop(bounds), name, size, 88)

extract('sprites',2,4,['idle','run','strike','cast','paper','ghost','corpse','boss'],(304,320))
extract('icons',3,3,['paper-icon','ghost-icon','talisman','thunder','array','sword','robe','jade','heal'],(126,126))
if (src / 'motion.png').exists():
    extract('motion',1,4,['run-alt','strike-alt','hurt','down'],(304,320))

extract('boss-break',1,1,['boss-break'],(340,370))
