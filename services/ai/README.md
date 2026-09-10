# Sperm Quality AI Service

This service performs real video processing with OpenCV. It detects cell-like objects in microscope video frames, tracks centroids across time, estimates movement paths, and classifies motility into progressive, non-progressive, and immotile categories.

It is intended as a CASA-style decision-support pipeline. A lab should validate it with known-control videos, microscope calibration, and human review before clinical use.

## Run locally

```bash
cd services/ai
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The web app calls:

```text
POST http://localhost:8000/analyze
```

Form fields:

- `video`: microscope video file
- `microns_per_pixel`: microscope calibration value
- `min_track_length`: minimum number of frames required for a valid track

## Important validation notes

- Motility can be estimated from video tracking.
- Concentration needs calibrated chamber volume and field-of-view measurements.
- Morphology needs high-quality still imaging and a separately validated model.
- Final reports should be reviewed by trained laboratory staff.
