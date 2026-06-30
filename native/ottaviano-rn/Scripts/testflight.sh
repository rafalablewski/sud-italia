#!/usr/bin/env bash
#
# Scripts/testflight.sh — archive + export + upload one scheme to TestFlight.
#
# Faithful port of the team's PRIOR Swift pipeline, adapted for React Native +
# CocoaPods: xcodebuild builds the WORKSPACE (Ottaviano.xcworkspace, produced by
# `pod install`), NOT the bare .xcodeproj. Auth is the App Store Connect API key
# exactly as before (AuthKey_${ASC_KEY_ID}.p8 + key id + issuer id).
#
# Mechanism (unchanged from the Swift version):
#   1. xcodebuild archive  -allowProvisioningUpdates with the ASC key
#   2. xcodebuild -exportArchive with an app-store-connect ExportOptions.plist
#   3. xcrun altool --upload-app -f <ipa> --apiKey/--apiIssuer
#
# Usage:
#   Scripts/testflight.sh <Scheme> [BuildNumber]
#     <Scheme>      Ottaviano | OttavianoKDS   (default: OttavianoKDS)
#     [BuildNumber] optional integer; overrides project.yml's CURRENT_PROJECT_VERSION
#                   (must be strictly > 51; the committed default is 60).
#
# Required environment (provided as CI secrets):
#   ASC_KEY_ID     App Store Connect API key id
#   ASC_ISSUER_ID  App Store Connect issuer id
#   The .p8 itself must already be written to:
#     $HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8
#
set -euo pipefail

SCHEME="${1:-OttavianoKDS}"
BUILD_NUMBER="${2:-}"

# Resolve paths relative to this script so it works from any CWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"          # native/ottaviano-rn
IOS_DIR="$APP_DIR/ios"
WORKSPACE="$IOS_DIR/Ottaviano.xcworkspace"

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
  echo "ERROR: $WORKSPACE not found. Run 'xcodegen generate' then 'pod install' in ios/ first." >&2
  exit 1
fi

BUILD_DIR="$IOS_DIR/build"
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
  <key>uploadSymbols</key>
  <true/>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
</dict>
</plist>
PLIST

# Optionally override the build number for this run.
BUILD_NUMBER_FLAG=()
if [ -n "$BUILD_NUMBER" ]; then
  echo "==> Overriding build number -> $BUILD_NUMBER"
  BUILD_NUMBER_FLAG=(CURRENT_PROJECT_VERSION="$BUILD_NUMBER")
fi

echo "==> Archiving scheme '$SCHEME' (workspace build)"
xcodebuild archive \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
  "${BUILD_NUMBER_FLAG[@]}" \
  COMPILER_INDEX_STORE_ENABLE=NO

echo "==> Exporting .ipa"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID"

IPA_PATH="$(/usr/bin/find "$EXPORT_DIR" -name '*.ipa' -maxdepth 1 | head -n 1)"
if [ -z "$IPA_PATH" ]; then
  echo "ERROR: no .ipa produced in $EXPORT_DIR" >&2
  exit 1
fi
echo "==> Built IPA: $IPA_PATH"

echo "==> Uploading to App Store Connect / TestFlight via altool"
xcrun altool --upload-app \
  -f "$IPA_PATH" \
  -t ios \
  --apiKey "$ASC_KEY_ID" \
  --apiIssuer "$ASC_ISSUER_ID"

echo "==> Done. '$SCHEME' uploaded to TestFlight."
