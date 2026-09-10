from __future__ import annotations

import base64
import hmac
import math
import os
import tempfile
from starlette.background import BackgroundTask
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel


app = FastAPI(title="Sperm Quality AI Service")

_YOLO_MODEL: Any | None = None
_YOLO_MODEL_LOAD_FAILED = False
DEFAULT_YOLO_MODEL_PATH = Path(__file__).resolve().parent / "models" / "sperm-detector-v1.pt"


class AnalysisResult(BaseModel):
    frame_count: int
    fps: float
    tracked_sperm_count: int
    progressive_count: int
    non_progressive_count: int
    immotile_count: int
    progressive_motility_percent: float
    non_progressive_motility_percent: float
    immotile_percent: float
    total_motility_percent: float
    average_velocity_um_s: float | None
    average_straightness: float | None
    confidence: float
    notes: list[str]


@dataclass
class Track:
    track_id: int
    points: list[tuple[int, float, float]] = field(default_factory=list)
    missed: int = 0

    def add(self, frame_index: int, x: float, y: float) -> None:
        self.points.append((frame_index, x, y))
        self.missed = 0

    @property
    def last_xy(self) -> tuple[float, float]:
        _, x, y = self.points[-1]
        return x, y

    def predicted_xy(self) -> tuple[float, float]:
        if len(self.points) < 2:
            return self.last_xy
        _, prev_x, prev_y = self.points[-2]
        _, last_x, last_y = self.points[-1]
        return last_x + (last_x - prev_x), last_y + (last_y - prev_y)

    def path_length_px(self) -> float:
        if len(self.points) < 2:
            return 0.0
        distance = 0.0
        for first, second in zip(self.points, self.points[1:]):
            distance += math.dist((first[1], first[2]), (second[1], second[2]))
        return distance

    def displacement_px(self) -> float:
        if len(self.points) < 2:
            return 0.0
        return math.dist((self.points[0][1], self.points[0][2]), (self.points[-1][1], self.points[-1][2]))

    def duration_s(self, fps: float) -> float:
        if len(self.points) < 2 or fps <= 0:
            return 0.0
        return (self.points[-1][0] - self.points[0][0]) / fps


def detect_cells(
    frame: np.ndarray,
    threshold_multiplier: float = 2.4,
    min_area: float = 12,
    max_area: float = 260,
    min_circularity: float = 0.16,
) -> list[tuple[float, float]]:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)

    background = cv2.GaussianBlur(gray, (31, 31), 0)
    foreground = gray.astype(np.int16) - background.astype(np.int16)
    positive = np.clip(foreground, 0, 255).astype(np.uint8)
    _, std = cv2.meanStdDev(positive)
    threshold = max(10.0, float(std[0][0]) * threshold_multiplier)
    mask = np.where(positive > threshold, 255, 0).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((2, 2), np.uint8))

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    centers: list[tuple[float, float]] = []

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < min_area or area > max_area:
            continue
        perimeter = cv2.arcLength(contour, True)
        if perimeter == 0:
            continue
        circularity = 4 * math.pi * area / (perimeter * perimeter)
        if circularity < min_circularity:
            continue
        moments = cv2.moments(contour)
        if moments["m00"] == 0:
            continue
        centers.append((moments["m10"] / moments["m00"], moments["m01"] / moments["m00"]))

    return centers


def yolo_model_path() -> Path | None:
    raw_path = os.environ.get("SPERM_YOLO_MODEL", "").strip()
    if raw_path:
        return Path(raw_path)
    if DEFAULT_YOLO_MODEL_PATH.exists():
        return DEFAULT_YOLO_MODEL_PATH
    return None


def verify_service_token(x_ai_service_token: str | None = Header(default=None)) -> None:
    """Allow local development without a secret, but protect a public deployment."""
    expected = os.environ.get("AI_SERVICE_SHARED_TOKEN", "").strip()
    if expected and not hmac.compare_digest(x_ai_service_token or "", expected):
        raise HTTPException(status_code=401, detail="Unauthorized AI service request")


def get_yolo_model() -> Any | None:
    global _YOLO_MODEL, _YOLO_MODEL_LOAD_FAILED
    if _YOLO_MODEL is not None:
        return _YOLO_MODEL
    if _YOLO_MODEL_LOAD_FAILED:
        return None

    model_path = yolo_model_path()
    if model_path is None or not model_path.exists():
        _YOLO_MODEL_LOAD_FAILED = True
        return None

    try:
        from ultralytics import YOLO

        _YOLO_MODEL = YOLO(str(model_path))
        return _YOLO_MODEL
    except Exception:
        _YOLO_MODEL_LOAD_FAILED = True
        return None


