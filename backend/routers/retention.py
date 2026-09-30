"""User retention features: streaks, badges, dashboard stats, community reports, safety tips."""
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from supabase_client import get_supabase
from models import (
    CheckinResponse,
    StreakInfo,
    BadgeOut,
    UserBadgeOut,
    DashboardStats,
    CommunityReportIn,
    CommunityReportOut,
    SafetyTipOut,
)

router = APIRouter()


# ─── Daily Check-in & Streaks ────────────────────────────────────────

@router.post("/checkin", response_model=CheckinResponse)
async def daily_checkin(user_id: str = Query("default_user")):
    sb = await get_supabase()
    today = date.today().isoformat()

    existing = (
        await sb.table("daily_checkins")
        .select("id")
        .eq("user_id", user_id)
        .eq("checkin_date", today)
        .execute()
    )
    already_checked_in = len(existing.data) > 0

    if not already_checked_in:
        await sb.table("daily_checkins").insert(
            {"user_id": user_id, "checkin_date": today}
        ).execute()

    streak = await _update_streak(user_id)
    new_badges = await _check_and_award_badges(user_id, streak)

    return CheckinResponse(
        already_checked_in=already_checked_in,
        streak=streak,
        new_badges=new_badges,
    )


@router.get("/checkin/streak", response_model=StreakInfo)
async def get_streak(user_id: str = Query("default_user")):
    sb = await get_supabase()
    row = (
        await sb.table("user_streaks")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )
    if row.data:
        d = row.data[0]
        return StreakInfo(
            current_streak=d["current_streak"],
            longest_streak=d["longest_streak"],
            total_checkins=d["total_checkins"],
            last_checkin_date=d["last_checkin_date"],
        )
    return StreakInfo(current_streak=0, longest_streak=0, total_checkins=0, last_checkin_date=None)


async def _update_streak(user_id: str) -> StreakInfo:
    sb = await get_supabase()
    today = date.today()
    yesterday = today - timedelta(days=1)

    row = (
        await sb.table("user_streaks")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )

    total_res = (
        await sb.table("daily_checkins")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .execute()
    )
    total = total_res.count or 0

    if row.data:
        d = row.data[0]
        last = date.fromisoformat(d["last_checkin_date"]) if d["last_checkin_date"] else None
        if last == today:
            return StreakInfo(
                current_streak=d["current_streak"],
                longest_streak=d["longest_streak"],
                total_checkins=total,
                last_checkin_date=today.isoformat(),
            )
        elif last == yesterday:
            new_streak = d["current_streak"] + 1
        else:
            new_streak = 1

        longest = max(d["longest_streak"], new_streak)
        await sb.table("user_streaks").update({
            "current_streak": new_streak,
            "longest_streak": longest,
            "last_checkin_date": today.isoformat(),
            "total_checkins": total,
            "updated_at": datetime.utcnow().isoformat(),
        }).eq("user_id", user_id).execute()

        return StreakInfo(
            current_streak=new_streak,
            longest_streak=longest,
            total_checkins=total,
            last_checkin_date=today.isoformat(),
        )
    else:
        await sb.table("user_streaks").insert({
            "user_id": user_id,
            "current_streak": 1,
            "longest_streak": 1,
            "last_checkin_date": today.isoformat(),
            "total_checkins": total,
        }).execute()
        return StreakInfo(
            current_streak=1,
            longest_streak=1,
            total_checkins=total,
            last_checkin_date=today.isoformat(),
        )


# ─── Badges ──────────────────────────────────────────────────────────

@router.get("/badges", response_model=list[BadgeOut])
async def list_badges():
    sb = await get_supabase()
    res = await sb.table("badges").select("*").order("sort_order").execute()
    return [BadgeOut(**b) for b in res.data]


