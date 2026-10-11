---
name: Safety SQL verification
description: Lessons for verifying blocking and account deletion against the existing Supabase schema.
---

Block tests must demonstrate a successful eligible interaction before applying the block.

**Why:** An ineligible pair is denied even without a block, which can give a false impression that blocking works.

**How to apply:** Establish a valid relationship and prove messaging succeeds before testing denial after a block.

Account-deletion assertions must independently cover authored relationships, not just records targeting the deleted user's dogs.

**Why:** Schema-tolerant cleanup can silently skip a mismatched author column while other cascades succeed, leaving personal relationship data behind.

**How to apply:** Verify both directions of relationship cleanup against the actual database schema in rollback-only tests. Do not equate a successful deletion function call with complete erasure.
