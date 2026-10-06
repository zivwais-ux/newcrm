import { ImageResponse } from "next/og";

/** The logo mark (four squares) on the brand-dark tile, for app icons. */
export function appIcon(size: number) {
  const tile = size;
  const cell = Math.round(tile * 0.19);
  const gap = Math.round(tile * 0.07);
  return new ImageResponse(
    (
      <div style={{ width: tile, height: tile, background: "#18181b", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexWrap: "wrap", width: cell * 2 + gap, gap }}>
          {[1, 0.55, 0.55, 1].map((o, i) => (
            <div key={i} style={{ width: cell, height: cell, background: "#ffffff", opacity: o, borderRadius: Math.max(2, Math.round(cell * 0.12)) }} />
          ))}
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
