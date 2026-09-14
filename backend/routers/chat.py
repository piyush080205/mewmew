"""Feature 2: Contextual Safety Guidance (Chat Analysis) via Gemini."""
import base64

from fastapi import APIRouter, HTTPException

import shared
from config import GEMINI_API_KEY
from models import ChatAnalysisRequest, ChatAnalysisResponse, RedFlag

logger = shared.logger

router = APIRouter()

CHAT_ANALYSIS_SYSTEM_PROMPT = """You are a safety advisor AI specialized in detecting potential grooming, manipulation, and social engineering patterns in conversations. Your role is to protect users, especially young people and vulnerable individuals, from online predators and scammers.

Analyze the chat screenshot provided and look for these specific red flags:

1. **LOVE_BOMBING**: Excessive compliments, declarations of love too soon, overwhelming attention
   - Examples: "You're the most beautiful person I've ever seen", "I've never felt this way about anyone", "You're my soulmate"

2. **PERSONAL_INFO_REQUEST**: Requests for sensitive personal information
   - Examples: Asking for home address, school/workplace, photos, financial details, ID documents

3. **PRESSURE_TACTICS**: Creating urgency, guilt-tripping, emotional manipulation
   - Examples: "If you loved me you would...", "I need this now", "You're the only one who can help"

4. **ISOLATION_ATTEMPTS**: Trying to separate victim from support network
   - Examples: "Don't tell anyone about us", "Your friends don't understand", "This is our secret"

5. **INAPPROPRIATE_CONTENT**: Age-inappropriate discussions, sexual content, explicit requests
   - Examples: Sexual comments, requests for intimate photos, inappropriate questions about body

For each red flag detected, provide:
- The type of red flag
- Severity (low/medium/high/critical)
- The specific text or pattern that triggered this detection
- A clear explanation of why this is concerning

Also provide:
- Overall risk level (safe/low_risk/moderate_risk/high_risk/dangerous)
- Risk score (0-100)
- Practical advisory for the user
- Specific action items

Respond in JSON format with this structure:
{
    "risk_level": "string",
    "risk_score": number,
    "red_flags": [
        {
            "type": "string",
            "severity": "string",
            "evidence": "string",
            "explanation": "string"
        }
    ],
    "advisory": "string",
    "action_items": ["string"]
}

Be thorough but avoid false positives. Consider context and relationship dynamics. Prioritize user safety while being balanced in assessment."""

@router.post("/chat/analyze", response_model=ChatAnalysisResponse)
async def analyze_chat_safety(request: ChatAnalysisRequest):
    """
    Analyze a chat screenshot for potential grooming or manipulation patterns.
    Uses Google Gemini AI for intelligent pattern detection.
    """
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="AI service not configured. Please set GEMINI_API_KEY."
        )

    try:
        from google import genai
        from google.genai import types
        import json

        # Create client with API key
        client = genai.Client(api_key=GEMINI_API_KEY)

        # Build the message
        analysis_prompt = f"""{CHAT_ANALYSIS_SYSTEM_PROMPT}

Please analyze this chat screenshot for safety concerns."""
        if request.context:
            analysis_prompt += f"\n\nAdditional context from user: {request.context}"

        # Prepare image as Part
        image_part = types.Part.from_bytes(
            data=base64.b64decode(request.image_base64),
            mime_type="image/png"
        )

        # Send for analysis with image using gemini-2.5-flash model
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[analysis_prompt, image_part]
        )

        # Parse the JSON response
        response_text = response.text.strip()

        # Handle if response is wrapped in markdown code blocks
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()

        try:
            analysis_data = json.loads(response_text)
        except json.JSONDecodeError:
            # If JSON parsing fails, create a default safe response
            logger.warning(f"Failed to parse AI response as JSON: {response_text[:200]}")
            analysis_data = {
                "risk_level": "low_risk",
                "risk_score": 25,
                "red_flags": [],
                "advisory": "Unable to fully analyze the image. Please ensure it's a clear chat screenshot.",
                "action_items": ["Try uploading a clearer screenshot", "If concerned, trust your instincts and speak to a trusted adult"]
            }

        # Build red flags list
        red_flags = []
        for flag in analysis_data.get('red_flags', []):
            red_flags.append(RedFlag(
                type=flag.get('type', 'unknown'),
                severity=flag.get('severity', 'medium'),
                evidence=flag.get('evidence', 'Pattern detected'),
                explanation=flag.get('explanation', 'Potential concern identified')
            ))

        # Add helpful resources
        resources = [
            {"name": "Childline India", "contact": "1098", "type": "helpline"},
            {"name": "Women Helpline", "contact": "181", "type": "helpline"},
            {"name": "Cyber Crime Portal", "url": "https://cybercrime.gov.in", "type": "website"},
            {"name": "National Commission for Women", "contact": "7827-170-170", "type": "helpline"}
        ]

        return ChatAnalysisResponse(
            risk_level=analysis_data.get('risk_level', 'low_risk'),
            risk_score=analysis_data.get('risk_score', 25),
            red_flags=red_flags,
            advisory=analysis_data.get('advisory', 'Stay alert and trust your instincts.'),
            action_items=analysis_data.get('action_items', ['If something feels wrong, talk to a trusted adult']),
            resources=resources
        )

    except ImportError as e:
        logger.error(f"Failed to import google-generativeai: {e}")
        raise HTTPException(
            status_code=500,
            detail="AI service not available. Please install google-generativeai package."
        )
    except Exception as e:
        logger.error(f"Chat analysis error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {str(e)}"
        )
