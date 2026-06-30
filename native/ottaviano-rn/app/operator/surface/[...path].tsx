import { Redirect, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { useOperator } from "@/auth/OperatorSession";
import { findSurface } from "@/nav/operatorNav";
import { ROLE_RANK } from "@/nav/roles";
import { StateBlock } from "@/components/ui";
import { OperatorShell } from "@/features/operator/OperatorShell";
import { Dashboard } from "@/features/operator/Dashboard";
import { OrdersBoard } from "@/features/operator/OrdersBoard";
import { DataSurface } from "@/features/operator/DataSurface";
import { SurfaceScaffold } from "@/features/operator/SurfaceScaffold";
import { KdsScreen } from "@/features/kds/KdsScreen";
import { configForPath } from "@/features/operator/surfaceConfig";

/**
 * The universal operator surface renderer. The drawer links every one of the 54
 * surfaces to `/operator/surface/<href>` (e.g. `/operator/surface/core/kds`); this
 * catch-all resolves the href back to the nav registry entry and renders the right
 * screen: the full KDS, the live Orders board, the summary Dashboard, a generic
 * live data collection, or an honest parity scaffold (surfaceConfig.ts). Role
 * rank is re-checked here so a hand-typed deep-link can't reach a forbidden surface.
 */
export default function OperatorSurface() {
  const { status, role, rank } = useOperator();
  const { path } = useLocalSearchParams<{ path: string | string[] }>();
  const segments = Array.isArray(path) ? path : path ? [path] : [];
  const href = `/${segments.join("/")}`;

  if (status === "loading")
    return (
      <View style={{ flex: 1, backgroundColor: "#15110d" }}>
        <StateBlock kind="loading" message="Resuming session…" />
      </View>
    );
  if (status === "signed-out") return <Redirect href="/operator/login" />;

  const surface = findSurface(href);
  if (!surface) return <Redirect href="/operator/surface/admin" />;

  const config = configForPath(surface.path);
  // Role-rank gate (defence in depth — the drawer already hides forbidden items).
  const allowed = rank >= ROLE_RANK[surface.requiredRole];

  return (
    <OperatorShell active={surface}>
      {!allowed ? (
        <StateBlock kind="error" message={`Your role (${role}) can't access ${surface.label}.`} />
      ) : config.kind === "kds" ? (
        <KdsScreen />
      ) : config.kind === "orders" ? (
        <OrdersBoard />
      ) : config.kind === "dashboard" ? (
        <Dashboard />
      ) : config.kind === "data" ? (
        <DataSurface surface={surface} config={config} />
      ) : (
        <SurfaceScaffold surface={surface} />
      )}
    </OperatorShell>
  );
}
