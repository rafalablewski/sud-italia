#!/usr/bin/env bash
# Archive → export → upload one app to TestFlight, signing automatically via the
# App Store Connect API key (cloud-managed distribution cert + provisioning,
# created on demand by -allowProvisioningUpdates). Run from CI (ios-testflight.yml);
# expects ASC_KEY_ID + ASC_ISSUER_ID in the env and the .p8 at the standard path.
#
#   ./Scripts/testflight.sh <Scheme> <BuildNumber>
set -euo pipefail

SCHEME="$1"
# 2nd arg is advisory (logging only) — the GitHub Actions run number.
CI_RUN="${2:-?}"
# Build number (CFBundleVersion) AUTO-INCREMENTS every upload: epoch seconds is
# strictly monotonic, always exceeds the old manual integers (52/60/61/62), and is
# unique even across re-runs on the same commit — so App Store Connect always sees
# a strictly-greater build and testers always get the newest one. It's overridden
# onto the archive below (project.yml's CURRENT_PROJECT_VERSION is only a local
# fallback). The user-facing MARKETING_VERSION stays human-set in project.yml.
BUILD_NUMBER="$(date +%s)"
TEAM_ID="T4WC9M8Y3S"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

KEY="$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8"
ARCHIVE="build/${SCHEME}.xcarchive"
EXPORT_DIR="build/${SCHEME}-export"
AUTH=(-allowProvisioningUpdates
  -authenticationKeyPath "$KEY"
  -authenticationKeyID "$ASC_KEY_ID"
  -authenticationKeyIssuerID "$ASC_ISSUER_ID")

echo "── Archiving $SCHEME (marketing from project.yml; build $BUILD_NUMBER; CI run $CI_RUN) ──"
xcodebuild archive \
  -project Ottaviano.xcodeproj \
  -scheme "$SCHEME" \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  "${AUTH[@]}" \
  -quiet

echo "── Exporting IPA ──"
cat > build/ExportOptions.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>${TEAM_ID}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>destination</key><string>export</string>
</dict></plist>
PLIST

xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist build/ExportOptions.plist \
  "${AUTH[@]}"

IPA="$(ls "$EXPORT_DIR"/*.ipa | head -1)"
echo "── Uploading $IPA to TestFlight ──"
xcrun altool --upload-app -f "$IPA" -t ios \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
echo "✓ Uploaded $SCHEME — appears in App Store Connect → TestFlight after processing."
