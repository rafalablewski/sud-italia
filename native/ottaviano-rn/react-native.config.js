// react-native.config.js — register the out-of-tree **macOS** platform for the
// RN CLI so Metro accepts `--platform macos` when bundling the Mac app (ADR-002).
//
// react-native-macos declares the `macos` platform in its OWN
// react-native.config.js, but the CLI only loads a package's config when that
// package is a recognized dependency. We install react-native-macos in-job with
// `--no-save` (kept out of package.json so the iOS `npm install` is never
// affected), so the CLI never sees it and `--platform macos` fails with
// "Invalid platform 'macos' selected".
//
// Fix: re-export the fork's macos platform registration from HERE (the app
// config is always loaded). This runs ONLY on the Mac pipeline — on iOS builds
// react-native-macos isn't installed, the require throws, and this file is a
// no-op, leaving the iOS/Android autolinking untouched.
let platforms;
try {
  const macosConfig = require('react-native-macos/react-native.config.js');
  if (macosConfig && macosConfig.platforms && macosConfig.platforms.macos) {
    platforms = { macos: macosConfig.platforms.macos };
  }
} catch (e) {
  // react-native-macos not installed (iOS/Android build) — nothing to register.
}

module.exports = platforms ? { platforms } : {};