def detector_backend_name() -> str:
    model_path = yolo_model_path()
    if get_yolo_model() is not None and model_path is not None:
        return f"YOLO VISEM model ({model_path.name})"
    return "classical image detector"


def detect_cells_yolo(frame: np.ndarray, confidence: float = 0.18) -> list[tuple[float, float]]:
    model = get_yolo_model()
    if model is None:
        return []

    results = model.predict(frame, imgsz=640, conf=confidence, iou=0.35, max_det=700, verbose=False, device="cpu")
    centers: list[tuple[float, float]] = []
    if not results:
        return centers

    boxes = results[0].boxes
    if boxes is None:
        return centers

    for box in boxes.xyxy.cpu().numpy():
        x1, y1, x2, y2 = [float(value) for value in box[:4]]
        centers.append(((x1 + x2) / 2, (y1 + y2) / 2))
    return centers


def detect_cells_ai(frame: np.ndarray) -> list[tuple[float, float]]:
    yolo_detections = detect_cells_yolo(frame)
    if yolo_detections:
        return yolo_detections
    return detect_cells(frame)


def update_tracks(
    tracks: list[Track],
    detections: list[tuple[float, float]],
    frame_index: int,
    next_id: int,
    max_distance_px: float,
) -> int:
    unmatched_tracks = set(range(len(tracks)))
    unmatched_detections = set(range(len(detections)))
    candidate_pairs: list[tuple[float, int, int]] = []

    for track_index, track in enumerate(tracks):
        last = track.predicted_xy()
        for detection_index, detection in enumerate(detections):
            distance = math.dist(last, detection)
            if distance <= max_distance_px:
                candidate_pairs.append((distance, track_index, detection_index))

    for _distance, track_index, detection_index in sorted(candidate_pairs, key=lambda item: item[0]):
        if track_index not in unmatched_tracks or detection_index not in unmatched_detections:
            continue
        x, y = detections[detection_index]
        tracks[track_index].add(frame_index, x, y)
        unmatched_tracks.remove(track_index)
        unmatched_detections.remove(detection_index)

    for track_index in unmatched_tracks:
        tracks[track_index].missed += 1

    for index in unmatched_detections:
        x, y = detections[index]
        tracks.append(Track(next_id, [(frame_index, x, y)]))
        next_id += 1

    tracks[:] = [track for track in tracks if track.missed <= 2]
    return next_id


def max_link_distance_px(microns_per_pixel: float) -> float:
    return min(22.0, max(6.0, 8.0 / max(microns_per_pixel, 0.01)))


def classify_track(track: Track, fps: float, microns_per_pixel: float) -> tuple[str, float, float]:
    path_um = track.path_length_px() * microns_per_pixel
    displacement_um = track.displacement_px() * microns_per_pixel
    duration_s = track.duration_s(fps)
    velocity = path_um / duration_s if duration_s > 0 else 0.0
    straightness = displacement_um / path_um if path_um > 0 else 0.0

    if displacement_um >= 25 and velocity >= 5 and straightness >= 0.45:
        return "progressive", velocity, straightness
    if path_um >= 12 and velocity >= 2:
        return "non_progressive", velocity, straightness
    return "immotile", velocity, straightness


