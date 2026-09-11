from pathlib import Path

import modal


AI_DIR = Path(__file__).resolve().parent

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libglib2.0-0", "libgl1")
    .pip_install(
        "torch==2.5.1+cpu",
        "torchvision==0.20.1+cpu",
        index_url="https://download.pytorch.org/whl/cpu",
    )
    .pip_install(
        "fastapi==0.115.4",
        "python-multipart==0.0.17",
        "opencv-python-headless==4.10.0.84",
        "numpy==2.1.3",
        "pydantic==2.9.2",
        "ultralytics==8.4.2",
    )
    .add_local_file(AI_DIR / "main.py", "/app/main.py")
    .add_local_file(
        AI_DIR / "models" / "sperm-detector-v1.pt",
        "/app/models/sperm-detector-v1.pt",
    )
)

app = modal.App("sperm-quality-ai-pytorch")


@app.function(
    image=image,
    cpu=2.0,
    memory=4096,
    timeout=1200,
    startup_timeout=600,
    max_containers=1,
    scaledown_window=300,
    secrets=[modal.Secret.from_name("sperm-quality-ai-secrets")],
)
@modal.concurrent(max_inputs=20)
@modal.asgi_app()
def fastapi_service():
    import os
    import sys

    os.environ["SPERM_YOLO_MODEL"] = "/app/models/sperm-detector-v1.pt"
    sys.path.insert(0, "/app")

    from main import app

    return app
