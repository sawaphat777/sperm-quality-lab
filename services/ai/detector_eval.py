from __future__ import annotations

import argparse
from pathlib import Path

import cv2

from main import detect_cells, parse_yolo_labels


def center_in_box(center: tuple[float, float], box: tuple[float, float, float, float], margin_px: float) -> bool:
    x, y = center
    x1, y1, x2, y2 = box
    return x1 - margin_px <= x <= x2 + margin_px and y1 - margin_px <= y <= y2 + margin_px


def evaluate_params(
    video_path: Path,
    labels_dir: Path,
    sample_id: str,
    max_frames: int,
    threshold_multiplier: float,
    min_area: float,
    max_area: float,
    min_circularity: float,
    margin_px: float,
) -> dict[str, float]:
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise RuntimeError(f"Could not open {video_path}")

    frame_index = 0
    true_positive = 0
    false_positive = 0
    false_negative = 0

    while frame_index < max_frames:
        ok, frame = capture.read()
        if not ok:
            break

        height, width = frame.shape[:2]
        boxes = parse_yolo_labels(labels_dir / f"{sample_id}_frame_{frame_index}.txt", width, height)
        detections = detect_cells(
            frame,
            threshold_multiplier=threshold_multiplier,
            min_area=min_area,
            max_area=max_area,
            min_circularity=min_circularity,
        )

        unmatched_boxes = set(range(len(boxes)))
        for detection in detections:
            match_index = None
            for box_index in list(unmatched_boxes):
                if center_in_box(detection, boxes[box_index], margin_px):
                    match_index = box_index
                    break
            if match_index is None:
                false_positive += 1
            else:
                true_positive += 1
                unmatched_boxes.remove(match_index)

        false_negative += len(unmatched_boxes)
        frame_index += 1

    capture.release()

    precision = true_positive / max(true_positive + false_positive, 1)
    recall = true_positive / max(true_positive + false_negative, 1)
    f1 = 2 * precision * recall / max(precision + recall, 1e-9)

    return {
        "frames": frame_index,
        "tp": true_positive,
        "fp": false_positive,
        "fn": false_negative,
        "precision": precision,
        "recall": recall,
        "f1": f1,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", default="sample-videos/visem-tracking/VISEM_11.mp4")
    parser.add_argument("--labels", default="sample-videos/visem-tracking/labels")
    parser.add_argument("--sample-id", default="11")
    parser.add_argument("--frames", type=int, default=120)
    args = parser.parse_args()

    video_path = Path(args.video)
    labels_dir = Path(args.labels)

    candidates: list[tuple[float, dict[str, float], tuple[float, float, float, float]]] = []
    for threshold_multiplier in [1.2, 1.5, 1.8, 2.1, 2.4]:
        for min_area in [4, 8, 12]:
            for max_area in [260, 420, 640]:
                for min_circularity in [0.08, 0.12, 0.16]:
                    metrics = evaluate_params(
                        video_path,
                        labels_dir,
                        args.sample_id,
                        args.frames,
                        threshold_multiplier,
                        min_area,
                        max_area,
                        min_circularity,
                        margin_px=6,
                    )
                    params = (threshold_multiplier, min_area, max_area, min_circularity)
                    candidates.append((metrics["f1"], metrics, params))

    candidates.sort(key=lambda item: item[0], reverse=True)
    print("Top detector settings against VISEM labels")
    for rank, (_score, metrics, params) in enumerate(candidates[:10], start=1):
        threshold_multiplier, min_area, max_area, min_circularity = params
        print(
            f"{rank:02d} "
            f"f1={metrics['f1']:.3f} precision={metrics['precision']:.3f} recall={metrics['recall']:.3f} "
            f"tp={metrics['tp']:.0f} fp={metrics['fp']:.0f} fn={metrics['fn']:.0f} "
            f"threshold_multiplier={threshold_multiplier} min_area={min_area} "
            f"max_area={max_area} min_circularity={min_circularity}"
        )


if __name__ == "__main__":
    main()
