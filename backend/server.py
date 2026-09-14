"""Nirbhay Safety API — app factory.

Domain logic lives in dedicated modules:
  - models.py        Pydantic request/response models
  - utils.py          time/geo helpers
  - db_helpers.py      shared Supabase read/write helpers
  - risk_engine.py     rule-based risk detection + alert dispatch
  - metro_data.py      Delhi Metro dataset used by route analysis
  - routers/trips.py    trip lifecycle, location/motion ingestion, risk eval
  - routers/sos.py       emergency contacts + offline SOS event sync
  - routers/safety.py    safe-route analysis, geocoding, safe spots
  - routers/chat.py      Gemini-based chat screenshot analysis
"""
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
import httpx

import shared
from config import UNWIRED_LABS_API_KEY, FAST2SMS_API_KEY
from supabase_client import get_supabase
from routers import trips, sos, safety, chat


@asynccontextmanager
async def lifespan(app: FastAPI):
    # One pooled httpx client for the whole process, instead of opening a
    # fresh TCP/TLS connection on every outbound request. The Supabase
    # client is its own lazily-created singleton (see supabase_client.py).
    shared.http_client = httpx.AsyncClient(
        limits=httpx.Limits(max_connections=50, max_keepalive_connections=20)
    )
    await get_supabase()
    yield
    await shared.http_client.aclose()


# Create the main app (single instance)
app = FastAPI(title="Nirbhay Safety API", lifespan=lifespan)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

api_router.include_router(trips.router)
api_router.include_router(sos.router)
api_router.include_router(safety.router)
api_router.include_router(chat.router)


@api_router.get("/")
async def root():
    return {"message": "Nirbhay Safety API - Autonomous Women Safety System"}

@api_router.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "database": "connected",
            "unwired_labs": "configured" if UNWIRED_LABS_API_KEY != 'demo_key' else "demo_mode",
            "fast2sms": "configured" if FAST2SMS_API_KEY != 'demo_key' else "demo_mode"
        }
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