def analyze_video(path: Path, microns_per_pixel: float, min_track_length: int) -> AnalysisResult:
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise ValueError("Could not open uploaded video")

    fps = float(capture.get(cv2.CAP_PROP_FPS) or 25.0)
    max_distance_px = max_link_distance_px(microns_per_pixel)
    tracks: list[Track] = []
    finished_tracks: list[Track] = []
    next_id = 1
    frame_index = 0
    detection_counts: list[int] = []

    while True:
        ok, frame = capture.read()
        if not ok:
            break

        if frame.shape[1] > 1280:
            scale = 1280 / frame.shape[1]
            frame = cv2.resize(frame, None, fx=scale, fy=scale)
            effective_mpp = microns_per_pixel / scale
        else:
            effective_mpp = microns_per_pixel

        detections = detect_cells_ai(frame)
        detection_counts.append(len(detections))
        before = {track.track_id: track for track in tracks}
        next_id = update_tracks(tracks, detections, frame_index, next_id, max_distance_px)
        dropped = [track for track_id, track in before.items() if track_id not in {item.track_id for item in tracks}]
        finished_tracks.extend(dropped)
        microns_per_pixel = effective_mpp
        frame_index += 1

    capture.release()
    finished_tracks.extend(tracks)
    valid_tracks = [track for track in finished_tracks if len(track.points) >= min_track_length]

    progressive = 0
    non_progressive = 0
    immotile_tracks = 0
    velocities: list[float] = []
    straightness_values: list[float] = []

    for track in valid_tracks:
        category, velocity, straightness = classify_track(track, fps, microns_per_pixel)
        velocities.append(velocity)
        straightness_values.append(straightness)
        if category == "progressive":
            progressive += 1
        elif category == "non_progressive":
            non_progressive += 1
        else:
            immotile_tracks += 1

    median_detected = int(np.median(detection_counts)) if detection_counts else 0
    total_estimated = max(len(valid_tracks), median_detected, progressive + non_progressive + immotile_tracks, 1)
    immotile = max(total_estimated - progressive - non_progressive, immotile_tracks, 0)

    progressive_percent = progressive / total_estimated * 100
    non_progressive_percent = non_progressive / total_estimated * 100
    immotile_percent = max(0.0, 100 - progressive_percent - non_progressive_percent)
    confidence = min(0.95, max(0.25, len(valid_tracks) / max(total_estimated, 1)))

    notes = [
        "Motility categories follow WHO-style reporting: progressive, non-progressive, and immotile.",
        f"Detector backend: {detector_backend_name()}.",
        "Accuracy depends on microscope calibration, focus, frame rate, dilution, lighting, and chamber depth.",
        "Concentration and morphology require calibrated imaging and separate validated measurement workflows."
    ]

    return AnalysisResult(
        frame_count=frame_index,
        fps=fps,
        tracked_sperm_count=len(valid_tracks),
        progressive_count=progressive,
        non_progressive_count=non_progressive,
        immotile_count=immotile,
        progressive_motility_percent=round(progressive_percent, 2),
        non_progressive_motility_percent=round(non_progressive_percent, 2),
        immotile_percent=round(immotile_percent, 2),
        total_motility_percent=round(progressive_percent + non_progressive_percent, 2),
        average_velocity_um_s=round(float(np.mean(velocities)), 2) if velocities else None,
        average_straightness=round(float(np.mean(straightness_values)), 3) if straightness_values else None,
        confidence=round(confidence, 2),
        notes=notes,
    )


