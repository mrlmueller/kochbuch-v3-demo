'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-8 text-center">
      <p style={{ fontSize: 48, marginBottom: 12 }}>🍳</p>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', marginBottom: 8 }}>
        Etwas ist schiefgelaufen
      </h2>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.5 }}>
        Die Daten konnten nicht geladen werden. Bitte versuche es erneut.
      </p>
      <button
        type="button"
        onClick={reset}
        className="px-6 py-3 rounded-2xl font-semibold cursor-pointer border-none"
        style={{ background: 'var(--accent)', color: '#fff', fontFamily: 'inherit', fontSize: 15 }}
      >
        Erneut versuchen
      </button>
    </div>
  )
}
