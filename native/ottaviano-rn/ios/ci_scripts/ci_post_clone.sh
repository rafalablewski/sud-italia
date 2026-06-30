#!/bin/sh
#
# ci_post_clone.sh — Xcode Cloud post-clone hook.
#
# Xcode Cloud runs ci_scripts/* from the directory containing the Xcode project,
# i.e. native/ottaviano-rn/ios. It clones the repo, runs this hook, THEN builds
# the workspace it finds. Because this is bare React Native + CocoaPods, we must
# regenerate the project and install pods here so the workspace exists:
#
#   npm install  ->  xcodegen generate  ->  bundle install  ->  pod install
#
# Robust + logged: fail fast, echo every step.
set -e

echo "===================================================================="
echo " ci_post_clone.sh  (Xcode Cloud)"
echo " PWD: $(pwd)"
echo "===================================================================="

# Locate the app root (native/ottaviano-rn) regardless of where Xcode Cloud
# invokes us from. CI_WORKSPACE points at the cloned repo root when set.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"        # .../native/ottaviano-rn/ios/ci_scripts
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"            # .../native/ottaviano-rn/ios
APP_DIR="$(cd "$IOS_DIR/.." && pwd)"               # .../native/ottaviano-rn
echo "App dir:  $APP_DIR"
echo "iOS dir:  $IOS_DIR"

# --- Node ------------------------------------------------------------------
# Xcode Cloud images don't ship Node. Install via Homebrew (present on the image).
if ! command -v node >/dev/null 2>&1; then
  echo "==> node not found; installing via Homebrew"
  export HOMEBREW_NO_AUTO_UPDATE=1
  export HOMEBREW_NO_INSTALL_CLEANUP=1
  brew install node || brew install node@20
fi
echo "==> node $(node -v) / npm $(npm -v)"

# --- JS deps ---------------------------------------------------------------
cd "$APP_DIR"
echo "==> Installing JS dependencies"
if [ -f package-lock.json ]; then
  npm ci || npm install
else
  npm install
fi

# --- XcodeGen --------------------------------------------------------------
if ! command -v xcodegen >/dev/null 2>&1; then
  echo "==> Installing XcodeGen via Homebrew"
  brew install xcodegen
fi
echo "==> Generating Xcode project from project.yml"
cd "$IOS_DIR"
xcodegen generate

# --- CocoaPods -------------------------------------------------------------
cd "$APP_DIR"
echo "==> bundle install (CocoaPods toolchain)"
if ! command -v bundle >/dev/null 2>&1; then
  gem install bundler
fi
bundle install

echo "==> pod install (generates Ottaviano.xcworkspace)"
cd "$IOS_DIR"
bundle exec pod install

echo "===================================================================="
echo " ci_post_clone.sh complete — workspace ready for Xcode Cloud build."
echo "===================================================================="
