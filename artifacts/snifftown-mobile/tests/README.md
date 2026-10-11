# Park-pack regression checks

From the workspace root:

```sh
pnpm --filter @workspace/snifftown-mobile test
```

No running Expo server, device, credentials, or database is required.

- `parks.test.jsx` renders the actual mobile Parks screen with a signed-in
  session fixture, a fresh React Query cache, and the generated API hooks.
  It exercises opening and submitting the form, trimmed request fields,
  a network list refresh, creator membership display, form reset, short-field
  validation without a POST, and the specific duplicate explanation and retry.
  Device adapters, basic native presentation components, and `fetch` are mocked.
- `park-create-api.test.js` mounts the actual Express community router on an
  ephemeral local port. It checks that successful creation writes the creator's
  membership and returns joined/creator flags, and that a duplicate returns 409
  without creating a park or membership. Only the Supabase boundary is mocked.

These tests protect screen behavior and the API orchestration contract. They
do not validate real Supabase policies/persistence, real sign-in, or native
keyboard and touch behavior on a device. They never create live park packs.- `member-safety.test.jsx` renders the actual report/block sheet and Settings
  screen. It checks that reports send the chosen reason with trimmed details,
  that blocking and account deletion only happen after the member confirms,
  that a failed deletion keeps the member signed in with an explanation, and
  that Settings links to the Privacy Policy, Terms and Blocked members.
