---
name: Supabase user sessions
description: Why authenticated member requests must bypass the project connector.
---

Use direct Supabase project access for both anonymous/auth requests and RLS-protected member requests, with the public anon key and, for member operations, the member bearer token.

**Why:** The connector rejected forwarded member tokens. Later, removal of the runtime REST connection broke signup/signin and public directory reads even though the separate management MCP remained connected. Management access does not supply app-runtime connectivity.

**How to apply:** Keep the project URL as a non-secret environment variable and the anon key in Replit Secrets. Never substitute the service-role key or weaken RLS to work around member-session failures.

Use the separately connected Supabase management MCP for schema inspection and additive migrations, not the app's REST connector.

**Why:** The REST connector has no SQL/DDL channel. After management MCP was connected mid-session, its callbacks were available to the main agent but not an already-running helper.

**How to apply:** Read the current MCP skill and verify the project matches the app before migrations. If a helper cannot see newly mounted callbacks, check whether the main agent can apply the prepared migration. An installed connection and an on-disk MCP skill do not guarantee callable tools: a later session had undefined callbacks in both main and helper runtimes. If neither runtime has them, report the migration as unapplied; do not reconnect a healthy integration or seek credentials as a workaround.