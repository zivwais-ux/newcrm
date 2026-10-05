"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="he" dir="rtl">
      <body style={{ fontFamily: "Heebo, system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#fafaf9" }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 16, fontWeight: 600 }}>משהו השתבש</h1>
          <p style={{ color: "#71717a", fontSize: 14 }}>נסה שוב בעוד רגע.</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "8px 14px", borderRadius: 6, border: "1px solid #e4e4e7", background: "#fff", cursor: "pointer" }}>
            נסה שוב
          </button>
        </div>
      </body>
    </html>
  );
}
