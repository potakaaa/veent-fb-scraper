#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$PROJECT_DIR/server"
PLIST_SRC="$SCRIPT_DIR/com.veent.fbevents.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.veent.fbevents.plist"
LABEL="com.veent.fbevents"

echo "==> FB Events Tool — install"

if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js not found. Install via: brew install node"
  exit 1
fi
NODE_VERSION=$(node --version | cut -c2- | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "ERROR: Node.js 20+ required (found $(node --version))"
  exit 1
fi
NODE_BIN=$(command -v node)
echo "  Node: $NODE_BIN ($(node --version))"

echo "==> Installing server dependencies"
cd "$SERVER_DIR"
npm install

echo "==> Creating data directory"
mkdir -p "$SERVER_DIR/data"

echo "==> Configuring launchd plist"
sed \
  -e "s|NODE_PLACEHOLDER|$NODE_BIN|g" \
  -e "s|SERVER_PLACEHOLDER|$SERVER_DIR/server.js|g" \
  -e "s|SERVER_DIR_PLACEHOLDER|$SERVER_DIR|g" \
  "$PLIST_SRC" > "$PLIST_DEST"

echo "==> Loading launchd service"
if launchctl list | grep -q "$LABEL"; then
  launchctl unload "$PLIST_DEST" 2>/dev/null || true
fi
launchctl load -w "$PLIST_DEST"

echo ""
echo "==> Done!"
echo ""
echo "Server is running at: http://localhost:7842"
echo "Review UI:            http://localhost:7842"
echo "Server log:           /tmp/fbevents.log"
echo "Server errors:        /tmp/fbevents.err"
echo ""
echo "To load the Chrome extension:"
echo "  1. Open Chrome > Settings > Extensions > Enable Developer Mode"
echo "  2. Click 'Load unpacked'"
echo "  3. Select: $PROJECT_DIR/extension"
echo ""
echo "To stop the server:"
echo "  launchctl unload ~/Library/LaunchAgents/com.veent.fbevents.plist"
echo ""
echo "To start manually (without launchd):"
echo "  node $SERVER_DIR/server.js"
