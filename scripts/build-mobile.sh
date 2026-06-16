#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$ROOT/artifacts/clarity-mobile"

cd "$MOBILE"

if ! command -v eas >/dev/null 2>&1; then
  echo "Installing eas-cli..."
  pnpm exec eas --version
fi

if ! pnpm exec eas whoami >/dev/null 2>&1; then
  echo ""
  echo "Log in to Expo first:"
  echo "  cd artifacts/clarity-mobile && pnpm exec eas login"
  echo ""
  exit 1
fi

if ! grep -q '"projectId"' app.json 2>/dev/null; then
  echo "Linking EAS project (one-time)..."
  pnpm exec eas init --non-interactive
fi

PLATFORM="${1:-all}"
PROFILE="${2:-preview}"

case "$PLATFORM" in
  android|ios|all) ;;
  *)
    echo "Usage: $0 [android|ios|all] [preview|production]"
    exit 1
    ;;
esac

echo "Building $PLATFORM with profile $PROFILE..."
pnpm exec eas build --platform "$PLATFORM" --profile "$PROFILE" --non-interactive

echo ""
echo "When the build finishes, download the install file from the Expo dashboard link above."
echo "Android: install the .apk directly on your phone."
echo "iOS: install the .ipa via the Expo install page (Apple Developer account required for device installs)."
