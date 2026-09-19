export function Logo({ className = 'h-9' }: { className?: string }) {
  // The L1 mark: two forward-leaning strokes. Inline SVG so it stays crisp and
  // needs no asset pipeline.
  return (
    <svg viewBox="0 0 120 64" className={className} role="img" aria-label="LevelOne">
      <defs>
        <linearGradient id="l1g" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#C084FC" />
        </linearGradient>
      </defs>
      <path d="M34 4 L52 4 L34 46 L68 46 L62 60 L8 60 Z" fill="url(#l1g)" />
      <path d="M74 4 L98 4 L78 60 L60 60 Z" fill="#F4F4F8" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-3">
      <Logo className="h-8" />
      <div className="leading-none">
        <div className="text-lg font-extrabold tracking-[0.18em]">LEVEL ONE</div>
        <div className="mt-1 text-[9px] font-semibold tracking-[0.3em] text-gray-cool">
          WORK · PLAY · CONNECT · BELONG
        </div>
      </div>
    </div>
  );
}
