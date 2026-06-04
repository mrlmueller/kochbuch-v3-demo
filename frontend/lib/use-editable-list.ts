'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { arrayMove } from '@dnd-kit/sortable'

let _seq = 0
/** Stable-ish unique id for rows added at runtime (never used for SSR-seeded rows). */
export function uid(prefix = 'row'): string {
  _seq += 1
  return `${prefix}-${Date.now().toString(36)}-${_seq}`
}

/** How long the inline "Rückgängig" affordance stays before the row is gone for good. */
export const UNDO_MS = 5000

export interface Row {
  id: string
}

/**
 * Owns an editable, reorderable list with stable ids and an inline undo window
 * on delete. The hook is uncontrolled: it seeds from `initial` once and reports
 * the *committed* rows (everything not in the undo window) back via `onCommit`.
 * Parents that need to push new data in (e.g. JSON import) should remount via a
 * changing React `key` rather than feeding `initial` back in.
 */
export function useEditableList<T extends Row>(initial: T[], onCommit: (rows: T[]) => void) {
  const [items, setItems] = useState<T[]>(initial)
  const [pending, setPending] = useState<Set<string>>(() => new Set())
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Report committed rows (pending-delete rows excluded) up to the parent.
  // `onCommit` is expected to be a stable state setter, so depending on it here
  // does not retrigger the effect on every render.
  useEffect(() => {
    onCommit(items.filter((it) => !pending.has(it.id)))
  }, [items, pending, onCommit])

  // Clear any in-flight delete timers on unmount.
  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((t) => clearTimeout(t))
      map.clear()
    }
  }, [])

  const add = useCallback((row: T) => setItems((prev) => [...prev, row]), [])

  const update = useCallback(
    (id: string, patch: Partial<T>) =>
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it))),
    [],
  )

  /** Soft delete: mark pending, render the undo bar, hard-remove after UNDO_MS. */
  const remove = useCallback((id: string) => {
    setPending((prev) => new Set(prev).add(id))
    const t = setTimeout(() => {
      setItems((prev) => prev.filter((it) => it.id !== id))
      setPending((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      timers.current.delete(id)
    }, UNDO_MS)
    timers.current.set(id, t)
  }, [])

  const undoRemove = useCallback((id: string) => {
    const t = timers.current.get(id)
    if (t) {
      clearTimeout(t)
      timers.current.delete(id)
    }
    setPending((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const reorder = useCallback((activeId: string, overId: string) => {
    setItems((prev) => {
      const from = prev.findIndex((it) => it.id === activeId)
      const to = prev.findIndex((it) => it.id === overId)
      if (from === -1 || to === -1 || from === to) return prev
      return arrayMove(prev, from, to)
    })
  }, [])

  return { items, pending, add, update, remove, undoRemove, reorder }
}
