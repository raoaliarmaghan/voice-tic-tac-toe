"""FastAPI backend: checks config and mints short-lived Vocal Bridge browser tokens."""
import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()
API_URL = os.getenv("VOCAL_BRIDGE_API_URL", "https://vocalbridgeai.com").rstrip("/")
API_KEY = os.getenv("VOCAL_BRIDGE_API_KEY", "")
AGENT_ID = os.getenv("VOCAL_BRIDGE_AGENT_ID", "")
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]
RATE_LIMIT = int(os.getenv("TOKEN_RATE_LIMIT_PER_MINUTE", "10"))
requests_by_ip: dict[str, deque] = defaultdict(deque)

app = FastAPI(title="Voice Tic-Tac-Toe API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

class TokenRequest(BaseModel):
    participant_name: str = Field(default="Tic Tac Toe Player", min_length=1, max_length=80)

@app.get("/api/health")
def health():
    return {"status":"ok", "voice_configured":bool(API_KEY and AGENT_ID)}

@app.post("/api/voice-token")
async def voice_token(body: TokenRequest, request: Request):
    if not API_KEY or not AGENT_ID:
        raise HTTPException(503, "Voice is not configured. Set VOCAL_BRIDGE_API_KEY and VOCAL_BRIDGE_AGENT_ID in backend/.env.")
    # Basic per-process protection for local development; use a shared limit and user auth in production.
    ip = request.client.host if request.client else "unknown"
    window = requests_by_ip[ip]
    now = time.monotonic()
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= RATE_LIMIT:
        raise HTTPException(429, "Too many token requests. Try again shortly.")
    window.append(now)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(f"{API_URL}/api/v1/token", headers={"X-API-Key":API_KEY,"X-Agent-Id":AGENT_ID,"Content-Type":"application/json"}, json={"participant_name":body.participant_name})
            response.raise_for_status()
            data = response.json()
        # SDK expects transport field names; backend normalizes the course response.
        return {"url":data.get("connection_url") or data["livekit_url"],"token":data["token"],"room_name":data["room_name"],"participant_identity":data.get("participant_identity", "tic-tac-toe-player"),"expires_in":data.get("expires_in",3600),"agent_mode":data.get("agent_mode","")}
    except (httpx.HTTPError, KeyError, ValueError, TypeError) as exc:
        # Do not forward upstream error bodies which might contain sensitive information.
        raise HTTPException(502, "Unable to mint a Vocal Bridge token. Check your key, agent ID, and service status.") from exc
