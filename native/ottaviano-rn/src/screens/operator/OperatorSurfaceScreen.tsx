import { useRoute, type RouteProp } from "@react-navigation/native";
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
import { BESPOKE_SURFACES } from "@/features/operator/bespoke";
import type { OperatorStackParamList } from "@/navigation/types";

/**
 * The universal operator surface renderer. The drawer (OperatorShell) re-points
 * this one screen by `path` (the web href, e.g. `/core/kds`); this resolves the
 * href back to the nav registry entry and renders the right screen: the full KDS,
 * the live Orders board, the summary Dashboard, a generic live data collection,
 * or an honest parity scaffold (surfaceConfig.ts). Role rank is re-checked here so
 * a forbidden surface can't render even if reached directly. Only mounts when the
 * operator is signed in (the navigator gates sign-out → Login).
 */
export function OperatorSurfaceScreen() {
  const { role, rank } = useOperator();
  const { path } = useRoute<RouteProp<OperatorStackParamList, "OperatorSurface">>().params;

  // Resolve the surface; an unknown href falls back to the Dashboard.
  const surface = findSurface(path) ?? findSurface("/admin")!;
  const config = configForPath(surface.path);
  const allowed = rank >= ROLE_RANK[surface.requiredRole];
  // Faithful hand-built screens take precedence over the generic DataSurface.
  const Bespoke = BESPOKE_SURFACES[surface.path];

  return (
    <OperatorShell active={surface}>
      {!allowed ? (
        <StateBlock kind="error" message={`Your role (${role}) can't access ${surface.label}.`} />
      ) : Bespoke ? (
        <Bespoke />
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