def draw_tracking_overlay(
    path: Path,
    output_path: Path,
    microns_per_pixel: float,
    min_track_length: int,
) -> AnalysisResult:
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise ValueError("Could not open uploaded video")

    fps = float(capture.get(cv2.CAP_PROP_FPS) or 25.0)
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 640)
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 480)
    if width > 1280:
        scale = 1280 / width
        width = 1280
        height = int(height * scale)
        effective_mpp = microns_per_pixel / scale
    else:
        scale = 1.0
        effective_mpp = microns_per_pixel

    writer = cv2.VideoWriter(
        str(output_path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (width, height),
    )

    max_distance_px = max_link_distance_px(effective_mpp)
    tracks: list[Track] = []
    finished_tracks: list[Track] = []
    next_id = 1
    frame_index = 0
    detection_counts: list[int] = []

    colors = [
        (92, 225, 230),
        (255, 199, 95),
        (118, 255, 154),
        (255, 134, 134),
        (178, 143, 255),
        (255, 255, 255),
    ]

    while True:
        ok, frame = capture.read()
        if not ok:
            break

        if scale != 1.0:
            frame = cv2.resize(frame, (width, height))

        detections = detect_cells_ai(frame)
        detection_counts.append(len(detections))
        before = {track.track_id: track for track in tracks}
        next_id = update_tracks(tracks, detections, frame_index, next_id, max_distance_px)
        active_ids = {item.track_id for item in tracks}
        finished_tracks.extend([track for track_id, track in before.items() if track_id not in active_ids])

        overlay = frame.copy()
        cv2.rectangle(overlay, (0, 0), (width, 72), (4, 17, 20), -1)
        cv2.addWeighted(overlay, 0.55, frame, 0.45, 0, frame)

        cv2.putText(frame, "AI Tracking View", (18, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
        cv2.putText(
            frame,
            f"Frame {frame_index + 1} | Active tracks {len(tracks)} | Detections {len(detections)}",
            (18, 56),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (190, 226, 230),
            1,
        )

        for x, y in detections[:140]:
            cv2.circle(frame, (int(x), int(y)), 8, (80, 160, 255), 1)

        display_tracks = sorted(
            [track for track in tracks if len(track.points) >= 3],
            key=lambda item: len(item.points),
            reverse=True,
        )[:45]

        for label_count, track in enumerate(display_tracks):
            color = colors[track.track_id % len(colors)]
            points = [(int(x), int(y)) for _, x, y in track.points[-12:]]
            for p1, p2 in zip(points, points[1:]):
                cv2.line(frame, p1, p2, color, 2)
            if points:
                cv2.circle(frame, points[-1], 6, color, -1)
                if label_count < 8:
                    cv2.putText(
                        frame,
                        f"ID {track.track_id}",
                        (points[-1][0] + 8, points[-1][1] - 8),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.45,
                        color,
                        1,
                    )

                if len(track.points) >= min_track_length and label_count < 8:
                    category, velocity, straightness = classify_track(track, fps, effective_mpp)
                    cv2.putText(
                        frame,
                        f"{category} {velocity:.1f}um/s STR {straightness:.2f}",
                        (points[-1][0] + 8, points[-1][1] + 12),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.38,
                        color,
                        1,
                    )

        writer.write(frame)
        frame_index += 1

    capture.release()
    writer.release()
    finished_tracks.extend(tracks)

    return analyze_video(path, microns_per_pixel, min_track_length)


def collect_tracking_frames(
    path: Path,
    microns_per_pixel: float,
    min_track_length: int,
    max_frames: int,
) -> dict[str, Any]:
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise ValueError("Could not open uploaded video")

    fps = float(capture.get(cv2.CAP_PROP_FPS) or 25.0)
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 640)
    if width > 960:
        scale = 960 / width
        effective_mpp = microns_per_pixel / scale
    else:
        scale = 1.0
        effective_mpp = microns_per_pixel

    max_distance_px = max_link_distance_px(effective_mpp)
    tracks: list[Track] = []
    finished_tracks: list[Track] = []
    next_id = 1
    frame_index = 0
    encoded_frames: list[str] = []
    detection_counts: list[int] = []

    colors = [
        (92, 225, 230),
        (255, 199, 95),
        (118, 255, 154),
        (255, 134, 134),
        (178, 143, 255),
        (255, 255, 255),
    ]

    while len(encoded_frames) < max_frames:
        ok, frame = capture.read()
        if not ok:
            break

        if scale != 1.0:
            frame = cv2.resize(frame, None, fx=scale, fy=scale)

        detections = detect_cells_ai(frame)
        detection_counts.append(len(detections))
        before = {track.track_id: track for track in tracks}
        next_id = update_tracks(tracks, detections, frame_index, next_id, max_distance_px)
        active_ids = {item.track_id for item in tracks}
        finished_tracks.extend([track for track_id, track in before.items() if track_id not in active_ids])

        height, frame_width = frame.shape[:2]
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, 0), (frame_width, 78), (4, 17, 20), -1)
        cv2.addWeighted(overlay, 0.58, frame, 0.42, 0, frame)

        cv2.putText(frame, "AI Tracking View", (18, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.82, (255, 255, 255), 2)
        cv2.putText(
            frame,
            f"Frame {frame_index + 1} | Active tracks {len(tracks)} | Detections {len(detections)} | Link <= {max_distance_px:.0f}px",
            (18, 60),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.56,
            (190, 226, 230),
            1,
        )

        legend_y = height - 20
        cv2.putText(
            frame,
            "Blue rings=detections | Colored trails=tracked objects | Labels=motility estimate",
            (18, legend_y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.48,
            (220, 235, 235),
            1,
        )

        for x, y in detections[:140]:
            cv2.circle(frame, (int(x), int(y)), 8, (80, 160, 255), 1)

        display_tracks = sorted(
            [track for track in tracks if len(track.points) >= 3],
            key=lambda item: len(item.points),
            reverse=True,
        )[:45]

        for label_count, track in enumerate(display_tracks):
            color = colors[track.track_id % len(colors)]
            points = [(int(x), int(y)) for _, x, y in track.points[-12:]]
            for p1, p2 in zip(points, points[1:]):
                cv2.line(frame, p1, p2, color, 2)
            if not points:
                continue

            cv2.circle(frame, points[-1], 6, color, -1)
            if label_count < 8:
                cv2.putText(
                    frame,
                    f"ID {track.track_id}",
                    (points[-1][0] + 8, max(points[-1][1] - 8, 16)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.45,
                    color,
                    1,
                )

            if len(track.points) >= min_track_length and label_count < 8:
                category, velocity, straightness = classify_track(track, fps, effective_mpp)
                cv2.putText(
                    frame,
                    f"{category} {velocity:.1f}um/s STR {straightness:.2f}",
                    (points[-1][0] + 8, points[-1][1] + 14),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.38,
                    color,
                    1,
                )

        ok, jpg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
        if ok:
            encoded_frames.append(base64.b64encode(jpg.tobytes()).decode("ascii"))
        frame_index += 1

    capture.release()
    finished_tracks.extend(tracks)
    valid_tracks = [track for track in finished_tracks if len(track.points) >= min_track_length]

    progressive = 0
    non_progressive = 0
    immotile_tracks = 0
    velocities: list[float] = []
    straightness_values: list[float] = []

    for track in valid_tracks:
        category, velocity, straightness = classify_track(track, fps, effective_mpp)
        velocities.append(velocity)
        straightness_values.append(straightness)
        if category == "progressive":
            progressive += 1
        elif category == "non_progressive":
            non_progressive += 1
        else:
            immotile_tracks += 1

    median_detected = int(np.median(detection_counts)) if detection_counts else 0
    total_estimated = max(len(valid_tracks), median_detected, progressive + non_progressive + immotile_tracks, 1)
    progressive_percent = progressive / total_estimated * 100
    non_progressive_percent = non_progressive / total_estimated * 100
    immotile_percent = max(0.0, 100 - progressive_percent - non_progressive_percent)
    metrics = {
        "frame_count": len(encoded_frames),
        "fps": fps,
        "tracked_sperm_count": len(valid_tracks),
        "progressive_count": progressive,
        "non_progressive_count": non_progressive,
        "immotile_count": max(total_estimated - progressive - non_progressive, immotile_tracks, 0),
        "progressive_motility_percent": round(progressive_percent, 2),
        "non_progressive_motility_percent": round(non_progressive_percent, 2),
        "immotile_percent": round(immotile_percent, 2),
        "total_motility_percent": round(progressive_percent + non_progressive_percent, 2),
        "average_velocity_um_s": round(float(np.mean(velocities)), 2) if velocities else None,
        "average_straightness": round(float(np.mean(straightness_values)), 3) if straightness_values else None,
        "confidence": round(min(0.95, max(0.25, len(valid_tracks) / max(total_estimated, 1))), 2),
        "notes": [
            "Visual tracking metrics are calculated from the displayed frame window.",
            f"Detector backend: {detector_backend_name()}.",
            "Use the main lab analysis flow for full-video reporting.",
        ],
    }

    return {
        "fps": fps,
        "frame_count": len(encoded_frames),
        "frames": encoded_frames,
        "metrics": metrics,
    }


def parse_yolo_labels(label_path: Path, width: int, height: int) -> list[tuple[float, float, float, float]]:
    if not label_path.exists():
        return []

    boxes: list[tuple[float, float, float, float]] = []
    for line in label_path.read_text().splitlines():
        parts = line.strip().split()
        if len(parts) < 5:
            continue
        _, cx, cy, box_w, box_h = [float(item) for item in parts[:5]]
        x1 = (cx - box_w / 2) * width
        y1 = (cy - box_h / 2) * height
        x2 = (cx + box_w / 2) * width
        y2 = (cy + box_h / 2) * height
        boxes.append((x1, y1, x2, y2))
    return boxes


def collect_visem_ground_truth_frames(
    path: Path,
    labels_dir: Path,
    sample_id: str,
    max_frames: int,
) -> dict[str, Any]:
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise ValueError("Could not open uploaded video")

    fps = float(capture.get(cv2.CAP_PROP_FPS) or 25.0)
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 640)
    if width > 960:
        scale = 960 / width
    else:
        scale = 1.0

    encoded_frames: list[str] = []
    frame_index = 0
    object_counts: list[int] = []

    colors = [
        (92, 225, 230),
        (255, 199, 95),
        (118, 255, 154),
        (255, 134, 134),
        (178, 143, 255),
        (255, 255, 255),
    ]

    while len(encoded_frames) < max_frames:
        ok, frame = capture.read()
        if not ok:
            break

        original_height, original_width = frame.shape[:2]
        label_path = labels_dir / f"{sample_id}_frame_{frame_index}.txt"
        boxes = parse_yolo_labels(label_path, original_width, original_height)
        object_counts.append(len(boxes))

        if scale != 1.0:
            frame = cv2.resize(frame, None, fx=scale, fy=scale)

        height, frame_width = frame.shape[:2]
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, 0), (frame_width, 78), (4, 17, 20), -1)
        cv2.addWeighted(overlay, 0.58, frame, 0.42, 0, frame)
        cv2.putText(frame, "VISEM Ground Truth View", (18, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.82, (255, 255, 255), 2)
        cv2.putText(
            frame,
            f"Frame {frame_index + 1} | Annotated sperm {len(boxes)} | Boxes from dataset labels",
            (18, 60),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.56,
            (190, 226, 230),
            1,
        )

        for object_index, (x1, y1, x2, y2) in enumerate(boxes):
            sx1, sy1, sx2, sy2 = [int(value * scale) for value in (x1, y1, x2, y2)]
            center = ((sx1 + sx2) // 2, (sy1 + sy2) // 2)
            color = colors[object_index % len(colors)]
            cv2.rectangle(frame, (sx1, sy1), (sx2, sy2), color, 1)
            cv2.circle(frame, center, 3, color, -1)

            if object_index < 12:
                cv2.putText(frame, "GT", (sx2 + 3, sy1), cv2.FONT_HERSHEY_SIMPLEX, 0.34, color, 1)

        cv2.putText(
            frame,
            "Ground truth overlay: dataset boxes, not model prediction",
            (18, height - 20),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.48,
            (220, 235, 235),
            1,
        )

        ok, jpg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 84])
        if ok:
            encoded_frames.append(base64.b64encode(jpg.tobytes()).decode("ascii"))
        frame_index += 1

    capture.release()
    average_objects = float(np.mean(object_counts)) if object_counts else 0.0

    return {
        "fps": fps,
        "frame_count": len(encoded_frames),
        "frames": encoded_frames,
        "mode": "ground_truth",
        "metrics": {
            "tracked_sperm_count": int(round(average_objects)),
            "progressive_motility_percent": 0,
            "non_progressive_motility_percent": 0,
            "immotile_percent": 0,
            "total_motility_percent": 0,
            "average_annotated_objects": round(average_objects, 2),
        },
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "detector": detector_backend_name()}


