//
//  main.swift — OttavianoKDS macOS entry point (ADR-002)
//
//  Explicit AppKit bootstrap. We do NOT use @NSApplicationMain on AppDelegate:
//  on macOS that attribute expects a MainMenu.xib to instantiate the app and
//  connect the delegate outlet. This app has no nib (NSMainNibFile is empty), so
//  @NSApplicationMain left NSApp.delegate unset — applicationDidFinishLaunching
//  never fired, so no window or React Native root view was ever created and the
//  app "installed but wouldn't open".
//
//  Here we create the shared application, set the delegate explicitly (a
//  top-level `let` retains it for the process lifetime), make it a regular
//  foreground app, and run the event loop. `run()` never returns.
//

import Cocoa

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
