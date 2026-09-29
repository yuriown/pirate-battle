const ROWS: [string, string][] = [
  ['W / ↑', 'Sail forward'],
  ['A D / ← →', 'Turn left / right'],
  ['Space / J', 'Front cannon'],
  ['Q / K', 'Port broadside'],
  ['E / L', 'Starboard broadside'],
  ['Esc / P', 'Pause / resume'],
];

export function ControlsLegend() {
  return (
    <section aria-labelledby="controls-title" className="text-xs">
      <h2 id="controls-title" className="pb-caption mb-2 short:mb-1">
        Controls
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 sm:grid-cols-[auto_1fr_auto_1fr] short:grid-cols-[auto_1fr] short:gap-x-2 short:gap-y-0.5 short:whitespace-nowrap">
        {ROWS.map(([keys, action]) => (
          <div key={action} className="contents">
            <dt>
              <kbd className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-amber-300">{keys}</kbd>
            </dt>
            <dd className="text-amber-50/90">{action}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-amber-50/70 short:hidden">
        Touch: hold the on-screen buttons — steer on the left, fire on the right. Hold fire to keep shooting.
      </p>
    </section>
  );
}