@app.post("/analyze")
async def analyze(
    video: UploadFile = File(...),
    microns_per_pixel: float = Form(0.5),
    min_track_length: int = Form(8),
    x_ai_service_token: str | None = Header(default=None),
) -> dict[str, Any]:
    verify_service_token(x_ai_service_token)
    suffix = Path(video.filename or "sample.mp4").suffix or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
        temp.write(await video.read())
        temp_path = Path(temp.name)

    try:
        result = analyze_video(temp_path, microns_per_pixel, min_track_length)
        return result.model_dump()
    finally:
        temp_path.unlink(missing_ok=True)


@app.post("/visualize")
async def visualize(
    video: UploadFile = File(...),
    microns_per_pixel: float = Form(0.5),
    min_track_length: int = Form(8),
    x_ai_service_token: str | None = Header(default=None),
) -> FileResponse:
    verify_service_token(x_ai_service_token)
    suffix = Path(video.filename or "sample.mp4").suffix or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
        temp.write(await video.read())
        input_path = Path(temp.name)

    output_path = Path(tempfile.gettempdir()) / f"tracking-overlay-{input_path.stem}.mp4"

    try:
        draw_tracking_overlay(input_path, output_path, microns_per_pixel, min_track_length)
    finally:
        input_path.unlink(missing_ok=True)

    return FileResponse(
        output_path,
        media_type="video/mp4",
        filename="ai-tracking-overlay.mp4",
        background=BackgroundTask(lambda: output_path.unlink(missing_ok=True)),
    )


@app.post("/visualize-frames")
async def visualize_frames(
    video: UploadFile = File(...),
    microns_per_pixel: float = Form(0.5),
    min_track_length: int = Form(8),
    max_frames: int = Form(240),
    label_sample_id: str = Form(""),
    x_ai_service_token: str | None = Header(default=None),
) -> dict[str, Any]:
    verify_service_token(x_ai_service_token)
    suffix = Path(video.filename or "sample.mp4").suffix or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
        temp.write(await video.read())
        input_path = Path(temp.name)

    try:
        if label_sample_id:
            labels_dir = Path.cwd().parents[1] / "sample-videos" / "visem-tracking" / "labels"
            if labels_dir.exists():
                return collect_visem_ground_truth_frames(input_path, labels_dir, label_sample_id, max_frames)
        return collect_tracking_frames(input_path, microns_per_pixel, min_track_length, max_frames)
    finally:
        input_path.unlink(missing_ok=True)
