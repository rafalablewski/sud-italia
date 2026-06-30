//
//  AppDelegate.swift
//  Ottaviano / OttavianoKDS  (shared between both targets)
//
//  Bare React Native 0.79.5 entry point.
//
//  RN 0.79 uses the RCTReactNativeFactory + RCTAppDependencyProvider shape
//  (replacing the old RCTAppDelegate subclass). The JS app is registered under
//  moduleName "Ottaviano" via `AppRegistry.registerComponent('Ottaviano', () => App)`
//  in index.js, so BOTH the customer (Ottaviano) and operator (OttavianoKDS)
//  targets boot the SAME moduleName and the SAME JS bundle — they differ only in
//  bundle id, display name and Info.plist orientations.
//
//  In DEBUG the bundle is served by Metro (`index`); in Release/archive the
//  bundle is embedded as main.jsbundle by the "Bundle React Native code and
//  images" build phase (react-native-xcode.sh).
//

import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    // Both targets register the JS side as "Ottaviano".
    factory.startReactNative(
      withModuleName: "Ottaviano",
      in: window,
      launchOptions: launchOptions
    )

    return true
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
