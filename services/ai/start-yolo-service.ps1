$ErrorActionPreference = "Stop"

$trainingPython = "D:\sperm-ai-training\.venv\Scripts\python.exe"
$modelPath = "D:\sperm-ai-training\runs\sperm-detector-v1\weights\best.pt"
$serviceDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Test-Path $trainingPython)) {
  throw "Training Python was not found at $trainingPython"
}

if (-not (Test-Path $modelPath)) {
  throw "YOLO model was not found at $modelPath"
}

$env:SPERM_YOLO_MODEL = $modelPath
Set-Location $serviceDir
& $trainingPython -m uvicorn main:app --host 127.0.0.1 --port 8000
