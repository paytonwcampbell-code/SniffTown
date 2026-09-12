---
name: Expo launch sessions
description: How to recognize and recover from a transient Replit Expo launch-session login failure.
---

The Replit Expo launch-session login can fail on a fresh workspace because the home-directory `.expo` folder is absent. Retrying alone does not repair this prerequisite.

**Why:** A QR code produced by an unauthenticated CLI opens in Expo Go with an account-mismatch error even when Expo Go is correctly signed into the temporary Replit account.

**How to apply:** Ensure Expo's state directory exists before login; do not rely on state left by a previous workspace session. Before treating the QR code as usable, confirm Expo CLI reports the same temporary Replit account as Expo Go. Keep authentication failure fatal rather than printing an unusable QR code.