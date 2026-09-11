# Deploy the PyTorch AI service on Modal

Modal Starter has no monthly plan fee and includes a monthly compute-credit allowance. The service scales down when it is idle.

## 1. Install and sign in

Run these commands from the project directory:

```powershell
python -m pip install modal
python -m modal setup
```

## 2. Create the shared secret

Use the same `AI_SERVICE_SHARED_TOKEN` value in Modal and Vercel:

```powershell
python -m modal secret create sperm-quality-ai-secrets AI_SERVICE_SHARED_TOKEN="your-token"
```

## 3. Deploy

```powershell
python -X utf8 -m modal deploy services/ai/modal_app.py
```

The command prints a public URL ending in `.modal.run`. Append `/health` to verify that the service loaded `sperm-detector-v1.pt`.

## 4. Connect Vercel

Set these variables for Production and Preview, then redeploy the frontend:

```text
LAB_AI_SERVICE_URL=https://your-modal-service.modal.run
AI_SERVICE_SHARED_TOKEN=the-same-token-used-by-modal
```
