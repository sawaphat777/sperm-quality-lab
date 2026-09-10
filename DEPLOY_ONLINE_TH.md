# Deploy ให้เข้าได้ทุกเครื่อง

สถาปัตยกรรมที่ใช้คือ Vercel สำหรับเว็บ และ Render สำหรับ AI service; Supabase ที่ตั้งไว้แล้วเก็บ Auth และข้อมูลต่อไป

## 1. สร้าง GitHub repository

1. เปิด [github.com/new](https://github.com/new) และสร้าง private repository ชื่อ `sperm-quality-lab`.
2. ใน PowerShell ที่โฟลเดอร์โปรเจกต์ รันตามนี้ (อย่าอัปโหลด `.env.local`):

```powershell
git init
git add .
git commit -m "Prepare online deployment"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_NAME/sperm-quality-lab.git
git push -u origin main
```

## 2. Deploy AI service ที่ Render

1. เปิด [Render](https://dashboard.render.com/) > New > Web Service > เลือก GitHub repository นี้.
2. ตั้งค่า Runtime เป็น `Docker`, Root Directory เป็น `services/ai`, Instance Type เป็น Free, และ Health Check Path เป็น `/health`.
3. สร้าง secret ยาว ๆ หนึ่งค่าใน PowerShell ด้วย `[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')` แล้วเพิ่ม Environment Variable ชื่อ `AI_SERVICE_SHARED_TOKEN`.
4. กด Create Web Service และรอจน Deploy สำเร็จ จากนั้นคัดลอก URL เช่น `https://sperm-ai-service.onrender.com`.

## 3. Deploy เว็บที่ Vercel

1. เปิด [Vercel](https://vercel.com/new) > Import Git Repository > เลือก repository เดียวกัน.
2. เพิ่ม Environment Variables สำหรับ Production:

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL ของคุณ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key ของคุณ |
| `NEXT_PUBLIC_SITE_URL` | เว้นไว้ก่อน แล้วกลับมาใส่ URL เว็บหลัง deploy ครั้งแรก |
| `LAB_AI_SERVICE_URL` | URL ของ Render จากขั้น 2 |
| `AI_SERVICE_SHARED_TOKEN` | ค่าเดียวกับ Render ขั้น 2 |
| `NEXT_PUBLIC_BANK_NAME` | `Government Savings Bank` |
| `NEXT_PUBLIC_BANK_ACCOUNT_NAME` | `Sawaphat Thaiyoung` |
| `NEXT_PUBLIC_BANK_ACCOUNT_NUMBER` | `020318458500` |
| `NEXT_PUBLIC_PROMPTPAY_ID` | `0822622411` |

3. กด Deploy แล้วคัดลอก URL เช่น `https://sperm-quality-lab.vercel.app`.
4. กลับไปแก้ `NEXT_PUBLIC_SITE_URL` ให้เป็น URL นี้ และ Redeploy หนึ่งครั้ง.

## 4. เปลี่ยน Supabase Auth URLs

ใน Supabase > Authentication > URL Configuration:

1. Site URL: ใส่ URL Vercel ของคุณ.
2. Redirect URLs: เพิ่ม `https://YOUR-VERCEL-URL/home`, `https://YOUR-VERCEL-URL/reset-password`, และ `https://YOUR-VERCEL-URL/set-password`.

Google OAuth ยังใช้ callback ของ Supabase เดิม: `https://dekuysomtzbsathjiids.supabase.co/auth/v1/callback`.

## ข้อจำกัดของโฮสต์ฟรี

Vercel ออนไลน์ต่อเนื่อง แต่ Render Free จะพัก AI หลังไม่มี request 15 นาที และคำขอแรกหลังพักอาจรอประมาณหนึ่งนาที. ถ้าต้องการ AI ไม่หลับจริง ๆ ต้องใช้ instance แบบเสียเงิน หรือเปิดเครื่องที่รัน AI เองตลอดเวลา.

ผลจากระบบนี้เป็นเครื่องมือช่วยคัดกรองเท่านั้น ก่อนใช้ทางคลินิกจริงต้องมีการ validate กับกล้อง, chamber, workflow และผู้เชี่ยวชาญของแล็บ รวมถึงจัดทำนโยบายความเป็นส่วนตัว/การยินยอมสำหรับวิดีโอผู้ป่วย.
