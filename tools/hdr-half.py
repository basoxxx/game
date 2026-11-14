# Radiance .hdr (RGBE) -> half resolution .hdr (box filter in linear float, new-style RLE scanlines)
# usage: python3 -I hdrhalf.py in.hdr out.hdr
import sys, numpy as np

def read(path):
    b = open(path, 'rb').read(); i = 0; header = []
    while True:
        j = b.index(b'\n', i); line = b[i:j]; i = j + 1
        if line.startswith(b'-Y') or line.startswith(b'+Y'): res = line; break
        header.append(line)
    parts = res.split(); H = int(parts[1]); W = int(parts[3])
    img = np.zeros((H, W, 4), np.uint8)
    for y in range(H):
        if b[i] == 2 and b[i + 1] == 2 and (b[i + 2] << 8 | b[i + 3]) == W:
            i += 4
            for c in range(4):
                x = 0
                while x < W:
                    n = b[i]; i += 1
                    if n > 128:
                        n -= 128; img[y, x:x + n, c] = b[i]; i += 1
                    else:
                        img[y, x:x + n, c] = np.frombuffer(b[i:i + n], np.uint8); i += n
                    x += n
        else:
            img[y] = np.frombuffer(b[i:i + W * 4], np.uint8).reshape(W, 4); i += W * 4
    e = img[..., 3].astype(np.int32)
    f = np.where(e[..., None] > 0, (img[..., :3].astype(np.float64) + 0.5) * np.ldexp(1.0, (e - 136))[..., None], 0.0)
    return header, f

def write(path, header, f):
    H, W, _ = f.shape
    m = f.max(axis=2)
    mant, ex = np.frexp(m)
    sc = np.where(m > 1e-32, mant * 256.0 / np.maximum(m, 1e-38), 0.0)
    rgbe = np.zeros((H, W, 4), np.uint8)
    rgbe[..., :3] = np.clip(f * sc[..., None], 0, 255).astype(np.uint8)
    rgbe[..., 3] = np.where(m > 1e-32, ex + 128, 0).astype(np.uint8)
    out = bytearray()
    for line in header: out += line + b'\n'
    out += b'-Y %d +X %d\n' % (H, W)
    for y in range(H):
        out += bytes([2, 2, W >> 8, W & 255])
        for c in range(4):
            row = rgbe[y, :, c]; x = 0
            while x < W:
                # run?
                r = 1
                while x + r < W and r < 127 and row[x + r] == row[x]: r += 1
                if r >= 4:
                    out += bytes([128 + r, row[x]]); x += r; continue
                s = x
                while x < W and x - s < 128:
                    if x + 3 < W and row[x] == row[x + 1] == row[x + 2] == row[x + 3]: break
                    x += 1
                out += bytes([x - s]) + row[s:x].tobytes()
    open(path, 'wb').write(out)

h, f = read(sys.argv[1])
H, W, _ = f.shape
g = f.reshape(H // 2, 2, W // 2, 2, 3).mean(axis=(1, 3))
write(sys.argv[2], h, g)
h2, back = read(sys.argv[2])
print(sys.argv[2], back.shape, 'max', f.max(), back.max(), 'meanrel', abs(back.mean() - g.mean()) / g.mean())
