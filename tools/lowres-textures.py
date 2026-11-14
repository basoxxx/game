# Low-tier texture set: half-resolution copies (<name>_512.<ext>) of the PBR maps in public/assets/tex and
# public/assets/rally, loaded by src/ui/gfx.js on the Bassa setting; oversized 1k maps are re-encoded in place only
# when that is visually lossless (PSNR >= 40 dB and >= 20% smaller). Usage: python3 -I tools/lowres-textures.py public/assets [--dry]
import sys, os, glob, io, math
from PIL import Image
root = sys.argv[1]; dry = '--dry' in sys.argv

def psnr(a, b):
    import numpy as np
    a = np.asarray(a, dtype=np.float64); b = np.asarray(b, dtype=np.float64)
    m = ((a - b) ** 2).mean()
    return 99 if m == 0 else 10 * math.log10(255 ** 2 / m)

QJ = {}
def enc(im, fmt, kind):
    buf = io.BytesIO()
    if fmt == 'JPEG':
        q = QJ.get(kind, 87)
        im.save(buf, 'JPEG', quality=q, optimize=True, progressive=False, subsampling=0 if kind == 'nor' else 2)
    else:
        q = 90 if kind == 'nor' else 85
        im.save(buf, 'WEBP', quality=q, method=6)
    return buf.getvalue()

tot0 = tot1 = low = 0
for f in sorted(glob.glob(root + '/tex/*.jpg') + glob.glob(root + '/rally/*.webp')):
    name = os.path.basename(f)
    if '_512.' in name: continue
    kind = 'nor' if '_nor' in name else 'rough' if '_rough' in name else 'diff'
    fmt = 'JPEG' if f.endswith('.jpg') else 'WEBP'
    im = Image.open(f); im.load()
    if kind == 'rough' and im.mode != 'L': im = im.convert('L')  # three reads roughness from .g: grey is identical
    elif im.mode not in ('RGB', 'L'): im = im.convert('RGB')
    QJ.clear(); QJ.update({'nor': 95, 'diff': 95, 'rough': 95})
    size0 = os.path.getsize(f); data = enc(im, fmt, kind)
    QJ.clear(); QJ.update({'nor': 90, 'diff': 85, 'rough': 85})
    p = psnr(Image.open(f).convert(im.mode), Image.open(io.BytesIO(data)).convert(im.mode))
    keep = len(data) < size0 * 0.8 and p >= 40
    tot0 += size0; tot1 += len(data) if keep else size0
    # low-tier variant: half resolution (a 512 source stays 512)
    w, h = im.size
    sm = im if w <= 512 else im.resize((w // 2, h // 2), Image.LANCZOS)
    sdata = enc(sm, fmt, kind) if w > 512 else open(f, 'rb').read()
    lname = f.replace('_1k.', '_512.').replace('_2k.', '_512h.')
    low += len(sdata)
    print(f'{name:42s} {size0//1024:5d}k -> {(len(data) if keep else size0)//1024:5d}k psnr {p:5.1f} {"KEEP" if keep else "orig"}  low {len(sdata)//1024}k')
    if not dry:
        if keep: open(f, 'wb').write(data)
        if '_2k.' not in name:
            if w <= 512: open(lname, 'wb').write(open(f, 'rb').read())
            else: open(lname, 'wb').write(sdata)
print(f'total {tot0//1024}k -> {tot1//1024}k ; low set {low//1024}k')
