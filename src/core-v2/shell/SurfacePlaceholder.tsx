import { CoreShellV2, type CoreV2Surface } from "./CoreShellV2";

/**
 * Temporary body for v2 surfaces that have not been ported yet. Renders the
 * real Core v2 chrome so navigation works and the sidebar is reviewable while
 * POS leads the rebuild; KDS / Guest / Service land in follow-up commits.
 */
export function SurfacePlaceholder({
  active,
  crumb,
  title,
  note,
}: {
  active: CoreV2Surface;
  crumb: string;
  title: string;
  note: string;
}) {
  return (
    <CoreShellV2 active={active} crumb={crumb}>
      <div
        style={{
          flex: 1,
          display: "grid",
          placeItems: "center",
          padding: 40,
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 440 }}>
          <div className="display" style={{ fontSize: 26 }}>{title}</div>
          <p className="subtle" style={{ marginTop: 10, lineHeight: 1.55, fontSize: 13.5 }}>{note}</p>
        </div>
      </div>
    </CoreShellV2>
  );
}
