---
name: Moderation alert delivery
description: Delivery scope and acknowledgment semantics for park moderation alerts.
---

Park moderation alerts use the authenticated mobile Inbox, not device push. Treat device push as a separate delivery capability, not something already available.

**Why:** This project had no device-token registration or push delivery infrastructure when moderation alerts were added. An in-app alert provides durable delivery without introducing unconfigured push services.

**How to apply:** Keep any future push title, body, and payload generic; never include reporter identity, report details, or post content. Preserve recipient authorization checks when opening alerts.

Coalesced alert acknowledgments must refer to the version the client actually observed.

**Why:** A report can update an unread alert while an older read request is in flight. Unconditional acknowledgment could hide the newer report.

**How to apply:** Compare the observed revision under a database lock and leave newer revisions unread.

Keep timestamp-based revisions opaque throughout API serialization.

**Why:** PostgreSQL timestamps retain microseconds, but generated date-time validators coerce to JavaScript dates and lose precision. Equality-based acknowledgment then silently fails.

**How to apply:** Use a separate uncoerced revision string, and test nonzero microseconds across list-response and acknowledgment-request boundaries.