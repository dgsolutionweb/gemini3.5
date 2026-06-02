#!/usr/bin/env bash
set -euo pipefail

APP_ID="com.douglasrodrigues.lingosnap"
APP_NAME="LingoSnap"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"

pkill -x "$APP_NAME" 2>/dev/null || true
pkill -x "lingosnap" 2>/dev/null || true

for app_path in "/Applications/${APP_NAME}.app" "$HOME/Applications/${APP_NAME}.app"; do
  if [ -d "$app_path" ]; then
    "$LSREGISTER" -u "$app_path" 2>/dev/null || true
  fi
done

paths=(
  "$HOME/Library/Application Support/$APP_ID"
  "$HOME/Library/Application Support/lingosnap"
  "$HOME/Library/Caches/$APP_ID"
  "$HOME/Library/Caches/lingosnap"
  "$HOME/Library/HTTPStorages/$APP_ID"
  "$HOME/Library/HTTPStorages/${APP_ID}.binarycookies"
  "$HOME/Library/Logs/$APP_ID"
  "$HOME/Library/Preferences/$APP_ID.plist"
  "$HOME/Library/Saved Application State/$APP_ID.savedState"
  "$HOME/Library/WebKit/$APP_ID"
  "$HOME/Library/WebKit/lingosnap"
  "$HOME/Library/LaunchAgents/$APP_ID.plist"
  "$HOME/Library/LaunchAgents/${APP_NAME}.plist"
  "$HOME/Applications/${APP_NAME}.app"
  "/Applications/${APP_NAME}.app"
)

for path in "${paths[@]}"; do
  if [ -e "$path" ]; then
    rm -rf "$path"
    printf 'removed %s\n' "$path"
  fi
done

tccutil reset ScreenCapture "$APP_ID" 2>/dev/null || true
"$LSREGISTER" -kill -r -domain local -domain user >/dev/null 2>&1 || true

printf 'LingoSnap macOS user data cleanup completed.\n'
