'use client'

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEditableList, uid } from '@/lib/use-editable-list'
import type { StepRow } from '@/lib/recipe-rows'
import { C, addBtnStyle, gripBtn, inputStyle, rowDeleteBtn, sectionLabel, UndoBar, GripIcon } from './editor-bits'

interface Props {
  initial: StepRow[]
  onChange: (rows: StepRow[]) => void
}

export function StepEditor({ initial, onChange }: Props) {
  const { items, pending, add, update, remove, undoRemove, reorder } = useEditableList(initial, onChange)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (over && active.id !== over.id) reorder(String(active.id), String(over.id))
  }

  return (
    <section style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p style={{ ...sectionLabel, margin: 0 }}>Zubereitung</p>
        <button type="button" onClick={() => add({ id: uid('step'), text: '' })} style={addBtnStyle}>
          + Schritt
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {withStepNumbers(items, pending).map(({ row, no }) => (
              <SortableStepRow
                key={row.id}
                row={row}
                no={no}
                pending={pending.has(row.id)}
                onUpdate={update}
                onRemove={remove}
                onUndo={undoRemove}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  )
}

// Continuous 1-based numbering that skips pending-delete rows. Kept out of the
// component body so the running counter isn't a reassigned render variable.
function withStepNumbers(rows: StepRow[], pending: Set<string>): Array<{ row: StepRow; no: number }> {
  let n = 0
  return rows.map((row) => {
    const isPending = pending.has(row.id)
    if (!isPending) n += 1
    return { row, no: isPending ? 0 : n }
  })
}

interface RowProps {
  row: StepRow
  no: number
  pending: boolean
  onUpdate: (id: string, patch: Partial<StepRow>) => void
  onRemove: (id: string) => void
  onUndo: (id: string) => void
}

function SortableStepRow({ row, no, pending, onUpdate, onRemove, onUndo }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled: pending,
  })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.95 : 1,
    boxShadow: isDragging ? '0 6px 18px rgba(80,50,20,0.16)' : undefined,
    borderRadius: isDragging ? 8 : undefined,
    background: isDragging ? C.surface : undefined,
  }

  if (pending) {
    return (
      <div ref={setNodeRef} style={style}>
        <UndoBar label="Schritt gelöscht" onUndo={() => onUndo(row.id)} />
      </div>
    )
  }

  return (
    <div ref={setNodeRef} style={{ ...style, display: 'grid', gridTemplateColumns: '24px 28px 1fr 32px', gap: 8, alignItems: 'flex-start' }}>
      <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} style={{ ...gripBtn, marginTop: 4 }} aria-label="Verschieben">
        <GripIcon />
      </button>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${C.accent}20`, color: C.accent, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
        {no}
      </div>
      <textarea value={row.text} onChange={(e) => onUpdate(row.id, { text: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
      <button type="button" onClick={() => onRemove(row.id)} style={{ ...rowDeleteBtn, marginTop: 4 }} aria-label="Schritt löschen">✕</button>
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 14,
  padding: 18,
  border: '1px solid rgba(120,90,60,0.16)',
  boxShadow: '0 1px 2px rgba(80,50,20,0.04), 0 4px 16px rgba(80,50,20,0.06)',
}
