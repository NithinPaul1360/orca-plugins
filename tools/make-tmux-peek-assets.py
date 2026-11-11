import os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# usage: tools/make-tmux-peek-assets.py <dir with full-grid.png, full-max.png, full-narrow.png>
SRC = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__ or 'usage: make-tmux-peek-assets.py <captures-dir>')
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'plugins', 'tmux-peek', 'assets')
SF = next((f for f in ['/System/Library/Fonts/SFNS.ttf', '/usr/share/fonts/truetype/inter/Inter.ttf'] if os.path.exists(f)), None)
CROP = (442, 0, None, 1852)      # drop the project list (left) and the status bar (bottom)
PANEL = (1588, 80, 3024, 1852)   # the right sidebar, for the cover

def font(size, weight=None):
    if not SF:
        return ImageFont.load_default(size)
    f = ImageFont.truetype(SF, size)
    if weight and SF.endswith('SFNS.ttf'):
        # axes: Width, Optical Size, GRAD, Weight
        f.set_variation_by_axes([100, min(96, max(17, size)), 400, weight])
    return f

def bg(w, h):
    # deep navy-to-black diagonal gradient
    im = Image.new('RGB', (w, h), (9, 11, 16))
    g = Image.radial_gradient('L').resize((int(w*1.6), int(h*1.6)))
    g = g.crop((int(w*0.1), int(h*0.35), int(w*0.1)+w, int(h*0.35)+h))
    g = Image.eval(g, lambda v: 255 - v)
    tint = Image.new('RGB', (w, h), (20, 40, 58))
    return Image.composite(tint, im, g)

def rounded(im, r):
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, im.size[0]-1, im.size[1]-1), r, fill=255)
    out = Image.new('RGBA', im.size)
    out.paste(im, (0, 0), m)
    return out

def shadowed(canvas, im, xy, r=24, blur=40, offset=18):
    sh = Image.new('RGBA', (im.size[0] + blur*4, im.size[1] + blur*4), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((blur*2, blur*2, blur*2+im.size[0], blur*2+im.size[1]), r, fill=(0, 0, 0, 190))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(sh, (xy[0]-blur*2, xy[1]-blur*2+offset))
    ri = rounded(im.convert('RGB'), r)
    canvas.alpha_composite(ri, xy)
    ImageDraw.Draw(canvas).rounded_rectangle((xy[0], xy[1], xy[0]+im.size[0]-1, xy[1]+im.size[1]-1), r, outline=(255, 255, 255, 38), width=2)

def app_crop(name):
    im = Image.open(f'{SRC}/full-{name}.png').convert('RGB')
    # drop the project list (left 442 px) and the status bar (bottom 46 px)
    x0, y0, x1, y1 = CROP
    return im.crop((x0, y0, x1 or im.size[0], y1 or im.size[1]))

def screenshot(name, title, sub, out):
    W, H = 2560, 1600
    c = bg(W, H).convert('RGBA')
    d = ImageDraw.Draw(c)
    d.text((110, 70), title, font=font(60, 700), fill=(240, 244, 248))
    d.text((112, 150), sub, font=font(34, 400), fill=(150, 164, 180))
    shot = app_crop(name)
    th = H - 300
    tw = int(shot.size[0] * th / shot.size[1])
    shot = shot.resize((tw, th), Image.LANCZOS)
    shadowed(c, shot, ((W - tw)//2, 250))
    c.convert('RGB').save(f'{OUT}/{out}', quality=88, method=6)
    print(out, os.path.getsize(f'{OUT}/{out}')//1024, 'KB')

screenshot('grid', 'Your agent team, live in the sidebar',
           'Every teammate in its own pane, sized to fit. Colours, diffs and spinners as Claude draws them.', 'screenshot-team.webp')
screenshot('max', 'Focus on one teammate',
           'The expand button maximizes a pane inside the panel. Click it and type: keys, arrows, Esc, Ctrl-C and paste go straight to Claude.', 'screenshot-maximized.webp')
screenshot('narrow', 'Fits any sidebar width',
           'Narrow the sidebar and each agent redraws to its pane. Message any teammate from the bar at the bottom.', 'screenshot-narrow.webp')

# ---- cover 1600x1000 ----
W, H = 1600, 1000
c = bg(W, H).convert('RGBA')
d = ImageDraw.Draw(c)
full = Image.open(f'{SRC}/full-grid.png').convert('RGB')
panel = full.crop(PANEL)   # the right sidebar: dropdown, 4 panes, message bar
ph = 880
pw = int(panel.size[0] * ph / panel.size[1])
panel = panel.resize((pw, ph), Image.LANCZOS)
px = W - pw - 70
shadowed(c, panel, (px, 60), r=22, blur=34)
d.text((86, 300), 'Tmux Peek', font=font(92, 700), fill=(244, 247, 250))
lines = ['Watch, message and drive', 'your Claude Code agent', 'teammates from Orca’s sidebar.']
for i, t in enumerate(lines):
    d.text((90, 430 + i*50), t, font=font(36, 400), fill=(160, 176, 194))
chips = ['live panes', 'type & click', 'image paste']
x = 90
for t in chips:
    f = font(24, 590)
    w = d.textlength(t, font=f)
    d.rounded_rectangle((x, 620, x + w + 32, 662), 21, fill=(24, 74, 58), outline=(63, 185, 80))
    d.text((x + 16, 628), t, font=f, fill=(220, 252, 231))
    x += w + 46
c.convert('RGB').save(f'{OUT}/cover.webp', quality=90, method=6)
print('cover', os.path.getsize(f'{OUT}/cover.webp')//1024, 'KB')

# ---- icon 256x256 ----
S = 256
ic = Image.new('RGBA', (S, S), (0, 0, 0, 0))
dd = ImageDraw.Draw(ic)
dd.rounded_rectangle((8, 8, S-9, S-9), 56, fill=(14, 20, 28), outline=(63, 185, 80), width=6)
cols = [(83, 155, 245), (218, 170, 63), (176, 131, 240), (63, 185, 80)]
k = 0
for r in range(2):
    for cc in range(2):
        x0, y0 = 46 + cc*86, 46 + r*86
        dd.rounded_rectangle((x0, y0, x0+78, y0+78), 14, fill=(26, 32, 42), outline=cols[k], width=5)
        dd.rectangle((x0+16, y0+24, x0+50, y0+30), fill=cols[k])
        dd.rectangle((x0+16, y0+42, x0+60, y0+48), fill=(120, 130, 145))
        k += 1
ic.save(f'{OUT}/icon.png', optimize=True)
print('icon', os.path.getsize(f'{OUT}/icon.png')//1024, 'KB')
