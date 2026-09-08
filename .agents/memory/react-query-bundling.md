---
name: React Query bundling
description: Production bundling requirement for the web app and workspace API client.
---

The web production bundle must resolve the app and the workspace-generated API hooks to one shared React Query runtime.

**Why:** A production bundle included two React Query copies even though package versions matched. Hooks then could not see the app's QueryClientProvider, causing the entire published website to render its error boundary while every API endpoint remained healthy.

**How to apply:** Preserve React Query deduplication in the web bundler whenever changing workspace dependencies or build configuration. For a provider-related production crash, compare runtime copies in the built bundle before debugging the API.