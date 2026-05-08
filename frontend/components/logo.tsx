type Props = {
  size?: number
  /** Show the rounded cream tile background (favicon-style). Off by default — assumes parent has a cream surface. */
  tile?: boolean
  className?: string
}

export function Logo({ size = 28, tile = false, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      className={className}
      aria-hidden="true"
      role="img"
    >
      {tile && <rect width="96" height="96" rx="18" fill="#FAF6EF" />}
      <path d="M 38 28 Q 32 20 38 10" stroke="#C2410C" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M 58 28 Q 64 20 58 10" stroke="#C2410C" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M 48 32 Q 42 24 48 14" stroke="#C2410C" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M 12 50 Q 12 82 48 82 Q 84 82 84 50 Z" fill="#2A1F14" />
      <ellipse cx="48" cy="50" rx="36" ry="6" fill="#C2410C" />
    </svg>
  )
}
