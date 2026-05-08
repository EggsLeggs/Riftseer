---
title: Auth
sidebar_label: Auth
sidebar_position: 6
---

Auth endpoints let clients register users and manage sessions using Supabase Auth. All routes are under `/api/v1/auth`.

Protected routes require a valid `Authorization: Bearer <access_token>` header. The access token is returned by `login`, `register`, or `refresh`.

Sessions consist of a short-lived **access token** (JWT, 1 hour by default) and a long-lived **refresh token**. Store both securely; only the access token should be sent with API requests.

---

## POST /api/v1/auth/register

Creates a new user account.

**Request body**

```json
{ "email": "user@example.com", "password": "hunter2!!" }
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `email` | string | yes | |
| `password` | string | yes | Min 8 characters |

**Responses**

| Status | Meaning |
|--------|---------|
| `200` | Account created; returns a session (email confirmation disabled) |
| `202` | Account created; confirmation email sent — no session until confirmed |
| `400` | Validation error or account already exists |

**200 body**

```json
{
  "access_token": "eyJ...",
  "refresh_token": "...",
  "expires_in": 3600,
  "token_type": "bearer",
  "user": { "id": "uuid", "email": "user@example.com", "created_at": "2026-01-01T00:00:00Z" }
}
```

**202 body**

```json
{
  "message": "Check your email to confirm your account before signing in.",
  "code": "EMAIL_CONFIRMATION_REQUIRED"
}
```

---

## POST /api/v1/auth/login

Authenticates with email and password.

**Request body**

```json
{ "email": "user@example.com", "password": "hunter2!!" }
```

**Responses**

| Status | Meaning |
|--------|---------|
| `200` | Returns a session |
| `400` | Missing fields or malformed request |
| `401` | Invalid credentials or unconfirmed email |

**200 body** — same shape as `register` 200.

---

## POST /api/v1/auth/refresh

Exchanges a refresh token for a new access token and refresh token. Refresh tokens are rotated on each use — store the new pair returned by this endpoint.

**Request body**

```json
{ "refresh_token": "..." }
```

**Responses**

| Status | Meaning |
|--------|---------|
| `200` | Returns a new session |
| `401` | Refresh token invalid or expired |

**200 body** — same shape as `register` 200.

---

## POST /api/v1/auth/logout

Invalidates the current session server-side. Both the access token and refresh token are revoked.

**Headers**

```http
Authorization: Bearer <access_token>
```

**Responses**

| Status | Meaning |
|--------|---------|
| `200` | Session revoked |
| `401` | Missing or invalid `Authorization` header |

**200 body**

```json
{ "message": "Logged out successfully" }
```

---

## GET /api/v1/auth/me

Returns the authenticated user's profile. Used by clients to restore a session on page load.

**Headers**

```http
Authorization: Bearer <access_token>
```

**Responses**

| Status | Meaning |
|--------|---------|
| `200` | Returns user profile |
| `401` | Missing or invalid token |

**200 body**

```json
{ "id": "uuid", "email": "user@example.com", "created_at": "2026-01-01T00:00:00Z" }
```
