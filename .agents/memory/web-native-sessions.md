---
name: Web and native sessions
description: The intentional authentication split between SniffTown's browser and native mobile clients.
---

SniffTown's website should continue using server-managed HTTP-only cookies. The native iPhone client uses short-lived bearer access tokens plus rotated refresh tokens stored in secure device storage. Both clients use the same accounts, API, and Supabase backend.

**Why:** Browser cookies reduce token exposure to web JavaScript, while native apps cannot rely on browser cookie behavior and need a durable, refreshable device session.

**How to apply:** New protected API routes must accept the centralized bearer-first, cookie-fallback session extractor. Do not make the website store bearer tokens or create separate mobile accounts.