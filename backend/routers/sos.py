"""Emergency contacts and offline-first SOS event sync.

These are distinct from the autonomous trips/RISK_RULES pipeline in
routers/trips.py + risk_engine.py: an sos_events row represents a
locally-persisted, confidence-scored SOS raised by the native
motion-detection service (or a manual trigger), synced here once a
communication path (internet) becomes available.
"""
from datetime import datetime
from typing import List

from fastapi import APIRouter, HTTPException

import shared
from models import (
    EmergencyContactIn,
    EmergencyContactOut,
    SosEventSyncRequest,
    SosEventOut,
    SosEventStatusUpdate,
)
from risk_engine import send_sms_alert
from supabase_client import get_supabase
from utils import build_sos_alert_message

logger = shared.logger

router = APIRouter()

# ===========================================
# Emergency Contacts (list-based, supersedes the 3 flat
# guardian_phone fields on trips for the offline SOS pipeline)
# ===========================================

@router.get("/emergency-contacts", response_model=List[EmergencyContactOut])
async def list_emergency_contacts(user_id: str = "default_user"):
    sb = await get_supabase()
    result = await (
        sb.table("emergency_contacts")
        .select("*")
        .eq("user_id", user_id)
        .order("priority")
        .execute()
    )
    return result.data

@router.post("/emergency-contacts", response_model=EmergencyContactOut)
async def create_emergency_contact(contact: EmergencyContactIn):
    sb = await get_supabase()
    row = contact.model_dump()
    result = await sb.table("emergency_contacts").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create emergency contact")
    return result.data[0]

@router.put("/emergency-contacts/{contact_id}", response_model=EmergencyContactOut)
async def update_emergency_contact(contact_id: str, contact: EmergencyContactIn):
    sb = await get_supabase()
    result = await (
        sb.table("emergency_contacts")
        .update(contact.model_dump())
        .eq("id", contact_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Emergency contact not found")
    return result.data[0]

@router.delete("/emergency-contacts/{contact_id}")
async def delete_emergency_contact(contact_id: str):
    sb = await get_supabase()
    await sb.table("emergency_contacts").delete().eq("id", contact_id).execute()
    return {"message": "Emergency contact deleted", "id": contact_id}

# ===========================================
# Offline-First SOS Events
# ===========================================

async def _get_contacts_for_alert(sb, user_id: str) -> List[dict]:
    result = await (
        sb.table("emergency_contacts")
        .select("*")
        .eq("user_id", user_id)
        .order("priority")
        .execute()
    )
    return result.data

async def _server_side_alert_for_sos(sb, event_row: dict) -> None:
    """
    Redundant server-side delivery attempt for a synced SOS event, covering
    the case where the client's own on-device SMS attempt silently failed
    (no SIM credit, carrier block, etc). Best-effort — failures are logged,
    never raised, since the client's own persisted record is authoritative.
    """
    try:
        contacts = await _get_contacts_for_alert(sb, event_row.get("user_id") or "default_user")
        if not contacts:
            return
        lat = event_row.get("latitude")
        lon = event_row.get("longitude")
        location = {"latitude": lat, "longitude": lon} if lat is not None and lon is not None else None
        # Location is embedded in the message itself (maps link, or explicit
        # "unavailable") rather than passed separately, so it can never be
        # silently dropped when a fix is missing or stale.
        message = build_sos_alert_message(
            event_row.get("trigger_reason", "Emergency detected"),
            location,
            location_is_fresh=bool(event_row.get("location_is_fresh", True)),
        )
        for contact in contacts:
            await send_sms_alert(contact["phone_number"], message, None)
    except Exception as e:
        logger.error(f"Server-side SOS alert failed for event {event_row.get('id')}: {e}")

@router.post("/sos/sync")
async def sync_sos_events(payload: SosEventSyncRequest):
    """
    Idempotent upsert of one or more offline-queued SOS events from the
    native Room queue. Safe to call repeatedly (e.g. from a WorkManager
    retry) for the same client_event_id.
    """
    sb = await get_supabase()
    synced_ids = []

    for event in payload.events:
        row = event.model_dump()
        for key, value in row.items():
            if isinstance(value, datetime):
                row[key] = value.isoformat()
        row["synced_at"] = datetime.utcnow().isoformat()

        existing = await (
            sb.table("sos_events")
            .select("id,status")
            .eq("client_event_id", event.client_event_id)
            .execute()
        )

        is_new = not existing.data
        if is_new:
            result = await sb.table("sos_events").insert(row).execute()
            saved = result.data[0] if result.data else row
        else:
            result = await (
                sb.table("sos_events")
                .update(row)
                .eq("client_event_id", event.client_event_id)
                .execute()
            )
            saved = result.data[0] if result.data else row

        # Only fire the redundant server-side alert the first time we see
        # this event synced (and it's a real emergency, not a cancelled one).
        if is_new and not event.cancelled:
            await _server_side_alert_for_sos(sb, saved)

        synced_ids.append(saved.get("id", event.client_event_id))

    return {"synced_ids": synced_ids, "status": "SERVER_SYNCED"}

@router.get("/sos/events", response_model=List[SosEventOut])
async def list_sos_events(user_id: str = "default_user"):
    sb = await get_supabase()
    result = await (
        sb.table("sos_events")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data

@router.patch("/sos/events/{event_id}")
async def update_sos_event(event_id: str, update: SosEventStatusUpdate):
    sb = await get_supabase()
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if not update_data:
        return {"message": "No changes", "id": event_id}
    update_data["updated_at"] = datetime.utcnow().isoformat()
    result = await sb.table("sos_events").update(update_data).eq("id", event_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="SOS event not found")
    return result.data[0]
