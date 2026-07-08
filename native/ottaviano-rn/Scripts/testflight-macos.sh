#!/usr/bin/env bash
#
# Scripts/testflight-macos.sh — archive + export + upload the macOS app to
# TestFlight (ADR-002 phase 3). The macOS twin of Scripts/testflight.sh.
#
# Same App Store Connect API-key auth (AuthKey_${ASC_KEY_ID}.p8 + key id +
# issuer id) and the same archive -> exportArchive -> altool mechanism, adapted
# for macOS:
#   - archives the OttavianoMac WORKSPACE (from `pod install`), scheme
#     Ottaviano-macOS, destination generic/platform=macOS,
#   - exportArchive (method app-store-connect) produces a signed **.pkg**
#     (macOS App Store installer), not an .ipa,
#   - uploads with `xcrun altool --upload-app -t macos`.
#
# The app is App-Sandboxed (macos/Ottaviano-macOS/Ottaviano-macOS.entitlements) —
# App Store Connect rejects an un-sandboxed macOS build.
#
# Usage:
#   Scripts/testflight-macos.sh [BuildNumber] [MarketingVersion]
#     [BuildNumber]      optional integer; overrides project.yml CURRENT_PROJECT_VERSION.
#     [MarketingVersion] optional semver (e.g. 0.5.13); overrides project.yml
#                        MARKETING_VERSION. Empty = use the committed value.
#
# Required environment (CI secrets):
#   ASC_KEY_ID, ASC_ISSUER_ID  — App Store Connect API key id + issuer id.
#   The .p8 must already be at $HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8
#
set -euo pipefail

BUILD_NUMBER="${1:-}"
MARKETING_VERSION="${2:-}"

# Resolve paths relative to this script so it works from any CWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"          # native/ottaviano-rn
MACOS_DIR="$APP_DIR/macos"
WORKSPACE="$MACOS_DIR/OttavianoMac.xcworkspace"
SCHEME="Ottaviano-macOS"

TEAM_ID="T4WC9M8Y3S"

: "${ASC_KEY_ID:?ASC_KEY_ID must be set}"
: "${ASC_ISSUER_ID:?ASC_ISSUER_ID must be set}"

KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8"
if [ ! -f "$KEY_PATH" ]; then
  echo "ERROR: App Store Connect key not found at $KEY_PATH" >&2
  echo "Write the ASC_KEY_P8 secret there before running this script." >&2
  exit 1
fi

if [ ! -d "$WORKSPACE" ]; then
  echo "ERROR: $WORKSPACE not found. Run 'xcodegen generate' then 'pod install' in macos/ first." >&2
  exit 1
fi

# Separate scratch dir — do NOT use macos/build (RN codegen writes generated
# sources there during pod install; wiping it breaks the archive).
BUILD_DIR="$MACOS_DIR/tf-archive"
ARCHIVE_PATH="$BUILD_DIR/${SCHEME}.xcarchive"
EXPORT_DIR="$BUILD_DIR/${SCHEME}-export"
EXPORT_OPTIONS="$BUILD_DIR/ExportOptions.plist"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo "==> Writing ExportOptions.plist (app-store-connect, team $TEAM_ID, automatic)"
cat > "$EXPORT_OPTIONS" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>teamID</key>
  <string>${TEAM_ID}</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>destination</key>
  <string>export</string>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
</dict>
</plist>
PLIST

# Optionally override version + build number for this run (win over project.yml).
VERSION_FLAGS=()
if [ -n "$BUILD_NUMBER" ]; then
  echo "==> Overriding build number -> $BUILD_NUMBER"
  VERSION_FLAGS+=(CURRENT_PROJECT_VERSION="$BUILD_NUMBER")
fi
if [ -n "$MARKETING_VERSION" ]; then
  echo "==> Overriding marketing version -> $MARKETING_VERSION"
  VERSION_FLAGS+=(MARKETING_VERSION="$MARKETING_VERSION")
fi

echo "==> Archiving scheme '$SCHEME' (macOS workspace build)"
xcodebuild archive \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=macOS' \
  -archivePath "$ARCHIVE_PATH" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
  ${VERSION_FLAGS[@]+"${VERSION_FLAGS[@]}"} \
  COMPILER_INDEX_STORE_ENABLE=NO

echo "==> Exporting .pkg (macOS App Store installer)"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID"

PKG_PATH="$(/usr/bin/find "$EXPORT_DIR" -name '*.pkg' -maxdepth 1 | head -n 1)"
if [ -z "$PKG_PATH" ]; then
  echo "ERROR: no .pkg produced in $EXPORT_DIR" >&2
  ls -la "$EXPORT_DIR" || true
  exit 1
fi
echo "==> Built PKG: $PKG_PATH"

echo "==> Uploading to App Store Connect / TestFlight via altool (macOS)"
# altool exits 0 even on some fatal errors (e.g. "Cannot determine the Apple ID
# from Bundle ID …" when no App Store Connect app record exists yet), so capture
# the output and fail on any ERROR line rather than trusting the exit code.
UPLOAD_LOG="$BUILD_DIR/altool-upload.log"
set +e
xcrun altool --upload-app \
  -f "$PKG_PATH" \
  -t macos \
  --apiKey "$ASC_KEY_ID" \
  --apiIssuer "$ASC_ISSUER_ID" 2>&1 | tee "$UPLOAD_LOG"
RC=${PIPESTATUS[0]}
set -e

if [ "$RC" -ne 0 ] || grep -qi "ERROR:" "$UPLOAD_LOG"; then
  echo "ERROR: altool upload FAILED (exit $RC)." >&2
  if grep -q "Cannot determine the Apple ID from Bundle ID" "$UPLOAD_LOG"; then
    echo "HINT: No App Store Connect app record exists for bundle id '$( \
      /usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$ARCHIVE_PATH/Products/Applications/OttavianoKDS.app/Contents/Info.plist" 2>/dev/null || echo pl.ottaviano.kds )' (macOS)." >&2
    echo "      Create the macOS app in App Store Connect (My Apps -> + -> New App -> macOS), then re-run." >&2
  fi
  exit 1
fi

echo "==> Done. OttavianoKDS (macOS) uploaded to TestFlight."
