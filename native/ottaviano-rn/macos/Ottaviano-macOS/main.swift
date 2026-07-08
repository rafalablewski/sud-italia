//
//  main.swift — explicit programmatic entry for OttavianoKDS macOS.
//
//  We do NOT use @NSApplicationMain. A device-log trace of the TestFlight build
//  proved that with this hand-authored, nib-less XcodeGen project the annotated
//  AppDelegate was never wired as NSApp.delegate: applicationDidFinishLaunching
//  never fired, the RN bridge never booted, no window was created, and macOS
//  auto-terminated the app after a few seconds (no crash). The launch log had
//  zero React lines and still emitted the "applicationSupportsSecureRestorable
//  State:" warning that our delegate override should have silenced — i.e. the
//  delegate simply wasn't connected.
//
//  Wiring the application + delegate by hand here removes that ambiguity: the
//  delegate is guaranteed to be set before the app runs, so its
//  applicationDidFinishLaunching (which builds the RCTRootView window) fires.
//
//  Top-level statements are only permitted in a file literally named main.swift.
//

import Cocoa

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.setActivationPolicy(.regular)
application.run()
