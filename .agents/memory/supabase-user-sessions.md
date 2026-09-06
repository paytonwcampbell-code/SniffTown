---
name: Supabase user sessions
description: Why authenticated member requests must bypass the project connector.
---

Use the Supabase connector for project-level anonymous data access, but send RLS-protected member requests directly to the Supabase project with its public anon key plus the member bearer token.

**Why:** The connector accepted password grants but returned 401 when forwarding the freshly issued member token to the current-user endpoint. Direct Supabase requests preserved the end-user identity and restored existing-account sign-in.

**How to apply:** Keep the project URL as a non-secret environment variable and the anon key in Replit Secrets. Never substitute the service-role key or weaken RLS to work around member-session failures.