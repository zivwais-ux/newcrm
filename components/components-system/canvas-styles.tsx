/**
 * Small keyframes used only by the canvas (hint arrow, marching drop border).
 * Kept local so globals.css stays untouched; React 19 hoists and dedupes it.
 */
export function CanvasStyles() {
  return (
    <style href="bos-canvas-styles" precedence="default">{`
@keyframes bos-nudge-start {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(var(--bos-nudge, -8px)); }
}
[dir="rtl"] .bos-nudge { --bos-nudge: 8px; }
.bos-nudge { animation: bos-nudge-start 1.6s ease-in-out infinite; }

@keyframes bos-march {
  to { background-position: 16px 0, -16px 100%, 0 -16px, 100% 16px; }
}
.bos-drop-border {
  background-image:
    linear-gradient(90deg, var(--brand) 50%, transparent 50%),
    linear-gradient(90deg, var(--brand) 50%, transparent 50%),
    linear-gradient(0deg, var(--brand) 50%, transparent 50%),
    linear-gradient(0deg, var(--brand) 50%, transparent 50%);
  background-repeat: repeat-x, repeat-x, repeat-y, repeat-y;
  background-size: 16px 2px, 16px 2px, 2px 16px, 2px 16px;
  background-position: 0 0, 0 100%, 0 0, 100% 0;
  animation: bos-march 0.8s linear infinite;
}

@keyframes bos-updated {
  0% { box-shadow: 0 0 0 0 rgb(21 128 61 / 0.35); }
  100% { box-shadow: 0 0 0 12px rgb(21 128 61 / 0); }
}

@media (prefers-reduced-motion: reduce) {
  .bos-nudge, .bos-drop-border { animation: none; }
}
`}</style>
  );
}
