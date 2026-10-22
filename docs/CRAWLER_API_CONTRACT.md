# Internal TikTok Crawler API Specification & Proxy Integration Contract

Version: 2.0 (Verified against Python Crawler Implementation)  
Status: Production Contract  
Date: 2026-10-20  

---

## 1. Architectural Overview & Network Boundaries

In the TikTok Influencer Monitor architecture, video collection is delegated to a separately hosted **Internal TikTok Crawler Service** (`python run.py` / bottle + cheroot + curl_cffi in Docker) to completely replace external paid scraping services (Bright Data).

### Network Boundaries and Connection Ownership

```
[ Client Browser ]
        │  HTTPS
        ▼
[ Influencer Monitor Backend (NestJS) ]
   (Direct connections: Postgres, Redis; never uses proxy)
        │
        │ Internal REST API (`INTERNAL_CRAWLER_BASE_URL` + Header Auth + Dynamic Proxy Headers)
        ▼
[ Internal TikTok Crawler Service (Bottle/curl_cffi) ]
        │
        │ Outbound TikTok Requests (Sticky Residential Exit Sessions)
        ▼
[ US Residential Proxy Gateway (p.webshare.io / Custom) ]
        │
        ▼
[ TikTok Web Platform (www.tiktok.com) ]
```

### Critical Network Isolation Rules:
1. **Frontend / Browser**:
   - Communicates exclusively with the Influencer Monitor backend at `/api/v1`.
   - Never receives proxy credentials or talks directly to the internal crawler or TikTok.
2. **Influencer Monitor Backend**:
   - Owns PostgreSQL database connections, Redis queue connections, and dashboard reporting.
   - Communicates with the Internal Crawler API over private/internal network HTTP (`http://localhost:8000`).
   - Never routes its own traffic (PostgreSQL, Redis, frontend responses) through the residential proxy.
3. **Internal TikTok Crawler Service**:
   - Owns outbound HTTP connections to TikTok (`curl_cffi` sessions).
   - Manages residential proxy sessions (e.g., US residential proxies), user-agent rotation, IP rotation, and TikTok signature generation.
   - Extracts proxy settings dynamically per-request from `x-crawler-proxy-*` headers, isolating pooled sessions per `(country, proxy_identity)`.

---

## 2. Crawler API Endpoints Specification

### 2.1 Health & Readiness Check
- **Route**: `GET /health` or `GET /`
- **Method**: `GET`
- **Response**: `200 OK`
```json
{
  "status": "ok",
  "proxy_support": "header_forwarding_v1",
  "endpoints": [
    "/videos/details",
    "/videos/media",
    "/videos/comments",
    "/users/profile",
    "/users/videos"
  ]
}
```

---

### 2.2 Creator Profile Resolution
- **Route**: `GET /users/profile`
- **Method**: `GET`
- **Query Parameters**:
  - `user`: Required. TikTok username (e.g. `mrbeast` or `@mrbeast`) or `secUid` or profile link.
- **Success Response**: `200 OK`
```json
{
  "id": "107955",
  "sec_uid": "MS4wLjABAAAAv7iSuuXDJGDvJkmH_vz1qkDZYo1apxgzaxdBSeIuPiM",
  "username": "mrbeast",
  "nickname": "MrBeast",
  "link": "https://www.tiktok.com/@mrbeast",
  "profile_picture": "https://p16-sign.tiktokcdn-us.com/tos-useast5-avt-0068-tx/...",
  "is_verified": true,
  "is_private": false,
  "biography": "I want to make the world a better place",
  "bio_link": "https://mrbeast.com",
  "language": "en",
  "region": "US",
  "created_at": "2019-01-01T00:00:00Z",
  "stats": {
    "follower_count": 105000000,
    "following_count": 312,
    "heart_count": 999999999,
    "video_count": 450,
    "digg_count": 0,
    "friend_count": 0
  }
}
```

---

