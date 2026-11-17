# VocalGrid — Voice-Controlled Tic-Tac-Toe

Play tic-tac-toe by voice or by clicking. The app is built with React (Vite) and has a small FastAPI server that hands out voice-session tokens for a [Vocal Bridge](https://vocalbridgeai.com/) agent.

- Say things like **"let's play"**, **"center"**, **"top left"**, or **"clear"**.
- Without voice, a simple local bot plays O against you.

Live demo: [aliarmaghan.com/tic-tac-toe](https://aliarmaghan.com/tic-tac-toe)

## Quick start (no voice)

You only need Node.js 20.19+.

```bash
cd frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173, then click a square or press keys 1–9.

## Voice mode

You need Python 3.10+, a Vocal Bridge API key, and an agent created from `agent/prompt.md` and `agent/actions.json`.

```bash
# Terminal A: backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add VOCAL_BRIDGE_API_KEY and VOCAL_BRIDGE_AGENT_ID
uvicorn app.main:app --reload --port 8000

# Terminal B: frontend
cd frontend
npm install
npm run dev
```

Open the app, press **Connect Voice**, and allow microphone access.

## Project layout

```text
frontend/   React game UI
backend/    FastAPI token server
agent/      Voice agent prompt and client actions
deploy/     Deployment files
```

## License

MIT
