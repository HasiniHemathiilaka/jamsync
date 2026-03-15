# 🎸 JamSync — Real-Time Remote Jam Platform

A **WebRTC peer-to-peer video conferencing application** built for the **EC9520 Advanced Computer and Data Network** assignment at the University of Jaffna.

**Live Demo:** [Deploy to GitHub Pages / Vercel — see instructions below]

---

## ✨ Features

| Feature | Status |
|---|---|
| Real-time P2P Video & Audio | ✅ |
| Text Chat (WebRTC Data Channel) | ✅ |
| Mute / Unmute Microphone | ✅ |
| Camera Toggle (On/Off) | ✅ |
| Multi-peer Support | ✅ |
| Responsive UI (Mobile + Desktop) | ✅ |
| One-click ID Copy | ✅ |

---

## 🏗️ Architecture

```
┌─────────────┐    PeerJS Cloud   ┌─────────────┐
│   Peer A    │ ←── Signaling ──→ │   Peer B    │
│  (Browser)  │                   │  (Browser)  │
│             │ ←── WebRTC P2P ─→ │             │
│ Video/Audio │                   │ Video/Audio │
│  DataChan   │ ←── Chat Data  ─→ │  DataChan   │
└─────────────┘                   └─────────────┘
```

### Technology Stack
- **WebRTC** — Browser-native P2P media and data streaming
- **PeerJS** — Signaling server abstraction (uses `0.peerjs.com`)
- **HTML5 / CSS3 / Vanilla JS** — No build tools required
- **STUN Servers** — Google's STUN for NAT traversal

### How It Works
1. Each user opens the app and gets a unique **Peer ID** from the PeerJS server
2. User A shares their Peer ID with User B
3. User B pastes the ID and clicks **Connect**
4. PeerJS handles the **SDP offer/answer signaling** via its cloud server
5. Once connected, all **media (video/audio) and chat data** flow directly **P2P via WebRTC** — no server involved

---

## 🚀 Deployment

### Option 1 — GitHub Pages (Free) ⭐ Recommended

```bash
# 1. Create a GitHub repository and push these files:
git init
git add .
git commit -m "Initial commit: JamSync WebRTC app"
git remote add origin https://github.com/YOUR_USERNAME/jamsync.git
git push -u origin main

# 2. In GitHub Settings → Pages → Source → Deploy from branch → main
```
Your app will be live at: `https://YOUR_USERNAME.github.io/jamsync`

### Option 2 — Vercel (Free)

```bash
npm install -g vercel
vercel --prod
```

### Option 3 — Local Development

Since this is pure HTML/CSS/JS with no build step:
```bash
# Option A: VS Code Live Server extension (recommended)
# Option B: Python simple server
python -m http.server 8080
# Then open: http://localhost:8080
```

> ⚠️ **Important:** WebRTC requires the app to be served over **HTTPS** (or localhost) to access camera/microphone. Always deploy to HTTPS for production use.

---

## 📁 Project Structure

```
new/
├── index.html      — App structure & markup
├── style.css       — Styling (dark theme, glassmorphism)
├── script.js       — WebRTC + PeerJS logic, chat, media controls
└── README.md       — This file
```

---

## 🔧 How to Use

1. **Open** the app in a browser (two tabs or two different devices)
2. **Copy** your Jam ID (shown in the top bar)
3. **Paste** the other user's Jam ID into the input field
4. Click **Connect**
5. Both users will now share live video, audio, and can chat in real-time
6. Use the **🎤** and **📷** buttons to mute/unmute or toggle the camera

---

## ⚠️ Known Limitations

- Works best on **Chrome** and **Firefox** (Edge also supported)
- **Safari** may have limited WebRTC support on older iOS versions
- Requires **HTTPS** for camera/mic access (GitHub Pages handles this automatically)
- P2P performance depends on users' network conditions and NAT configuration

---

## 📋 Assignment Info

- **Course:** EC9520 – Advanced Computer and Data Network
- **University:** University of Jaffna, Faculty of Engineering
- **Assignment:** Real-Time Video Conferencing Application with WebRTC
