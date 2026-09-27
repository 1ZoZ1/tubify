"""Tubify simgesi: kırmızıdan yeşile akan degrade üzerinde oynat üçgeni + ses dalgaları.
Çalıştır: python build/icon-src/make_icon.py  ->  build/icon.png, build/icon.ico
"""
import colorsys, math, os
from PIL import Image, ImageDraw, ImageFilter, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
SS = 4  # süper örnekleme


def _lin(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _gam(c):
    c = max(0.0, min(1.0, c))
    return int(round(255 * (12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055)))


def to_oklab(hexc):
    r, g, b = (_lin(int(hexc[i:i + 2], 16)) for i in (1, 3, 5))
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    return (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)


def from_oklab(L, a, b):
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    return (_gam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
            _gam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
            _gam(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s))


# Kırmızı -> mercan/turuncu -> yeşil. OKLab'da karıştırılır: geçiş çamurlaşmaz, sarı bandı dar kalır.
STOPS = [(0.00, '#FF1F4F'), (0.46, '#FF6A24'), (0.64, '#C8B82A'), (0.78, '#4FD350'), (1.00, '#0FB86A')]


def color_at(t):
    for (t0, c0), (t1, c1) in zip(STOPS, STOPS[1:]):
        if t <= t1:
            k = (t - t0) / (t1 - t0)
            k = k * k * (3 - 2 * k)
            A, B = to_oklab(c0), to_oklab(c1)
            return from_oklab(*(A[i] + (B[i] - A[i]) * k for i in range(3)))
    return from_oklab(*to_oklab(STOPS[-1][1]))


def hue_gradient(n):
    img = Image.new('RGB', (n, n))
    px = img.load()
    lut = [color_at(i / 511) for i in range(512)]
    for y in range(n):
        for x in range(n):
            t = (x * 0.8 + y * 1.2) / (2 * (n - 1))  # sol üst kırmızı, sağ alt yeşil
            px[x, y] = lut[int(t * 511)]
    return img


def squircle_mask(n, margin, radius):
    m = Image.new('L', (n, n), 0)
    ImageDraw.Draw(m).rounded_rectangle([margin, margin, n - 1 - margin, n - 1 - margin], radius=radius, fill=255)
    return m


def rounded_triangle(draw, pts, r, fill):
    # Köşeleri yuvarlatılmış üçgen: köşelerde daire, kenarlarda kalın çizgi, içi dolu.
    draw.polygon(pts, fill=fill)
    for i in range(3):
        a, b = pts[i], pts[(i + 1) % 3]
        draw.line([a, b], fill=fill, width=int(r * 2))
    for p in pts:
        draw.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=fill)


def glyph(n, waves):
    g = Image.new('L', (n, n), 0)
    d = ImageDraw.Draw(g)
    u = n / 100
    cx = 44 if waves else 53
    r = 5.5 * u
    h = 40 if waves else 46
    w = h * 0.9
    pts = [((cx - w / 2) * u + r, (50 - h / 2) * u + r * 1.2),
           ((cx - w / 2) * u + r, (50 + h / 2) * u - r * 1.2),
           ((cx + w / 2) * u - r * 0.9, 50 * u)]
    rounded_triangle(d, pts, r, 255)
    if waves:
        ox = (cx + w / 2 - 1) * u
        for i, rad in enumerate((12, 22)):
            rr = rad * u
            box = [ox - rr, 50 * u - rr, ox + rr, 50 * u + rr]
            d.arc(box, start=-42, end=42, fill=255, width=int(6 * u))
            # uçları yuvarla
            for ang in (-42, 42):
                a = math.radians(ang)
                px, py = ox + rr * math.cos(a) - 0 * u, 50 * u + rr * math.sin(a)
                cr = 3 * u
                # arc çizgi genişliği merkezde; uç noktası yarıçap - genişlik/2
                px2 = ox + (rr - 3 * u) * math.cos(a)
                py2 = 50 * u + (rr - 3 * u) * math.sin(a)
                d.ellipse([px2 - cr, py2 - cr, px2 + cr, py2 + cr], fill=255)
    return g


def render(size):
    n = size * SS
    waves = size >= 48
    margin = int(n * (0.03 if size <= 24 else 0.04))
    radius = int(n * 0.23)
    bg = hue_gradient(256).resize((n, n), Image.BICUBIC).convert('RGBA')
    # üstte hafif parlaklık
    gloss = Image.new('L', (n, n), 0)
    ImageDraw.Draw(gloss).ellipse([-n * 0.3, -n * 0.75, n * 1.3, n * 0.45], fill=38)
    gloss = gloss.filter(ImageFilter.GaussianBlur(n * 0.06))
    bg = Image.composite(Image.new('RGBA', (n, n), (255, 255, 255, 255)), bg, gloss)
    mask = squircle_mask(n, margin, radius)

    gm = glyph(n, waves)
    # simgenin altına yumuşak gölge: altın tonlarında bile okunur
    sh = gm.filter(ImageFilter.GaussianBlur(n * 0.025))
    sh = ImageChops.offset(sh, 0, int(n * 0.015))
    shadow = Image.new('RGBA', (n, n), (60, 10, 20, 0))
    shadow.putalpha(sh.point(lambda v: int(v * 0.45)))
    bg = Image.alpha_composite(bg, shadow)
    white = Image.new('RGBA', (n, n), (255, 255, 255, 255))
    bg = Image.composite(white, bg, gm)

    out = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    out.paste(bg, (0, 0), mask)
    return out.resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    big = render(512)
    big.save(os.path.join(OUT, 'icon.png'))
    render(96).save(os.path.join(OUT, '..', 'src', 'shell', 'logo.png'))  # uygulama içi marka
    sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
    frames = [render(s) for s in sizes]
    frames[-1].save(os.path.join(OUT, 'icon.ico'), format='ICO', sizes=[(s, s) for s in sizes], append_images=frames[:-1])
    # önizleme
    prev = Image.new('RGBA', (900, 300), (32, 32, 36, 255))
    prev.paste(big.resize((256, 256), Image.LANCZOS), (20, 22), big.resize((256, 256), Image.LANCZOS))
    x = 300
    for f in frames[:-2]:
        prev.paste(f, (x, 140), f); x += f.size[0] + 14
    light = Image.new('RGBA', (900, 60), (240, 240, 244, 255)); x = 300
    for f in frames[:5]:
        light.paste(f, (x, 20), f); x += f.size[0] + 14
    prev.paste(light, (0, 240))
    prev.save(os.path.join(HERE, 'preview.png'))
    print('ok')
