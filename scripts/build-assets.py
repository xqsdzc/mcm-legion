#!/usr/bin/env python3
"""麦麦军团美术资产生成脚本。

把 raw/ 下的 86 个大图（1536² 或 1152x2048，单张约 3MB）处理为 Web 可用资产：
  1. 按 alpha 通道裁掉透明边距
  2. 等比缩放到目标尺寸（据点/建设 640px，角色/动物 512px）
  3. FASTOCTREE 256 色量化 + 抖动，PNG 优化输出

输出目录：assets/
用法：python scripts/build-assets.py [--raw raw] [--out assets]
"""
import argparse
import io
import os
import sys

from PIL import Image

# (源文件, 输出文件, 最大边长)
UNIT_MAP = [
    ("麦麦粉_男.png", "units/fan_male.png", 512),
    ("麦麦粉_女.png", "units/fan_female.png", 512),
    ("麦麦军.png", "units/jun.png", 512),
    ("麦麦将军.png", "units/general.png", 512),
    ("美食战士_薯条剑士.png", "units/warrior_fries.png", 512),
    ("美食战士_麦辣鸡腿堡战士.png", "units/warrior_spicychicken.png", 512),
    ("美食战士_可乐枪炮兵.png", "units/warrior_cola.png", 512),
    ("美食战士_麦旋风法师.png", "units/warrior_mcflurry.png", 512),
    ("美食战士_早餐麦满分守卫.png", "units/warrior_muffin.png", 512),
    ("美食战士_咖啡苦行僧.png", "units/warrior_coffee.png", 512),
    ("美食战士_巨无霸泰坦.png", "units/warrior_bigmac.png", 512),
    ("美食战士_黄金拱门守卫.png", "units/warrior_arch.png", 512),
    ("动物_哈士奇.png", "animals/husky.png", 512),
    ("动物_萨摩耶.png", "animals/samoyed.png", 512),
    ("动物_金毛.png", "animals/golden.png", 512),
    ("动物_柯基.png", "animals/corgi.png", 512),
    ("动物_柴犬.png", "animals/shiba.png", 512),
    ("动物_橘猫.png", "animals/orange.png", 512),
    ("动物_奶牛猫.png", "animals/calico.png", 512),
    ("动物_灰虎斑.png", "animals/tabby.png", 512),
    ("动物_白猫.png", "animals/white.png", 512),
    ("动物_黑猫.png", "animals/black.png", 512),
]

STRONGHOLDS = [
    "cheap", "chicken", "tea", "coffee", "store",
    "cburger", "burger", "pizza", "grandpa",
]


def build_job_list():
    jobs = list(UNIT_MAP)
    for key in STRONGHOLDS:
        for stage in range(6):
            jobs.append((f"{key}_{stage}.png", f"strongholds/{key}_{stage}.png", 640))
    for stage in range(6):
        jobs.append((f"mm_{stage}.png", f"build/mm_{stage}.png", 640))
    return jobs


def trim_and_resize(im: Image.Image, maxdim: int) -> Image.Image:
    bbox = im.getchannel("A").getbbox()
    if bbox:
        im = im.crop(bbox)
    w, h = im.size
    scale = maxdim / max(w, h)
    if scale < 1:
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    return im


def save_optimized(im: Image.Image, path: str) -> int:
    q = im.quantize(colors=256, method=Image.FASTOCTREE, dither=Image.FLOYDSTEINBERG)
    buf = io.BytesIO()
    q.save(buf, "PNG", optimize=True)
    with open(path, "wb") as f:
        f.write(buf.getvalue())
    return buf.tell()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default="raw")
    ap.add_argument("--out", default="assets")
    args = ap.parse_args()

    jobs = build_job_list()
    total = 0
    missing = []
    for src, dst, maxdim in jobs:
        src_path = os.path.join(args.raw, src)
        if not os.path.exists(src_path):
            missing.append(src)
            continue
        dst_path = os.path.join(args.out, dst)
        os.makedirs(os.path.dirname(dst_path), exist_ok=True)
        im = Image.open(src_path).convert("RGBA")
        im = trim_and_resize(im, maxdim)
        size = save_optimized(im, dst_path)
        total += size
        print(f"  {dst:34s} {im.size[0]}x{im.size[1]:<5d} {size / 1024:8.1f} KB")
    if missing:
        print("\n[警告] 缺少源文件:", ", ".join(missing), file=sys.stderr)
    print(f"\n共 {len(jobs) - len(missing)} 个文件，合计 {total / 1024 / 1024:.2f} MB -> {args.out}/")


if __name__ == "__main__":
    main()
