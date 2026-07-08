import { Component, type ErrorInfo, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";

/**
 * Root error boundary. A render error anywhere below here would otherwise take
 * the whole app down — on macOS a fatal JS exception just terminates the process
 * ("the app won't open"), with no redbox in a Release/TestFlight build. This
 * catches it and paints the message + component stack on screen instead, so a
 * crash is visible (and screenshot-able) rather than silent.
 *
 * Deliberately built from bare primitives only (View / Text / ScrollView) — no
 * theme, no safe-area, no navigation — so the fallback itself can never be the
 * thing that fails.
 */
interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info });
    // Also surface it to the JS console / device log for `xcrun log`/Console.app.
    console.error("Root ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={{ flex: 1, backgroundColor: "#1c1c1e", padding: 24, paddingTop: 64 }}>
        <Text style={{ color: "#ff453a", fontSize: 20, fontWeight: "800", marginBottom: 12 }}>
          App crashed on launch
        </Text>
        <ScrollView style={{ flex: 1 }}>
          <Text selectable style={{ color: "#fff", fontSize: 15, fontWeight: "700", marginBottom: 8 }}>
            {error.name}: {error.message}
          </Text>
          {error.stack ? (
            <Text selectable style={{ color: "#c7c7cc", fontSize: 12, fontFamily: "Menlo", marginBottom: 16 }}>
              {error.stack}
            </Text>
          ) : null}
          {info?.componentStack ? (
            <>
              <Text style={{ color: "#8e8e93", fontSize: 12, fontWeight: "700", marginBottom: 4 }}>
                Component stack
              </Text>
              <Text selectable style={{ color: "#c7c7cc", fontSize: 12, fontFamily: "Menlo" }}>
                {info.componentStack}
              </Text>
            </>
          ) : null}
        </ScrollView>
      </View>
    );
  }
}
