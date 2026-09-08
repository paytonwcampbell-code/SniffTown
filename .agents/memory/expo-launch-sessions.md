---
name: Expo launch sessions
description: How to recognize and recover from a transient Replit Expo launch-session login failure.
---

The Replit Expo launch-session login can transiently fail while creating its local state file, yet Metro may still start and print a QR code.

**Why:** A QR code produced by an unauthenticated CLI opens in Expo Go with an account-mismatch error even when Expo Go is correctly signed into the temporary Replit account.

**How to apply:** Before treating the QR code as usable, confirm Expo CLI reports the same temporary Replit account as Expo Go. If it does not, repeat the launch-session login and restart the managed mobile workflow after authentication succeeds.