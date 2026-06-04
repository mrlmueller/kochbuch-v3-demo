'use client'

// Shared visual building blocks for the ingredient/step editors. Palette mirrors
// the recipe-form constants so the editors blend into the surrounding form.
export const C = {
  accent: '#C2410C',
  text: '#2A1F14',
  muted: '#7A6B5A',
  border: 'rgba(120,90,60,0.16)',
  surface: '#fff',
  danger: '#B91C1C',
  bg: '#FAF6EF',
}

export const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 1.2,
  textTransform: 'uppercase',
  color: C.muted,
  margin: '0 0 12px',
}

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  background: C.bg,
  fontSize: 14,
  color: C.text,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  outline: 'none',
}

export const addBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '6px 11px',
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  background: '#fff',
  color: C.accent,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

// The grip disables touch-scrolling only on itself, so the rest of the row stays
// tappable and the page scrolls everywhere else.
export const gripBtn: React.CSSProperties = {
  width: 24,
  height: 36,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'transparent',
  color: C.muted,
  cursor: 'grab',
  padding: 0,
  touchAction: 'none',
  WebkitUserSelect: 'none',
  userSelect: 'none',
}

export const rowDeleteBtn: React.CSSProperties = {
  width: 32,
  height: 36,
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  background: '#fff',
  cursor: 'pointer',
  color: C.danger,
  fontFamily: 'inherit',
  fontSize: 14,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

export function GripIcon() {
  return (
    <svg width={12} height={18} viewBox="0 0 12 18" fill="currentColor" aria-hidden="true">
      <circle cx={3} cy={3} r={1.4} />
      <circle cx={9} cy={3} r={1.4} />
      <circle cx={3} cy={9} r={1.4} />
      <circle cx={9} cy={9} r={1.4} />
      <circle cx={3} cy={15} r={1.4} />
      <circle cx={9} cy={15} r={1.4} />
    </svg>
  )
}

/** Slim in-place affordance shown for ~5 s after a delete (see UNDO_MS). */
export function UndoBar({ label, onUndo }: { label: string; onUndo: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        minHeight: 36,
        padding: '0 12px',
        borderRadius: 8,
        border: `1px dashed ${C.border}`,
        background: C.bg,
        color: C.muted,
        fontSize: 13,
      }}
    >
      <span>{label}</span>
      <button
        type="button"
        onClick={onUndo}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          border: 'none',
          background: 'transparent',
          color: C.accent,
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'inherit',
          padding: '6px 2px',
        }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h11a5 5 0 0 1 0 10h-1" />
        </svg>
        Rückgängig
      </button>
    </div>
  )
}
