---
name: Incognito preview sessions
description: How Chrome Incognito affects SniffTown session cookies in Replit development previews.
---

Do not rely on an embedded private Replit development preview for isolated multi-account authentication tests in Chrome Incognito. Use the development URL as a top-level page from a separate Replit-authenticated browser profile, or use a temporary published URL.

**Why:** Supabase password authentication can succeed while the immediately following current-user request receives no HTTP-only session cookie. Secure and SameSite=None cookie attributes do not override Incognito's third-party-cookie blocking.

**How to apply:** When testing two accounts, first distinguish an authentication rejection from a missing returned cookie. If sign-in succeeds but the next session lookup is anonymous, move the test to a first-party page rather than weakening session security.