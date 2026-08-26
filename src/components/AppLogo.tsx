export function AppLogo() {
  return (
    <>
      <span className="brand-icon" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 12h4l2.2-6 4 12 2.3-6H21" />
        </svg>
      </span>
      <span>
        Pulse<span className="brand-dot">.</span>
      </span>
    </>
  );
}
