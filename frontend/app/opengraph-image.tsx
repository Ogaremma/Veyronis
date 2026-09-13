import { ImageResponse } from "next/og";

export const alt = "Veyronis verified escrow settlement";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background:
          "linear-gradient(135deg, #020610 0%, #06132d 52%, #031022 100%)",
        color: "#f5f9ff",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div
          style={{
            width: 84,
            height: 84,
            borderRadius: 18,
            background: "linear-gradient(135deg, #1768e5, #6bd7ff)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 46,
            fontWeight: 900,
          }}
        >
          V
        </div>
        <div style={{ fontSize: 30, letterSpacing: 8, color: "#8eb1d8" }}>
          VEYRONIS
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontSize: 78, fontWeight: 800, lineHeight: 1.05 }}>
          Verified escrow settlement
        </div>
        <div style={{ fontSize: 32, color: "#bbd1ed", maxWidth: 850 }}>
          Buyer-funded agreements, Attestcoin/Creditcoin verification,
          authorized registry settlement, and explicit seller withdrawal.
        </div>
      </div>
      <div style={{ display: "flex", gap: 18 }}>
        {[
          "AUTHORIZED VERIFIER",
          "ON-CHAIN SETTLEMENT",
          "MANUAL WITHDRAWAL",
        ].map((label) => (
          <div
            key={label}
            style={{
              padding: "14px 22px",
              borderRadius: 999,
              border: "1px solid rgba(126,180,255,.35)",
              background: "rgba(34,106,238,.2)",
              color: "#b8d9ff",
              fontSize: 20,
              fontWeight: 700,
            }}
          >
            {label}
          </div>
        ))}
      </div>
    </div>,
    size,
  );
}
