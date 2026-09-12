#!/bin/sh
set -u

attempt=1
max_attempts=5

while [ "$attempt" -le "$max_attempts" ]; do
  echo "Authenticating Expo CLI (attempt $attempt/$max_attempts)…"
  if pnpm exec create-launch login --session "$REPLIT_EXPO_SESSION_SECRET" &&
    account="$(pnpm exec expo whoami 2>/dev/null)"; then
    if [ -n "$account" ]; then
      echo "Expo CLI authenticated as $account"
      exit 0
    fi
  fi
  attempt=$((attempt + 1))
  if [ "$attempt" -le "$max_attempts" ]; then
    sleep 2
  fi
done

echo "Expo CLI authentication did not complete; refusing to publish an unusable Expo Go QR code." >&2
exit 1