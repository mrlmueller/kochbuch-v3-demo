'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Recipe, Category } from '@/lib/api'

interface Props {
  categories: Category[]
  initial?: Partial<Recipe>
  mode: 'create' | 'edit'
}

interface IngredientRow {
  display: string
  name: string
}

export function RecipeForm({ categories, initial, mode }: Props) {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)

  const [title, setTitle] = useState(initial?.title ?? '')
  const [categorySlug, setCategorySlug] = useState(initial?.category_slug ?? categories[0]?.slug ?? '')
  const [time, setTime] = useState(initial?.time_minutes?.toString() ?? '')
  const [servings, setServings] = useState(initial?.servings ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '')
  const [steps, setSteps] = useState<string[]>(initial?.steps ?? [''])
  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    initial?.ingredients?.map((i) => ({ display: i.display || `${i.amount} ${i.unit}`, name: i.name })) ??
    [{ display: '', name: '' }]
  )

  const addIngredient = () => setIngredients((p) => [...p, { display: '', name: '' }])
  const removeIngredient = (i: number) => setIngredients((p) => p.filter((_, j) => j !== i))
  const updateIngredient = (i: number, field: 'display' | 'name', val: string) =>
    setIngredients((p) => p.map((ing, j) => j === i ? { ...ing, [field]: val } : ing))

  const addStep = () => setSteps((p) => [...p, ''])
  const removeStep = (i: number) => setSteps((p) => p.filter((_, j) => j !== i))
  const updateStep = (i: number, val: string) => setSteps((p) => p.map((s, j) => j === i ? val : s))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setIsPending(true)
    const payload = {
      slug: initial?.slug,
      title, categorySlug, time: parseInt(time, 10) || 0,
      servings, notes, imageUrl, steps: steps.filter(Boolean), ingredients,
    }
    // Backend write not yet wired — auth required first
    console.log('Submit payload:', payload)
    alert('Backend write not yet wired — see console for payload.')
    setIsPending(false)
  }

  const fieldStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 12,
    border: '1px solid var(--border)', background: 'var(--card-bg)',
    color: 'var(--text)', fontFamily: 'inherit', fontSize: 15, outline: 'none',
  }
  const labelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: 0.8, marginBottom: 6, display: 'block' }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-5 pt-16 pb-10">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => router.back()} className="bg-transparent border-none cursor-pointer p-0" style={{ color: 'var(--accent)', fontSize: 15, fontFamily: 'inherit' }}>
          ← Zurück
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
          {mode === 'create' ? 'Neues Rezept' : 'Bearbeiten'}
        </h1>
        <div style={{ width: 60 }} />
      </div>

      {/* Title */}
      <div>
        <label style={labelStyle}>Titel</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required style={fieldStyle} placeholder="Rezepttitel" />
      </div>

      {/* Category + Time */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label style={labelStyle}>Kategorie</label>
          <select value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)} style={fieldStyle}>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Zeit (min)</label>
          <input type="number" value={time} onChange={(e) => setTime(e.target.value)} style={fieldStyle} placeholder="30" />
        </div>
      </div>

      {/* Servings */}
      <div>
        <label style={labelStyle}>Portionen</label>
        <input value={servings} onChange={(e) => setServings(e.target.value)} style={fieldStyle} placeholder="4 Personen" />
      </div>

      {/* Image URL */}
      <div>
        <label style={labelStyle}>Bild-URL (Cloudinary)</label>
        <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} style={fieldStyle} placeholder="https://res.cloudinary.com/..." />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {imageUrl && /^https?:\/\//.test(imageUrl) && <img src={imageUrl} alt="Vorschau" className="mt-2 rounded-xl w-full object-cover" style={{ maxHeight: 180 }} />}
      </div>

      {/* Ingredients */}
      <div>
        <label style={labelStyle}>Zutaten</label>
        <div className="flex flex-col gap-2">
          {ingredients.map((ing, i) => (
            <div key={i} className="flex gap-2">
              <input value={ing.display} onChange={(e) => updateIngredient(i, 'display', e.target.value)}
                style={{ ...fieldStyle, flex: '0 0 110px' }} placeholder="Menge (z.B. 500 g)" />
              <input value={ing.name} onChange={(e) => updateIngredient(i, 'name', e.target.value)}
                style={{ ...fieldStyle, flex: 1 }} placeholder="Zutat" />
              {ingredients.length > 1 && (
                <button type="button" onClick={() => removeIngredient(i)}
                  className="flex-shrink-0 w-9 h-10 rounded-xl flex items-center justify-center cursor-pointer border-none"
                  style={{ background: 'var(--bg)', color: 'var(--muted)', fontSize: 18 }}>×</button>
              )}
            </div>
          ))}
          <button type="button" onClick={addIngredient}
            className="text-sm font-medium cursor-pointer rounded-xl py-2 border-none"
            style={{ background: 'var(--bg)', color: 'var(--accent)', fontFamily: 'inherit', border: '1px dashed var(--border)' }}>
            + Zutat
          </button>
        </div>
      </div>

      {/* Steps */}
      <div>
        <label style={labelStyle}>Zubereitung</label>
        <div className="flex flex-col gap-2">
          {steps.map((step, i) => (
            <div key={i} className="flex gap-2 items-start">
              <span className="flex-shrink-0 w-7 h-10 flex items-center justify-center font-bold"
                style={{ color: 'var(--accent)', fontFamily: 'var(--font-serif)', fontSize: 18 }}>
                {i + 1}
              </span>
              <textarea value={step} onChange={(e) => updateStep(i, e.target.value)} rows={2}
                style={{ ...fieldStyle, resize: 'vertical', flex: 1 }} placeholder={`Schritt ${i + 1}`} />
              {steps.length > 1 && (
                <button type="button" onClick={() => removeStep(i)}
                  className="flex-shrink-0 w-9 h-10 rounded-xl flex items-center justify-center cursor-pointer border-none mt-0"
                  style={{ background: 'var(--bg)', color: 'var(--muted)', fontSize: 18 }}>×</button>
              )}
            </div>
          ))}
          <button type="button" onClick={addStep}
            className="text-sm font-medium cursor-pointer rounded-xl py-2 border-none"
            style={{ background: 'var(--bg)', color: 'var(--accent)', fontFamily: 'inherit', border: '1px dashed var(--border)' }}>
            + Schritt
          </button>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label style={labelStyle}>Tipp (optional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
          style={{ ...fieldStyle, resize: 'vertical' }} placeholder="Optionaler Tipp oder Hinweis..." />
      </div>

      <button type="submit" disabled={isPending}
        className="w-full py-4 rounded-2xl font-semibold text-base cursor-pointer border-none"
        style={{ background: 'var(--accent)', color: '#fff', fontFamily: 'inherit', opacity: isPending ? 0.7 : 1 }}>
        {isPending ? 'Speichern…' : mode === 'create' ? 'Rezept erstellen' : 'Änderungen speichern'}
      </button>
    </form>
  )
}
