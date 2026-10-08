interface NaatzoLogoProps {
  size?: "compact" | "small" | "medium" | "large";
  showText?: boolean;
}

export function NaatzoLogo({
  size = "medium",
  showText = true,
}: NaatzoLogoProps) {
  const dimensions = {
    compact: "h-8",
    small: "h-10",
    medium: "h-12",
    large: "h-16",
  };
  const textSizes = {
    compact: "text-xl",
    small: "text-xl",
    medium: "text-2xl",
    large: "text-3xl",
  };
  return (
    <div className="flex items-center gap-3">
      <svg
        role="img"
        aria-label="Naatzo: una trompa redondeada que forma la letra N"
        viewBox="0 0 100 100"
        className={`${dimensions[size]} aspect-square`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="2" y="2" width="96" height="96" rx="30" fill="var(--primary)" />
        <path d="M26 75V37C26 28 30 26 36 34L61 68C66 75 70 73 70 64V35C70 17 88 15 88 28C88 35 81 39 78 33" fill="none" stroke="var(--primary-foreground)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M67 44Q70 46 73 44M67 50Q70 52 73 50" fill="none" stroke="var(--primary)" strokeWidth="1.4" strokeLinecap="round" opacity="0.35" />
      </svg>
      {showText && (
        <span
          className={`${textSizes[size]} font-bold text-foreground tracking-tight`}
        >
          Naatzo
        </span>
      )}
    </div>
  );
}
