export function CheckerSpinner({ size = 40 }: { size?: number }) {
  const strokeWidth = Math.max(2, size / 20);
  const radius = 20 - strokeWidth / 2 - 1;

  return (
    <div
      className="relative inline-block"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 40 40"
        className="absolute inset-0 animate-[spin_1.1s_linear_infinite]"
      >
        <defs>
          <linearGradient
            id="checker-spin-grad"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
            <stop offset="60%" stopColor="currentColor" stopOpacity="0.25" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="1" />
          </linearGradient>
        </defs>
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="url(#checker-spin-grad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="72 28"
        />
      </svg>
      <svg
        viewBox="0 0 40 40"
        className="absolute inset-0 animate-[spin_2.4s_linear_infinite_reverse]"
      >
        <circle
          cx="20"
          cy="20"
          r={Math.max(4, radius - 6)}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.15"
          strokeWidth={strokeWidth * 0.8}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="14 86"
        />
      </svg>
    </div>
  );
}
