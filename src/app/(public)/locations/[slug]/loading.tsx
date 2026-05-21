import "@/components/landing/v8/v8.css";

export default function Loading() {
  return (
    <div className="v8-frame">
      <div style={{ minHeight: "30vh" }} />
      <div className="v8-loc-hero">
        <div className="v8-loc-hero-inner">
          <div
            style={{
              margin: "0 auto 16px",
              width: 180,
              height: 120,
              background: "rgba(184,92,56,0.08)",
              borderRadius: 12,
            }}
          />
          <div
            style={{
              margin: "0 auto",
              width: 220,
              height: 60,
              background: "rgba(122,43,43,0.08)",
              borderRadius: 8,
            }}
          />
        </div>
      </div>
    </div>
  );
}
