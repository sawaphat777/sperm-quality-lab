FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV SPERM_YOLO_MODEL=/app/models/sperm-detector-v1.onnx

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-0 libgl1 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .
COPY models ./models

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
