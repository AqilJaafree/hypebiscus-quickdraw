#!/usr/bin/env bash
# Installs the Quickdraw native messaging host for Chrome/Chromium/Brave on Linux.
# Run after: cargo build --release -p quickdraw-host

set -e

BINARY="./target/release/quickdraw-host"
INSTALL_PATH="/usr/local/bin/quickdraw-host"
MANIFEST_SRC="./com.quickdraw.host.json"

# Paths Chrome/Chromium/Brave check on Linux
CHROME_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
CHROMIUM_DIR="$HOME/.config/chromium/NativeMessagingHosts"
BRAVE_DIR="$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"

if [ ! -f "$BINARY" ]; then
  echo "Build first: cargo build --release -p quickdraw-host"
  exit 1
fi

# Install binary
echo "Installing $BINARY → $INSTALL_PATH"
sudo cp "$BINARY" "$INSTALL_PATH"
sudo chmod +x "$INSTALL_PATH"

# Patch manifest path
MANIFEST_TMP=$(mktemp)
sed "s|/usr/local/bin/quickdraw-host|$INSTALL_PATH|g" "$MANIFEST_SRC" > "$MANIFEST_TMP"

# Install manifest for each browser found
for DIR in "$CHROME_DIR" "$CHROMIUM_DIR" "$BRAVE_DIR"; do
  if [ -d "$(dirname "$DIR")" ]; then
    mkdir -p "$DIR"
    cp "$MANIFEST_TMP" "$DIR/com.quickdraw.host.json"
    echo "Installed manifest → $DIR/com.quickdraw.host.json"
  fi
done

rm "$MANIFEST_TMP"

echo ""
echo "Done. Update com.quickdraw.host.json with your extension ID:"
echo "  allowed_origins: [\"chrome-extension://YOUR_EXTENSION_ID/\"]"
echo ""
echo "Get the extension ID from chrome://extensions after loading unpacked."
