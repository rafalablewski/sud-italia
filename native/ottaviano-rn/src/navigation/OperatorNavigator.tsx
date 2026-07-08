import type { OperatorStackParamList } from "./types";
import { createAppStackNavigator } from "./createAppStack";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { useOperator } from "@/auth/OperatorSession";
import { OperatorLoginScreen } from "@/screens/operator/OperatorLoginScreen";
import { OperatorSurfaceScreen } from "@/screens/operator/OperatorSurfaceScreen";

const Stack = createAppStackNavigator<OperatorStackParamList>();

/** Operator console stack (OttavianoKDS) — always-dark KDS skin. The gate is the
 *  session status: signed-out shows Login, signed-in lands on the Dashboard
 *  surface (`/admin`). The drawer (OperatorShell) re-points the single
 *  OperatorSurface screen by `path`. */
export function OperatorNavigator() {
  const { status } = useOperator();
  return (
    <ThemeProvider skin="kds">
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#15110d" } }}>
        {status === "signed-in" ? (
          <Stack.Screen name="OperatorSurface" component={OperatorSurfaceScreen} initialParams={{ path: "/admin" }} />
        ) : (
          <Stack.Screen name="OperatorLogin" component={OperatorLoginScreen} />
        )}
      </Stack.Navigator>
    </ThemeProvider>
  );
}
