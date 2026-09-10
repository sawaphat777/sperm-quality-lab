# Sperm Quality Lab Platform

Production-oriented platform for customer semen sample orders and a laboratory console with real video processing.

## What is included

- Customer portal in English
  - Gmail/password login
  - Forgot password flow
  - Gmail verification before password setup
  - Continue with Google
  - Persistent session until logout
  - Credit balance, top-up request, new order, order list, profile, change password
- Lab console in English
  - Pending top-up approval
  - Video upload
  - Real OpenCV-based motility analysis through the Python AI service
  - Publish result to customer by `Sperm_001`, `Sperm_002`, and so on
- Supabase database schema
  - Row Level Security
  - Global order sequence
  - Credit deduction inside a database RPC
  - Lab-only top-up approval and result publishing
- Python AI service
  - Detects cell-like objects in microscope frames
  - Tracks movement paths
  - Classifies progressive, non-progressive, and immotile motility

## Setup

1. Create a Supabase project.
2. Open Supabase SQL Editor and run `supabase/schema.sql`.
3. Create a `.env.local` file from `.env.example`.
4. In Supabase Auth settings:
   - Enable Email provider.
   - Enable Google provider.
   - Add `http://localhost:3000/**` to redirect URLs for local development.
   - For production, add your real domain redirect URLs.
5. Install web dependencies:

```bash
npm install
```

6. Run the customer/lab web app:

```bash
npm run dev
```

7. Run the AI service:

```bash
cd services/ai
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## First lab account

Create a user through the app, then run this in Supabase SQL Editor:

```sql
update public.profiles set role = 'lab' where email = 'lab@example.com';
```

Then open:

```text
http://localhost:3000/lab
```

## Medical validation

The AI service is real video analysis, but it is not a certified medical device by itself. It should be validated with lab-controlled videos, microscope calibration, and trained staff review before clinical reporting.

Motility reporting follows WHO-style categories:

- Progressive motility
- Non-progressive motility
- Immotile

Concentration and morphology require additional calibrated workflows and should not be inferred from ordinary uncalibrated videos alone.
