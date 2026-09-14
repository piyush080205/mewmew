"""Process-wide singletons shared across routers: the logger and the
pooled httpx client. `http_client` is set by server.py's lifespan handler
on startup; other modules read `shared.http_client` (not a `from shared
import http_client` binding, which would freeze the pre-startup `None`).
"""
import logging
from typing import Optional
import httpx

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("nirbhay")

http_client: Optional[httpx.AsyncClient] = None
