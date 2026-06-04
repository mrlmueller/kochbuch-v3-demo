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
import type { IngredientRow } from '@/lib/recipe-rows'
import { C, addBtnStyle, gripBtn, inputStyle, rowDeleteBtn, sectionLabel, UndoBar, GripIcon } from './editor-bits'

interface Props {
  initial: IngredientRow[]
  onChange: (rows: IngredientRow[]) => void
}

export function IngredientEditor({ initial, onChange }: Props) {
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <p style={{ ...sectionLabel, margin: 0 }}>Zutaten</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => add({ id: uid('ing'), kind: 'item', display: '', name: '' })} style={addBtnStyle}>
            + Zutat
          </button>
          <button type="button" onClick={() => add({ id: uid('div'), kind: 'divider', title: '' })} style={addBtnStyle}>
            + Abschnitt
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((row) => (
              <SortableIngredientRow
                key={row.id}
                row={row}
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

interface RowProps {
  row: IngredientRow
  pending: boolean
  onUpdate: (id: string, patch: Partial<IngredientRow>) => void
  onRemove: (id: string) => void
  onUndo: (id: string) => void
}

function SortableIngredientRow({ row, pending, onUpdate, onRemove, onUndo }: RowProps) {
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
        <UndoBar label={row.kind === 'divider' ? 'Abschnitt gelöscht' : 'Zutat gelöscht'} onUndo={() => onUndo(row.id)} />
      </div>
    )
  }

  const grip = (
    <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} style={gripBtn} aria-label="Verschieben">
      <GripIcon />
    </button>
  )

  if (row.kind === 'divider') {
    return (
      <div ref={setNodeRef} style={{ ...style, display: 'grid', gridTemplateColumns: '24px 1fr 32px', gap: 8, alignItems: 'center' }}>
        {grip}
        <input
          value={row.title}
          onChange={(e) => onUpdate(row.id, { title: e.target.value })}
          placeholder="Abschnitt (z. B. Teig)"
          style={{
            ...inputStyle,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: C.accent,
            fontSize: 12.5,
            background: '#FFF3EE',
            borderColor: 'rgba(194,65,12,0.28)',
          }}
        />
        <button type="button" onClick={() => onRemove(row.id)} style={rowDeleteBtn} aria-label="Abschnitt löschen">✕</button>
      </div>
    )
  }

  return (
    <div ref={setNodeRef} style={{ ...style, display: 'grid', gridTemplateColumns: '24px 1fr 2fr 32px', gap: 8, alignItems: 'center' }}>
      {grip}
      <input value={row.display} onChange={(e) => onUpdate(row.id, { display: e.target.value })} placeholder="500 g" style={inputStyle} />
      <input value={row.name} onChange={(e) => onUpdate(row.id, { name: e.target.value })} placeholder="Mehl" style={inputStyle} />
      <button type="button" onClick={() => onRemove(row.id)} style={rowDeleteBtn} aria-label="Zutat löschen">✕</button>
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
