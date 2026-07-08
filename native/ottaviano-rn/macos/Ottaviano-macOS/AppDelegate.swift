//
//  AppDelegate.swift — OttavianoKDS macOS (react-native-macos, ADR-002)
//
//  Bare react-native-macos entry, XcodeGen-generated project (mirrors ios/). The
//  same JS bundle + moduleName "Ottaviano" the iOS apps boot — so the whole app
//  (POS, KDS, Service, …) runs on macOS, laid out by the responsive desktop
//  layouts. Classic RCTBridge + RCTRootView path (New Arch is off for the Mac
//  target initially, RCT_NEW_ARCH_ENABLED=0, until Fabric-macOS is validated).
//
//  DEBUG serves from Metro (`index`); Release embeds main.jsbundle via the
//  "Bundle React Native code and images" build phase (react-native-xcode.sh).
//
//  Every step here is traced with NSLog("[OttavianoKDS] …") so a Release/
//  TestFlight launch is diagnosable from Console.app / `log show` — a device
//  log dump showed the window was never created and the RN bridge never booted,
//  with no crash. The trace pins down exactly where launch stops.
//

import Cocoa
import React

@NSApplicationMain
class AppDelegate: NSObject, NSApplicationDelegate, RCTBridgeDelegate {
  var window: NSWindow?
  var bridge: RCTBridge?

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSLog("[OttavianoKDS] applicationDidFinishLaunching START")

    // A bare, nib-less macOS app must declare itself a regular foreground app
    // and activate, or AppKit may never show a programmatically-created window
    // (and then auto-terminates the app for having none).
    NSApp.setActivationPolicy(.regular)

    // Report the JS bundle situation up front: a Release build that can't find
    // main.jsbundle would boot a dead bridge.
    let bundleURL = Bundle.main.url(forResource: "main", withExtension: "jsbundle")
    NSLog("[OttavianoKDS] main.jsbundle = %@", bundleURL?.path ?? "NOT FOUND IN BUNDLE")

    // Route any JS fatal to the device log instead of dying silently.
    RCTSetFatalHandler { (error: Error?) in
      NSLog("[OttavianoKDS] RCT FATAL: %@", (error as NSError?)?.description ?? "unknown")
    }

    NSLog("[OttavianoKDS] creating RCTBridge…")
    guard let bridge = RCTBridge(delegate: self, launchOptions: nil) else {
      NSLog("[OttavianoKDS] RCTBridge is NIL — bundle failed to load; aborting UI")
      return
    }
    self.bridge = bridge
    NSLog("[OttavianoKDS] RCTBridge created OK")

    NSLog("[OttavianoKDS] creating RCTRootView…")
    let rootView = RCTRootView(bridge: bridge, moduleName: "Ottaviano", initialProperties: nil)
    NSLog("[OttavianoKDS] RCTRootView created")

    let rect = NSRect(x: 0, y: 0, width: 1360, height: 900)
    let win = NSWindow(
      contentRect: rect,
      styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
      backing: .buffered,
      defer: false
    )
    win.title = "OttavianoKDS"
    win.titlebarAppearsTransparent = false
    win.contentView = rootView
    win.center()
    win.makeKeyAndOrderFront(nil)
    self.window = win

    NSApp.activate(ignoringOtherApps: true)
    NSLog("[OttavianoKDS] window shown, isVisible=%@ frame=%@",
          win.isVisible ? "YES" : "NO", NSStringFromRect(win.frame))
    NSLog("[OttavianoKDS] applicationDidFinishLaunching DONE")
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    true
  }

  // Opt in to secure coding for state restoration (silences the AppKit warning
  // and is required on modern macOS).
  func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool {
    true
  }

  func sourceURL(for bridge: RCTBridge!) -> URL! {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