### 2.3 Creator Videos Retrieval
- **Route**: `GET /users/videos`
- **Method**: `GET`
- **Query Parameters**:
  - `user`: Required. TikTok username (e.g. `mrbeast` or `@mrbeast`).
  - `sort`: Optional. `"latest"` (default), `"popular"`, or `"oldest"`.
  - `cursor`: Optional. Upstream cursor string for pagination.
- **Success Response**: `200 OK`
```json
{
  "user": {
    "id": "107955",
    "sec_uid": "MS4wLjAB...",
    "username": "mrbeast",
    "nickname": "MrBeast"
  },
  "sort": "latest",
  "video_count": 35,
  "videos": [
    {
      "id": "7412345678901234567",
      "link": "https://www.tiktok.com/@mrbeast/video/7412345678901234567",
      "type": "video",
      "description": "Video caption description with #tags",
      "title": null,
      "language": "en",
      "created_at": "2026-10-15T18:30:00Z",
      "is_pinned": false,
      "is_ad": false,
      "stats": {
        "play_count": 1250000,
        "like_count": 89000,
        "comment_count": 1200,
        "share_count": 3500,
        "save_count": 8000
      },
      "author": {
        "id": "107955",
        "username": "mrbeast",
        "nickname": "MrBeast"
      },
      "video": {
        "duration_seconds": 45,
        "width": 1080,
        "height": 1920,
        "cover": "https://...",
        "play_link": "https://..."
      },
      "cover": "https://..."
    }
  ],
  "next_cursor": "1729000000000",
  "has_more": true
}
```

---

### 2.4 Single Video Details
- **Route**: `GET /videos/details`
- **Method**: `GET`
- **Query Parameters**:
  - `video`: Required. Numeric video ID (string) or video URL.
- **Success Response**: `200 OK` (returns single video object as in 2.3).

---

## 3. Dynamic Proxy Request Headers Contract

When US residential proxy is configured in NestJS, the following headers are forwarded with each crawler request:

| Header Name | Type | Description |
|---|---|---|
| `x-crawler-auth` | string (optional) | Shared secret token matching `CRAWLER_AUTH_TOKEN`. |
| `x-crawler-proxy-enabled` | `"true"` \| `"false"` | Tells crawler whether to route outbound call via proxy. |
| `x-crawler-proxy-protocol` | `"http"` \| `"https"` \| `"socks5"` | Proxy protocol (default: `http`). |
| `x-crawler-proxy-host` | string | Proxy host IP or domain (e.g. `p.webshare.io`). |
| `x-crawler-proxy-port` | integer (1-65535) | Proxy port (e.g. `80`). |
| `x-crawler-proxy-username` | string (optional) | Proxy username. |
| `x-crawler-proxy-password` | string (optional) | Proxy password. |
| `x-crawler-proxy-region` | string (optional) | Country / exit region code (e.g. `us`). |

### Session Isolation Guarantee:
- The crawler pools `curl_cffi` client handles by `(country, proxy_identity)`.
- `proxy_identity` is derived from SHA-256 of the proxy configuration.
- Sessions initialized with Proxy A cannot be reused for requests with Proxy B or Direct requests.
- No proxy passwords or tokens are printed in crawler logs or HTTP error bodies.

---

## 4. Error Code Mapping

| Crawler Status | Meaning | Influencer Monitor Outcome |
|---|---|---|
| `400 Bad Request` | Invalid query parameters or bad proxy config | Marked as `FAILED` (no retry) |
| `401 Unauthorized` | Missing / invalid `x-crawler-auth` token | Marked as `FAILED` |
| `404 Not Found` | Creator username does not exist | Influencer status updated to `NOT_FOUND` |
| `502 Bad Gateway` | TikTok rate limit / block / upstream failure | Outcome recorded as `BLOCKED` or `FAILED`; BullMQ backoff applied |
| `500 Server Error` | Unhandled crawler internal exception | Outcome recorded as `FAILED` |
