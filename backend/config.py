"""Environment configuration, loaded once at import time."""
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

UNWIRED_LABS_API_KEY = os.environ.get('UNWIRED_LABS_API_KEY', 'demo_key')
FAST2SMS_API_KEY = os.environ.get('FAST2SMS_API_KEY', 'demo_key')
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
