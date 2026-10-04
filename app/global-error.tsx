"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#fafaf9" }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 16, fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ color: "#71717a", fontSize: 14 }}>Please try again in a moment.</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "8px 14px", borderRadius: 6, border: "1px solid #e4e4e7", background: "#fff", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
