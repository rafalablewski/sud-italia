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

import Cocoa
import React

@NSApplicationMain
class AppDelegate: NSObject, NSApplicationDelegate, RCTBridgeDelegate {
  var window: NSWindow?
  var bridge: RCTBridge?

  func applicationDidFinishLaunching(_ notification: Notification) {
    let bridge = RCTBridge(delegate: self, launchOptions: nil)
    self.bridge = bridge
    let rootView = RCTRootView(bridge: bridge!, moduleName: "Ottaviano", initialProperties: nil)

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
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
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
