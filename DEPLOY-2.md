# 🚀 Deployment Guide

## Project Structure
```
chat-backend/
├── server.js         ← Express backend
├── agents.js         ← Multi-agent pipeline
├── index.html        ← Frontend
├── package.json
├── render.yaml       ← Render config
├── netlify.toml      ← Netlify config
├── .env              ← Local only (never commit)
├── .env.example
└── .gitignore
```

---

## Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/ai-chat.git
git push -u origin main
```

> Make sure `.env` is in `.gitignore` — it should NOT be on GitHub.

---

## Step 2 — Deploy Backend to Render

1. Go to → https://render.com
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repo
4. Render will auto-detect `render.yaml`

   Or fill manually:
   | Field         | Value              |
   |---------------|--------------------|
   | Runtime       | Node               |
   | Build Command | `npm install`      |
   | Start Command | `npm start`        |

5. Go to **Environment** tab → Add variable:
   ```
   API_KEY = sk-or-v1-your-real-key
   ```

6. Click **"Deploy"**
7. Wait ~2 minutes → You'll get a URL like:
   ```
   https://ai-chat-backend.onrender.com
   ```

---

## Step 3 — Update Frontend with Render URL

In `index.html`, update this line:
```js
const BACKEND = IS_PROD
  ? "https://ai-chat-backend.onrender.com"  // ← paste YOUR Render URL here
  : "http://localhost:3000";
```

Then commit and push:
```bash
git add index.html
git commit -m "update backend URL"
git push
```

---

## Step 4 — Deploy Frontend to Netlify

### Option A — Drag & Drop (fastest)
1. Go to → https://netlify.com
2. Log in → Click **"Add new site"** → **"Deploy manually"**
3. Drag the entire project folder
4. Done! You'll get a URL like:
   ```
   https://ai-chat-abc123.netlify.app
   ```

### Option B — GitHub Auto-Deploy
1. Go to → https://netlify.com
2. **"Add new site"** → **"Import from Git"**
3. Connect GitHub → Select your repo
4. Build settings:
   | Field       | Value |
   |-------------|-------|
   | Base dir    | `.`   |
   | Publish dir | `.`   |
   | Build cmd   | *(leave empty)* |
5. Click **"Deploy"**
6. Every `git push` will auto-redeploy ✅

---

## Step 5 — Fix CORS for Production

In `server.js`, update CORS to allow your Netlify domain:
```js
app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://your-app.netlify.app"   // ← your Netlify URL
  ]
}));
```

Push the update → Render auto-redeploys.

---

## ✅ Final Checklist

- [ ] GitHub repo created and pushed
- [ ] `.env` NOT on GitHub
- [ ] Render backend live (`/health` returns `{"status":"ok"}`)
- [ ] `API_KEY` set in Render environment variables
- [ ] `index.html` updated with Render URL
- [ ] Netlify frontend live
- [ ] CORS updated with Netlify domain
- [ ] Test: send a message, get AI reply ✅

---

## 🧪 Test Your Live Backend

```bash
curl -X POST https://ai-chat-backend.onrender.com/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello!"}'
```

Expected response:
```json
{ "reply": "Hello! How can I help you today?" }
```

---

## ⚠️ Common Issues

| Problem | Fix |
|---------|-----|
| Backend returns 500 | Check API_KEY in Render dashboard |
| CORS error in browser | Add Netlify URL to CORS allowlist |
| Render URL not working | Wait 2-3 min after deploy, check logs |
| `module not found` error | Make sure `"type": "module"` in package.json |
| Render sleeps after 15min | Free tier spins down — first request is slow |
