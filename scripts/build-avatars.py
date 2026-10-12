#!/usr/bin/env python3
"""麦麦军团头像资产生成脚本。

从 raw/ 的全身立绘中切割「头部特写」生成一套小尺寸头像（128px），
供攻略页出战编制等小图标位使用（显示尺寸仅 30px，512px 立绘过于浪费）。

流程：
  1. 按 alpha 通道裁掉透明边距
  2. 头部切割：默认取裁剪框顶部 52% 高度的正方形区域，水平居中；
     个别角色（如武器高出头顶）通过 CROP_OVERRIDE 按 (top_frac, side_frac) 微调
  3. 缩放到 128px + FASTOCTREE 256 色量化输出到 assets/avatars/
  4. 额外产出校验拼图 _contact_sheet.png（4 列网格，带名称标注）

用法：python scripts/build-avatars.py [--raw raw] [--out assets/avatars] [--sheet PATH]
"""
import argparse
import importlib.util
import io
import os
import sys
import tempfile

from PIL import Image, ImageDraw

# (key, 源文件名, 头像显示名)
AVATAR_SIZE = 128

# 头部切割微调：key -> (top_frac, side_frac)
#   top_frac  切割框顶边在裁剪框中的相对位置（0 = 紧贴顶边）
#   side_frac 正方形边长相对裁剪框高度的比例
CROP_OVERRIDE = {
    # 薯条剑士：长剑高出头顶，顶边下移避开剑尖
    "warrior_fries": (0.18, 0.50),
}


def load_unit_map():
    """复用 build-assets.py 的 UNIT_MAP，避免两份清单漂移。"""
    here = os.path.dirname(os.path.abspath(__file__))
    spec = importlib.util.spec_from_file_location(
        "build_assets", os.path.join(here, "build-assets.py")
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.UNIT_MAP


def head_crop(im: Image.Image, top_frac: float, side_frac: float) -> Image.Image:
    bbox = im.getchannel("A").getbbox()
    if not bbox:
        return im
    im = im.crop(bbox)
    w, h = im.size
    side = min(int(round(h * side_frac)), w)
    top = int(round(h * top_frac))
    top = max(0, min(top, h - side))
    left = (w - side) // 2
    return im.crop((left, top, left + side, top + side))


def save_optimized(im: Image.Image, path: str) -> int:
    q = im.quantize(colors=256, method=Image.FASTOCTREE, dither=Image.FLOYDSTEINBERG)
    buf = io.BytesIO()
    q.save(buf, "PNG", optimize=True)
    with open(path, "wb") as f:
        f.write(buf.getvalue())
    return buf.tell()


def make_contact_sheet(entries, cell=200, cols=4):
    """entries: [(name, PIL.Image)] -> 拼图 Image"""
    rows = (len(entries) + cols - 1) // cols
    label_h = 26
    sheet = Image.new("RGB", (cols * cell, rows * (cell + label_h)), (16, 24, 40))
    draw = ImageDraw.Draw(sheet)
    for i, (name, im) in enumerate(entries):
        r, c = divmod(i, cols)
        x0, y0 = c * cell, r * (cell + label_h)
        thumb = im.copy()
        thumb.thumbnail((cell - 16, cell - 16), Image.LANCZOS)
        bg = Image.new("RGBA", (cell - 16, cell - 16), (0, 0, 0, 0))
        bg.paste(thumb, ((cell - 16 - thumb.width) // 2, (cell - 16 - thumb.height) // 2), thumb)
        sheet.paste(bg, (x0 + 8, y0 + 8), bg)
        draw.text((x0 + 8, y0 + cell + 6), name, fill=(180, 220, 255))
    return sheet


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default="raw")
    ap.add_argument("--out", default="assets/avatars")
    ap.add_argument("--sheet", default=os.path.join(tempfile.gettempdir(), "mcd-avatar-sheet.png"))
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    total = 0
    sheet_entries = []
    missing = []

    for src_name, dst_rel, _maxdim in load_unit_map():
        dst_name = os.path.basename(dst_rel)  # units/fan_male.png -> fan_male.png
        src_path = os.path.join(args.raw, src_name)
        if not os.path.exists(src_path):
            missing.append(src_name)
            continue
        im = Image.open(src_path).convert("RGBA")
        top_frac, side_frac = CROP_OVERRIDE.get(dst_name[:-4], (0.0, 0.52))
        im = head_crop(im, top_frac, side_frac)
        im = im.resize((AVATAR_SIZE, AVATAR_SIZE), Image.LANCZOS)
        size = save_optimized(im, os.path.join(args.out, dst_name))
        total += size
        print(f"  avatars/{dst_name:28s} {size / 1024:6.1f} KB")
        sheet_entries.append((dst_name[:-4], im))

    sheet = make_contact_sheet(sheet_entries)
    sheet.save(args.sheet)
    print(f"\n共 {len(sheet_entries)} 个头像，合计 {total / 1024:.0f} KB -> {args.out}/")
    print(f"校验拼图 -> {args.sheet}")
    if missing:
        print("[警告] 缺少源文件:", ", ".join(missing), file=sys.stderr)


if __name__ == "__main__":
    main()
