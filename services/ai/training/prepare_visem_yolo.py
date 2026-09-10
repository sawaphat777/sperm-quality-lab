from __future__ import annotations

import argparse
import random
import zipfile
from pathlib import Path


def collect_samples(zip_file: zipfile.ZipFile, max_samples: int | None) -> list[str]:
    image_entries = [
        entry.filename
        for entry in zip_file.infolist()
        if "/images/" in entry.filename and entry.filename.lower().endswith(".jpg")
    ]
    random.seed(11)
    random.shuffle(image_entries)
    if max_samples:
        image_entries = image_entries[:max_samples]
    return sorted(image_entries)


def label_for_image(image_entry: str) -> str:
    return image_entry.replace("/images/", "/labels/").replace(".jpg", ".txt")


def write_yaml(out_dir: Path) -> None:
    yaml = "\n".join(
        [
            f"path: {out_dir.resolve().as_posix()}",
            "train: images/train",
            "val: images/val",
            "names:",
            "  0: sperm",
            "",
        ]
    )
    (out_dir / "visem.yaml").write_text(yaml, encoding="utf-8")


def extract_pair(zip_file: zipfile.ZipFile, image_entry: str, split_dir: Path) -> bool:
    label_entry = label_for_image(image_entry)
    try:
        zip_file.getinfo(label_entry)
    except KeyError:
        return False

    image_out = split_dir / "images" / Path(image_entry).name
    label_out = split_dir / "labels" / Path(label_entry).name
    image_out.parent.mkdir(parents=True, exist_ok=True)
    label_out.parent.mkdir(parents=True, exist_ok=True)

    image_out.write_bytes(zip_file.read(image_entry))
    label_out.write_bytes(zip_file.read(label_entry))
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip", required=True, help="Path to VISEM-Tracking.zip")
    parser.add_argument("--out", required=True, help="Output YOLO dataset directory")
    parser.add_argument("--max-samples", type=int, default=None, help="Limit image samples for quick local tests")
    parser.add_argument("--val-ratio", type=float, default=0.2)
    args = parser.parse_args()

    out_dir = Path(args.out)
    train_dir = out_dir / "images" / "train"
    val_dir = out_dir / "images" / "val"
    (out_dir / "labels" / "train").mkdir(parents=True, exist_ok=True)
    (out_dir / "labels" / "val").mkdir(parents=True, exist_ok=True)
    train_dir.mkdir(parents=True, exist_ok=True)
    val_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(args.zip) as zip_file:
        samples = collect_samples(zip_file, args.max_samples)
        val_count = max(1, int(len(samples) * args.val_ratio))
        val_set = set(samples[:val_count])
        extracted = 0

        for image_entry in samples:
            split = "val" if image_entry in val_set else "train"
            image_target = out_dir / "images" / split / Path(image_entry).name
            label_target = out_dir / "labels" / split / Path(label_for_image(image_entry)).name
            image_target.parent.mkdir(parents=True, exist_ok=True)
            label_target.parent.mkdir(parents=True, exist_ok=True)

            try:
                label_entry = label_for_image(image_entry)
                zip_file.getinfo(label_entry)
            except KeyError:
                continue

            image_target.write_bytes(zip_file.read(image_entry))
            label_target.write_bytes(zip_file.read(label_entry))
            extracted += 1

    write_yaml(out_dir)
    print(f"Extracted {extracted} image/label pairs to {out_dir}")
    print(f"Dataset YAML: {out_dir / 'visem.yaml'}")


if __name__ == "__main__":
    main()