@router.get("/badges/user", response_model=list[UserBadgeOut])
async def get_user_badges(user_id: str = Query("default_user")):
    sb = await get_supabase()
    res = (
        await sb.table("user_badges")
        .select("*, badges(*)")
        .eq("user_id", user_id)
        .execute()
    )
    out = []
    for row in res.data:
        badge = row.get("badges", {})
        out.append(UserBadgeOut(
            badge_id=row["badge_id"],
            name=badge.get("name", ""),
            description=badge.get("description", ""),
            icon=badge.get("icon", ""),
            category=badge.get("category", ""),
            earned_at=row["earned_at"],
        ))
    return out


async def _check_and_award_badges(user_id: str, streak: StreakInfo) -> list[UserBadgeOut]:
    sb = await get_supabase()
    all_badges = (await sb.table("badges").select("*").execute()).data
    earned = (
        await sb.table("user_badges")
        .select("badge_id")
        .eq("user_id", user_id)
        .execute()
    )
    earned_ids = {r["badge_id"] for r in earned.data}

    stats = await _gather_user_stats(user_id)
    new_badges: list[UserBadgeOut] = []

    for badge in all_badges:
        if badge["id"] in earned_ids:
            continue
        req_type = badge["requirement_type"]
        req_val = badge["requirement_value"]
        current_val = stats.get(req_type, 0)
        if current_val >= req_val:
            await sb.table("user_badges").insert({
                "user_id": user_id,
                "badge_id": badge["id"],
            }).execute()
            new_badges.append(UserBadgeOut(
                badge_id=badge["id"],
                name=badge["name"],
                description=badge["description"],
                icon=badge["icon"],
                category=badge["category"],
                earned_at=datetime.utcnow().isoformat(),
            ))

    return new_badges


async def _gather_user_stats(user_id: str) -> dict:
    sb = await get_supabase()

    streak_row = (
        await sb.table("user_streaks").select("*").eq("user_id", user_id).execute()
    )
    s = streak_row.data[0] if streak_row.data else {}

    trips = (
        await sb.table("trips")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .eq("status", "ended")
        .execute()
    )

    contacts = (
        await sb.table("emergency_contacts")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .execute()
    )

    reports = (
        await sb.table("community_reports")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .execute()
    )

    checkins = (
        await sb.table("daily_checkins")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .execute()
    )

    return {
        "streak_days": s.get("current_streak", 0),
        "total_trips": trips.count or 0,
        "total_checkins": checkins.count or 0,
        "guardians_added": contacts.count or 0,
        "reports_submitted": reports.count or 0,
        "night_trips": 0,
        "chat_analyses": 0,
    }


# ─── Dashboard Stats ─────────────────────────────────────────────────

@router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(user_id: str = Query("default_user")):
    sb = await get_supabase()

    trips_res = (
        await sb.table("trips")
        .select("id, start_time, end_time, status, locations")
        .eq("user_id", user_id)
        .order("start_time", desc=True)
        .execute()
    )

    total_trips = len(trips_res.data)
    completed_trips = sum(1 for t in trips_res.data if t["status"] == "ended")
    total_distance_km = 0.0
    total_duration_minutes = 0

    for trip in trips_res.data:
        if trip.get("start_time") and trip.get("end_time"):
            start = datetime.fromisoformat(trip["start_time"].replace("Z", "+00:00"))
            end = datetime.fromisoformat(trip["end_time"].replace("Z", "+00:00"))
            total_duration_minutes += int((end - start).total_seconds() / 60)

        locs = trip.get("locations") or []
        if isinstance(locs, list) and len(locs) >= 2:
            for i in range(1, len(locs)):
                prev = locs[i - 1]
                curr = locs[i]
                if isinstance(prev, dict) and isinstance(curr, dict):
                    total_distance_km += _haversine(
                        prev.get("latitude", 0), prev.get("longitude", 0),
                        curr.get("latitude", 0), curr.get("longitude", 0),
                    )

    streak_res = (
        await sb.table("user_streaks").select("*").eq("user_id", user_id).execute()
    )
    streak = streak_res.data[0] if streak_res.data else {}

    badges_count = (
        await sb.table("user_badges")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .execute()
    )

    reports_count = (
        await sb.table("community_reports")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .execute()
    )

    safety_score = min(100, (
        (streak.get("current_streak", 0) * 2) +
        (completed_trips * 3) +
        ((badges_count.count or 0) * 5) +
        ((reports_count.count or 0) * 2)
    ))

    return DashboardStats(
        total_trips=total_trips,
        completed_trips=completed_trips,
        total_distance_km=round(total_distance_km, 1),
        total_duration_minutes=total_duration_minutes,
        current_streak=streak.get("current_streak", 0),
        longest_streak=streak.get("longest_streak", 0),
        total_checkins=streak.get("total_checkins", 0),
        badges_earned=badges_count.count or 0,
        reports_submitted=reports_count.count or 0,
        safety_score=safety_score,
    )


