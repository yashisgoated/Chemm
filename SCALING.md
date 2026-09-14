# Scaling (500+ users)

## Target

Designed for **500+ registered users** and roughly **500 active** concurrent users on a single Firebase project + serverless API routes.

## What scales well

- Paginated messages (40/page)
- Conversation list limited to 50
- Scoped listeners (participants only)
- Short-lived ICE candidates cleaned after calls
- Presence heartbeat ~25s (not per-second)
- Typing TTL + debounce
- Rate-limited CHEMM lookup

## Cost hotspots to watch

| Hotspot | Mitigation |
|---|---|
| Presence writes | Increase interval; consider RTDB `onDisconnect` |
| Typing writes | Already throttled; drop if offline |
| Call ICE spam | Cap candidates; delete after end |
| Unbounded listeners | Always unsubscribe on unmount |

## Beyond ~few thousand concurrent

1. Move rate limits to Redis/Upstash
2. Cloud Functions for CHEMM allocation + stale call sweeper
3. Presence on Realtime Database
4. Dedicated TURN capacity
5. Optional message queue for offline send
6. Consider Signal Protocol / MLS for multi-device ratchet
