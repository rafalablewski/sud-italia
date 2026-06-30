App icon — ACTION REQUIRED before a real App Store / TestFlight submission.

This appiconset uses the iOS single-size ("universal", 1024x1024) app-icon slot.
The Contents.json references `icon-1024.png`, which is NOT committed yet (we don't
have the marketing PNG). Add a 1024x1024 PNG named exactly `icon-1024.png` next to
this file. It must be opaque (no alpha) per Apple's marketing-icon requirement.

Until that PNG exists:
  - Simulator/CI no-signing builds still succeed (the icon is non-fatal there).
  - A TestFlight/App Store upload will be rejected by App Store Connect for a
    missing app icon. Drop the PNG in before shipping.

Both targets (Ottaviano and OttavianoKDS) share this single Images.xcassets via
project.yml, so a single icon file covers both apps.
