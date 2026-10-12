#!/usr/bin/env python3
"""文档图片压缩脚本。

把 docs/ui-styles/ 与 docs/screenshots/ 下的 PNG 转为 JPEG（quality=85），
大幅减小仓库体积（UI 风格图与实机截图均为渐变深的界面图，JPEG 远优于 PNG8）。

转换后扩展名由 .png 变为 .jpg，引用处（README.md 等）需同步更新，
脚本会自动扫描并提示需要修改的引用。

用法：python scripts/compress-docs.py [--quality 85] [--dry-run]
"""
import argparse
import os
import re
import sys

from PIL import Image

TARGET_DIRS = ["docs/ui-styles", "docs/screenshots"]
SCAN_FILES = ["README.md", "workbuddy.md", "docs/游戏玩法设计.md", "MCP_INTEGRATION.md", "SKILL.md"]


def convert(path: str, quality: int, dry: bool) -> int:
    """返回节省的字节数；已是 .jpg 或非图片返回 0。"""
    if not path.lower().endswith(".png"):
        return 0
    before = os.path.getsize(path)
    im = Image.open(path).convert("RGB")
    dst = path[:-4] + ".jpg"
    if not dry:
        im.save(dst, "JPEG", quality=quality, optimize=True, progressive=True)
        os.remove(path)
    after = 0 if dry else os.path.getsize(dst)
    print(f"  {os.path.basename(path):38s} {before / 1024:7.0f} KB -> {after / 1024:5.0f} KB")
    return before - after


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quality", type=int, default=85)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    total_saved = 0
    converted = []
    for d in TARGET_DIRS:
        if not os.path.isdir(d):
            continue
        print(f"[{d}]")
        for f in sorted(os.listdir(d)):
            p = os.path.join(d, f)
            if os.path.isfile(p) and f.lower().endswith(".png"):
                total_saved += convert(p, args.quality, args.dry_run)
                converted.append(f[:-4] + ".jpg")
    print(f"\n合计节省 {total_saved / 1024 / 1024:.2f} MB")

    # 提示需要同步更新的引用
    stale = []
    for mf in SCAN_FILES:
        if not os.path.exists(mf):
            continue
        text = open(mf, encoding="utf-8").read()
        for name in converted:
            if name[:-4] + ".png" in text:
                stale.append((mf, name))
    if stale:
        print("\n[提醒] 以下文件中的引用需要从 .png 改为 .jpg：")
        for mf, name in stale:
            print(f"  {mf}: {name}")


if __name__ == "__main__":
    main()
