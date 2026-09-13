import asyncio
import os

from dotenv import load_dotenv
from supabase import acreate_client
from supabase._async.client import AsyncClient

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SECRET_KEY")

_client: AsyncClient | None = None
_client_lock = asyncio.Lock()


async def get_supabase() -> AsyncClient:
    """Return a lazily-created, process-wide async Supabase client.

    Using the async client (instead of the sync `create_client`) means DB
    calls no longer block the event loop while awaited.
    """
    global _client
    if _client is None:
        async with _client_lock:
            if _client is None:
                _client = await acreate_client(url, key)
    return _client
