module.exports = {
  presets: ["module:@react-native/babel-preset"],
  plugins: [
    // Resolve the `@/…` path alias (→ ./src) for Metro at bundle time. tsconfig's
    // `paths` only covers TypeScript; the Release archive's JS bundle is built by
    // Metro, which needs this to resolve `@/auth/…`, `@/features/…`, etc.
    [
      "module-resolver",
      {
        root: ["./"],
        alias: { "@": "./src" },
        extensions: [".ios.js", ".android.js", ".js", ".ts", ".tsx", ".json"],
      },
    ],
  ],
};
