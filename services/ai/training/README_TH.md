# Production Tracker Training Path

ถ้าต้องการ tracker ที่ใช้จริงกับวิดีโอ sperm microscope ไม่ควรใช้ rule-based OpenCV อย่างเดียว

แนวทางที่ควรใช้:

1. ใช้ VISEM labels เพื่อ train detector เช่น YOLO
2. ใช้ detector output ต่อกับ tracker เช่น ByteTrack / BoT-SORT
3. วัดผลกับ validation set ก่อนใช้จริง
4. ค่อยนำ model ที่ผ่าน validation ไปใช้ใน Lab Console

## Dataset ที่มีตอนนี้

คุณมี:

```text
D:\dowloadddddd\VISEM-Tracking.zip
```

ใน zip มี:

- `.mp4` วิดีโอจริง
- `images/*.jpg`
- `labels/*.txt` แบบ YOLO format

Label format:

```text
class x_center y_center width height
```

ค่าพิกัดเป็น normalized 0-1

## ทำไมยังไม่ควรเรียกว่า clinical-grade

VISEM labels ที่แตกมาเป็น bounding boxes ต่อเฟรม แต่ไม่ได้มี track IDs ชัดเจนในไฟล์ label แต่ละเฟรม
ดังนั้นการ track ข้ามเฟรมต้องใช้ tracker หลัง detector อีกที และต้องวัดผล ID switches / missed detections

## แผน production

1. Train detector ด้วย YOLO บน VISEM images/labels
2. Validate detection:
   - precision
   - recall
   - mAP50
   - false positives จาก debris/background
3. Track ด้วย ByteTrack หรือ BoT-SORT
4. Validate tracking:
   - missed detection rate
   - ID switch rate
   - track fragmentation
5. Calibrate microscope:
   - FPS
   - microns per pixel
   - chamber depth
6. Lock model version ก่อนใช้ส่งรายงาน

## Recommended commands

หลังติดตั้ง ultralytics:

```bash
pip install ultralytics
python services/ai/training/prepare_visem_yolo.py --zip D:\dowloadddddd\VISEM-Tracking.zip --out data/visem-yolo --max-samples 20
yolo detect train data=data/visem-yolo/visem.yaml model=yolov8n.pt imgsz=640 epochs=50 batch=8
```

สำหรับเครื่องที่ไม่มี GPU ให้เริ่ม `epochs=5` เพื่อทดสอบ pipeline ก่อน

เมื่อได้ model แล้วจึงนำ `best.pt` ไปใช้เป็น detector จริงใน service