import math

def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ─── Community Safety Reports ────────────────────────────────────────

@router.post("/community/reports", response_model=CommunityReportOut)
async def create_report(body: CommunityReportIn):
    sb = await get_supabase()
    row = {
        "user_id": body.user_id,
        "latitude": body.latitude,
        "longitude": body.longitude,
        "report_type": body.report_type,
        "description": body.description,
        "severity": body.severity,
    }
    res = await sb.table("community_reports").insert(row).execute()
    return CommunityReportOut(**res.data[0])


@router.get("/community/reports", response_model=list[CommunityReportOut])
async def get_nearby_reports(
    lat: float = Query(...),
    lng: float = Query(...),
    radius_km: float = Query(5.0),
    limit: int = Query(50),
):
    sb = await get_supabase()
    res = (
        await sb.table("community_reports")
        .select("*")
        .gte("expires_at", datetime.utcnow().isoformat())
        .order("created_at", desc=True)
        .limit(200)
        .execute()
    )
    nearby = []
    for r in res.data:
        dist = _haversine(lat, lng, r["latitude"], r["longitude"])
        if dist <= radius_km:
            nearby.append(CommunityReportOut(**r))
        if len(nearby) >= limit:
            break
    return nearby


@router.post("/community/reports/{report_id}/upvote")
async def upvote_report(report_id: str, user_id: str = Query("default_user")):
    sb = await get_supabase()
    existing = (
        await sb.table("report_upvotes")
        .select("user_id")
        .eq("user_id", user_id)
        .eq("report_id", report_id)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="Already upvoted")

    await sb.table("report_upvotes").insert({
        "user_id": user_id,
        "report_id": report_id,
    }).execute()

    report = (
        await sb.table("community_reports")
        .select("upvotes")
        .eq("id", report_id)
        .execute()
    )
    if not report.data:
        raise HTTPException(status_code=404, detail="Report not found")

    new_count = (report.data[0]["upvotes"] or 0) + 1
    await sb.table("community_reports").update(
        {"upvotes": new_count}
    ).eq("id", report_id).execute()

    return {"upvotes": new_count}


# ─── Safety Tips ─────────────────────────────────────────────────────

@router.get("/tips/today", response_model=SafetyTipOut)
async def get_todays_tip():
    sb = await get_supabase()
    day = date.today().timetuple().tm_yday
    res = (
        await sb.table("safety_tips")
        .select("*")
        .eq("day_of_year", day)
        .limit(1)
        .execute()
    )
    if res.data:
        return SafetyTipOut(**res.data[0])
    fallback = (
        await sb.table("safety_tips")
        .select("*")
        .limit(1)
        .execute()
    )
    if fallback.data:
        return SafetyTipOut(**fallback.data[0])
    return SafetyTipOut(
        id="default",
        title="Stay Safe",
        content="Always share your location with a trusted contact when traveling.",
        category="awareness",
        icon="shield-checkmark",
    )


@router.get("/tips", response_model=list[SafetyTipOut])
async def get_tips(
    category: Optional[str] = Query(None),
    limit: int = Query(10),
):
    sb = await get_supabase()
    q = sb.table("safety_tips").select("*")
    if category:
        q = q.eq("category", category)
    res = await q.limit(limit).execute()
    return [SafetyTipOut(**t) for t in res.data]
