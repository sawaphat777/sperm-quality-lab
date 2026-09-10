# Production Checklist

เช็กลิสต์นี้คือขั้นตอนจากโปรเจกต์ที่รันในเครื่อง ไปสู่ระบบที่ใช้งานจริงมากขึ้น

## 1. แยกบัญชีลูกค้ากับบัญชีแล็บ

ไม่ควรใช้ Gmail เดียวกันเป็นทั้งลูกค้าและแล็บในงานจริง

1. สมัครบัญชีลูกค้า 1 บัญชีในเว็บ
2. สมัครบัญชีแล็บอีก 1 บัญชีในเว็บ
3. ไปที่ Supabase SQL Editor แล้วรัน:

```sql
update public.profiles
set role = 'lab'
where email = 'lab-email@gmail.com';
```

4. ให้บัญชีลูกค้า role เป็น `customer`

```sql
update public.profiles
set role = 'customer'
where email = 'customer-email@gmail.com';
```

## 2. ตั้งค่าข้อมูลธนาคาร

แก้ไฟล์ `.env.local`

```text
NEXT_PUBLIC_BANK_NAME=ชื่อธนาคาร
NEXT_PUBLIC_BANK_ACCOUNT_NAME=ชื่อบัญชี
NEXT_PUBLIC_BANK_ACCOUNT_NUMBER=เลขบัญชี
NEXT_PUBLIC_PROMPTPAY_ID=เบอร์พร้อมเพย์หรือเลขประจำตัว
```

หลังแก้แล้วต้อง restart dev server

## 3. เปิด Google Login

ใน Supabase:

1. ไปที่ `Authentication`
2. ไปที่ `Providers`
3. เลือก `Google`
4. เปิด `Enable sign in with Google`
5. ใส่ `Client ID` และ `Client Secret` จาก Google Cloud Console

ใน Google Cloud Console:

1. สร้าง OAuth Client แบบ `Web application`
2. Authorized JavaScript origins:

```text
http://127.0.0.1:3000
http://localhost:3000
```

3. Authorized redirect URI ให้ใช้ callback URL ที่ Supabase แสดงในหน้า Google Provider

## 4. ทดสอบ top-up flow

1. ลูกค้าไปหน้า `Top Up`
2. อัปโหลดสลิป
3. แล็บเข้า `/lab`
4. กด `Approve`
5. ลูกค้า refresh หน้า Home แล้ว credit ต้องเพิ่ม

## 5. ทดสอบ order flow

1. ลูกค้ามี credit อย่างน้อย 100
2. สร้าง order
3. ได้รหัสเช่น `Sperm_001`
4. credit ลดลง 100
5. แล็บใส่รหัสเดียวกันและอัปโหลดวิดีโอ
6. กด `Process video`
7. กด `Send to customer`
8. ลูกค้าเปิด order แล้วต้องเห็น `completed` และ report

## 6. ใช้วิดีโอกล้องจุลทรรศน์จริง

ค่าที่ต้องรู้จากกล้อง:

- frame rate หรือ FPS
- microns per pixel
- magnification
- chamber depth
- sample dilution

ตอนอัปโหลดวิดีโอ ให้ใส่ `Microns per pixel` ให้ตรงกับ calibration ของกล้องจริง

## 7. ข้อควรระวังทางการแพทย์

AI ในโปรเจกต์นี้เป็น decision-support สำหรับ motility จากวิดีโอ ไม่ใช่ใบวินิจฉัยเดี่ยว

ก่อนส่งผลจริงควรมี:

- เจ้าหน้าที่แล็บตรวจทาน
- calibration ด้วยวิดีโอควบคุม
- SOP การเก็บตัวอย่าง
- consent และ privacy policy
- backup ข้อมูลและสิทธิ์การเข้าถึงที่ชัดเจน
