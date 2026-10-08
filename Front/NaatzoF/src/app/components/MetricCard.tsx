import "./metrics.css";

type MetricIcon = "pending" | "completed" | "progress" | "projects";

/** Small, consistent line icons drawn for the dashboard's actual metrics. */
function MetricSymbol({ kind }: { kind: MetricIcon }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "pending" && (
        <>
          <path d="M5 9h14l2 7v4H3v-4l2-7Z" />
          <path d="M3 16h5l1.5 2h5L16 16h5M8 4h8M6 6.5h12" />
        </>
      )}
      {kind === "completed" && (
        <>
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <rect x="9" y="2" width="6" height="4" rx="1" fill="var(--card)" />
          <path d="m8.5 13 2.5 2.5 4.5-5M9 18h6" />
        </>
      )}
      {kind === "progress" && (
        <>
          <path d="M12 3a9 9 0 1 0 9 9" />
          <path d="M15.5 3.7a9 9 0 0 1 4.8 4.8" />
          <path d="m8.5 12 2.5 2.5 4.5-5" />
        </>
      )}
      {kind === "projects" && (
        <>
          <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
          <path d="M3 10h18M8 14h8M8 17h5" />
        </>
      )}
    </svg>
  );
}

export function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon: MetricIcon;
}) {
  return (
    <div className="metric-card">
      <div className="metric-symbol">
        <MetricSymbol kind={icon} />
      </div>
      <div className="metric-content">
        <p className="metric-label">{label}</p>
        <p className="metric-value">{value}</p>
      </div>
    </div>
  );
}
