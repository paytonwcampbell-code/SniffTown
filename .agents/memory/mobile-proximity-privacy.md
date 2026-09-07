---
name: Mobile proximity privacy
description: The product boundary for location-based discovery across SniffTown's native app and website.
---

Collect location only as an opt-in native-app capability. Nearby dog discovery defaults to a two-mile radius. Keep exact coordinates server-side and show other members only coarse distance or neighborhood-level context.

The website remains a location-neutral community and park-pack directory. It may display already-authorized proximity results for a signed-in member, but it should not prompt for or continuously collect browser location.

**Why:** The user considers location sharing an in-app capability rather than a website feature, and exact location disclosure would create unnecessary privacy and safety risk.

**How to apply:** Request native location permission only when the member enables nearby discovery, explain why it is needed, support disabling or updating it, and never include coordinates in public API responses, URLs, analytics, or peer-facing profiles.