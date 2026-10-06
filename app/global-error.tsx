"use client";

// Renders outside the root layout, so it can't rely on globals.css: inline values mirror the design tokens.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="he" dir="rtl">
      <body
        style={{
          fontFamily: '"IBM Plex Sans Hebrew", system-ui, sans-serif',
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
          margin: 0,
          padding: 16,
          background: "#efeeea",
          backgroundImage: "radial-gradient(circle, rgb(68 60 48 / 0.16) 1px, transparent 1.2px)",
          backgroundSize: "20px 20px",
          color: "#18181b",
        }}
      >
        <section
          style={{
            width: "100%",
            maxWidth: 380,
            background: "#ffffff",
            border: "1px solid #dcdad6",
            borderRadius: 2,
            boxShadow: "0 1px 0 rgb(68 60 48 / 0.08), 3px 3px 0 -1px rgb(68 60 48 / 0.07)",
          }}
        >
          <div style={{ minHeight: 44, display: "flex", alignItems: "center", padding: "0 14px", borderBottom: "1px solid #dcdad6", background: "#fbfaf8" }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>משהו השתבש</span>
          </div>
          <div style={{ padding: 20, textAlign: "center" }}>
            <p style={{ margin: 0, color: "#6b6966", fontSize: 14 }}>נסה שוב בעוד רגע.</p>
            <button
              onClick={reset}
              style={{
                marginTop: 16,
                height: 36,
                padding: "0 14px",
                borderRadius: 2,
                border: "none",
                background: "#18181b",
                color: "#fafafa",
                fontSize: 14,
                fontWeight: 500,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              נסה שוב
            </button>
          </div>
        </section>
      </body>
    </html>
  );
}
