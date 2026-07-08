//
//  AppDelegate.swift — OttavianoKDS macOS (react-native-macos, ADR-002)
//
//  Mirrors the iOS AppDelegate: RN 0.79 boots through RCTReactNativeFactory +
//  RCTDefaultReactNativeFactoryDelegate + RCTAppDependencyProvider — NOT a
//  hand-rolled RCTBridge/RCTRootView. On 0.79 the old classic-bridge path no
//  longer starts the runtime (no root view is ever created → the app launches
//  with no window and the OS reaps it), which is exactly why the first Mac build
//  installed but never opened. The factory sets up the correct runtime (bridge
//  or bridgeless) and attaches the root view to the window we hand it.
//
//  Same JS bundle + moduleName "Ottaviano" the iOS apps boot, so the whole app
//  (POS, KDS, Service, …) runs on macOS, laid out by the responsive desktop
//  layouts. DEBUG serves from Metro (`index`); Release embeds main.jsbundle via
//  the "Bundle React Native code and images" build phase.
//

import Cocoa
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@NSApplicationMain
class AppDelegate: NSObject, NSApplicationDelegate {
  var window: NSWindow?
  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func applicationDidFinishLaunching(_ notification: Notification) {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    let rect = NSRect(x: 0, y: 0, width: 1360, height: 900)
    let win = NSWindow(
      contentRect: rect,
      styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
      backing: .buffered,
      defer: false
    )
    win.title = "OttavianoKDS"
    win.center()
    self.window = win

    // The factory builds the RN root view for moduleName "Ottaviano" and installs
    // it as the window's content (same call the iOS target makes, AppKit variant).
    factory.startReactNative(
      withModuleName: "Ottaviano",
      in: win,
      launchOptions: nil
    )

    // Make sure we come to the foreground as a regular app and the window shows.
    NSApp.setActivationPolicy(.regular)
    win.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    true
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
