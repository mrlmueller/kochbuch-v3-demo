'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { Recipe, Category } from '@/lib/api'
import { clientSaveRecipe } from '@/lib/api'
import { prepareImageForUpload } from '@/lib/image-prep'
import { ImageSearchPicker } from '@/components/image-search-picker'
import { ImageLightbox } from '@/components/image-lightbox'
import { IngredientEditor } from '@/components/ingredient-editor'
import { StepEditor } from '@/components/step-editor'
import {
  toIngredientRows,
  toStepRows,
  ingredientRowsToPayload,
  stepRowsToPayload,
  type IngredientRow,
  type StepRow,
} from '@/lib/recipe-rows'

export type RecipeFormMode = 'create' | 'edit' | 'review-ai'

interface Props {
  categories: Category[]
  initial?: Partial<Recipe>
  mode: RecipeFormMode
  isAdmin: boolean
  /** When present (review-ai), show a radio picker among these images for the cover. */
  imageOptions?: string[]
  /** Called after successful save with the final slug (server may have suffixed it). */
  onAfterSave?: (slug: string) => void
}

const T = { accent: '#C2410C', text: '#2A1F14', muted: '#7A6B5A', border: 'rgba(120,90,60,0.16)', surface: '#fff', danger: '#B91C1C', bg: '#FAF6EF' }

export function RecipeForm({ categories, initial, mode, isAdmin, imageOptions, onAfterSave }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [showJson, setShowJson] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [error, setError] = useState('')

  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [categorySlug, setCategorySlug] = useState(initial?.category_slug ?? categories[0]?.slug ?? '')
  const [time, setTime] = useState(String(initial?.time_minutes ?? 30))
  const [servings, setServings] = useState(initial?.servings ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '')
  const [ingredientRows, setIngredientRows] = useState<IngredientRow[]>(() => toIngredientRows(initial?.ingredients))
  const [stepRows, setStepRows] = useState<StepRow[]>(() => toStepRows(initial?.steps))
  // Bumped only on JSON import to remount the editors with fresh seed data;
  // ordinary edits flow up via onChange and must NOT remount (focus loss).
  const [editorResetKey, setEditorResetKey] = useState(0)

  const handleImageFile = async (raw: File | null) => {
    if (!raw || !raw.type.startsWith('image/')) return
    setUploading(true)
    setError('')
    try {
      // Normalize HEIC/large JPEGs to a <=2048px JPEG so the server's
      // upload cap is irrelevant and Cloudinary always gets a clean blob.
      const file = await prepareImageForUpload(raw)
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        setError(body.error ?? 'Bild-Upload fehlgeschlagen')
        return
      }
      const { url } = await res.json() as { url: string }
      setImageUrl(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bild-Upload fehlgeschlagen')
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    if (e.dataTransfer.files?.[0]) handleImageFile(e.dataTransfer.files[0])
  }

  const importJson = () => {
    setJsonError('')
    try {
      const obj = JSON.parse(jsonText)
      if (obj.title) setTitle(obj.title)
      if (obj.slug) setSlug(obj.slug)
      if (obj.category_slug) setCategorySlug(obj.category_slug)
      if (obj.time_minutes) setTime(String(obj.time_minutes))
      if (obj.servings) setServings(String(obj.servings))
      if (obj.notes) setNotes(obj.notes)
      if (obj.image_url) setImageUrl(obj.image_url)
      if (Array.isArray(obj.steps) && obj.steps.length) setStepRows(toStepRows(obj.steps))
      if (Array.isArray(obj.ingredients) && obj.ingredients.length) {
        setIngredientRows(toIngredientRows(obj.ingredients.map((i: { display?: string; amount?: number; unit?: string; name?: string }) => ({ display: i.display ?? '', name: i.name ?? '', amount: i.amount ?? 0, unit: i.unit ?? '' }))))
      }
      setEditorResetKey(k => k + 1)
      setShowJson(false); setJsonText('')
    } catch (err: unknown) {
      setJsonError('JSON ungültig: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      const recipe: Partial<Recipe> = {
        slug: slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        title, category_slug: categorySlug, time_minutes: parseInt(time) || 0,
        servings, notes, image_url: imageUrl,
        steps: stepRowsToPayload(stepRows),
        ingredients: ingredientRowsToPayload(ingredientRows),
      }
      const { slug: finalSlug } = await clientSaveRecipe(recipe, mode !== 'edit')
      if (onAfterSave) {
        onAfterSave(finalSlug)
      } else {
        router.push('/admin')
        router.refresh()
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  const headerTitle =
    mode === 'create' ? 'Neues Rezept' :
    mode === 'edit' ? 'Rezept bearbeiten' :
    'Rezept prüfen'

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 880, margin: '0 auto' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => router.back()} style={iconBtn}>←</button>
        <h1 style={{ flex: 1, fontSize: 28, fontFamily: "'DM Serif Display', Georgia, serif", color: T.text, letterSpacing: -0.4, margin: 0 }}>
          {headerTitle}
        </h1>
        {isAdmin && mode !== 'review-ai' && (
          <button type="button" onClick={() => setShowJson(s => !s)} style={{ ...outlineBtn, color: showJson ? T.accent : T.text, borderColor: showJson ? T.accent : T.border }}>JSON-Import</button>
        )}
        <button type="button" onClick={() => router.back()} style={outlineBtn}>Abbrechen</button>
        <button type="submit" disabled={saving || uploading} style={{ ...outlineBtn, background: T.accent, color: '#fff', border: 'none', opacity: saving || uploading ? 0.7 : 1 }}>
          {saving ? 'Speichern…' : 'Speichern'}
        </button>
      </div>

      {error && <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: T.danger, marginBottom: 16, fontSize: 13 }}>{error}</div>}

      {/* JSON Import panel (admin only) */}
      {showJson && isAdmin && mode !== 'review-ai' && (
        <div style={cardStyle}>
          <p style={labelStyle}>JSON einfügen — Felder werden überschrieben</p>
          <textarea value={jsonText} onChange={e => { setJsonText(e.target.value); setJsonError('') }} rows={4} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} />
          {jsonError && <p style={{ color: T.danger, fontSize: 12, margin: '6px 0 0' }}>{jsonError}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button type="button" onClick={importJson} disabled={!jsonText.trim()} style={{ ...outlineBtn, background: T.accent, color: '#fff', border: 'none' }}>In Formular laden</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Image */}
        <section style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ ...sectionLabel, margin: 0 }}>Bild</p>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 999, border: 'none',
                background: T.accent, color: '#fff',
                fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
              }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx={11} cy={11} r={7} />
                <path d="m21 21-4.3-4.3" />
              </svg>
              Bild suchen
            </button>
          </div>

          {/* AI-review mode: pick from uploaded options */}
          {mode === 'review-ai' && imageOptions && imageOptions.length > 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
              {imageOptions.map(url => (
                <div
                  key={url}
                  role="button"
                  tabIndex={0}
                  onClick={() => setImageUrl(url)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setImageUrl(url) } }}
                  style={{
                    position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden',
                    border: `2px solid ${imageUrl === url ? T.accent : T.border}`,
                    cursor: 'pointer', background: T.bg,
                  }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button
                    type="button"
                    aria-label="Bild vergrößern"
                    onClick={e => { e.stopPropagation(); setLightboxSrc(url) }}
                    style={{
                      position: 'absolute', top: 5, right: 5, width: 26, height: 26, borderRadius: '50%',
                      border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'zoom-in',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                    }}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx={11} cy={11} r={7} />
                      <path d="m21 21-4.3-4.3" />
                      <path d="M11 8.5v5M8.5 11h5" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
            onClick={() => !uploading && fileRef.current?.click()}
            style={{ minHeight: 200, borderRadius: 12, border: `2px dashed ${dragOver ? T.accent : T.border}`, background: dragOver ? '#FFF3EE' : T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: uploading ? 'wait' : 'pointer', overflow: 'hidden', position: 'relative' }}>
            {uploading
              ? <div style={{ textAlign: 'center', color: T.muted, padding: 24 }}>
                  <p style={{ fontWeight: 600, color: T.text, margin: '0 0 4px' }}>Wird hochgeladen…</p>
                </div>
              : imageUrl && /^https?:\/\//.test(imageUrl)
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={imageUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ textAlign: 'center', color: T.muted, padding: 24 }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>↑</div>
                    <p style={{ fontWeight: 600, color: T.text, margin: '0 0 4px' }}>Bild hierher ziehen oder klicken</p>
                    <p style={{ fontSize: 12, margin: 0 }}>JPG, PNG oder HEIC</p>
                  </div>
            }
            {imageUrl && <button type="button" onClick={e => { e.stopPropagation(); setImageUrl('') }} style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.9)', cursor: 'pointer', color: T.danger }}>✕</button>}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => handleImageFile(e.target.files?.[0] ?? null)} />
          </div>
        </section>

        {/* Basics */}
        <section style={cardStyle}>
          <p style={sectionLabel}>Basisdaten</p>
          <div style={{ marginBottom: 12 }}>
            <p style={labelStyle}>Titel *</p>
            <input value={title} onChange={e => setTitle(e.target.value)} required placeholder="Rezepttitel" style={inputStyle} />
          </div>
          {isAdmin && (
            <div style={{ marginBottom: 12 }}>
              <p style={labelStyle}>Slug (URL-ID)</p>
              <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="wird automatisch generiert" style={inputStyle} />
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <p style={labelStyle}>Kategorie</p>
              <select value={categorySlug} onChange={e => setCategorySlug(e.target.value)} style={inputStyle}>
                {categories.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <p style={labelStyle}>Zeit (min)</p>
              <input type="number" value={time} onChange={e => setTime(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <p style={labelStyle}>Portionen</p>
              <input value={servings} onChange={e => setServings(e.target.value)} placeholder="4 Personen" style={inputStyle} />
            </div>
          </div>
        </section>

        {/* Ingredients — drag-reorder, inline undo, section headings */}
        <IngredientEditor key={`ing-${editorResetKey}`} initial={ingredientRows} onChange={setIngredientRows} />

        {/* Steps — drag-reorder, inline undo */}
        <StepEditor key={`step-${editorResetKey}`} initial={stepRows} onChange={setStepRows} />

        {/* Notes */}
        <section style={cardStyle}>
          <p style={sectionLabel}>Tipp (optional)</p>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Hilfreicher Hinweis…" />
        </section>
      </div>

      <ImageSearchPicker
        open={searchOpen}
        initialQuery={title}
        onClose={() => setSearchOpen(false)}
        onPick={url => setImageUrl(url)}
      />

      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </form>
  )
}

const cardStyle: React.CSSProperties = { background: '#fff', borderRadius: 14, padding: 18, border: '1px solid rgba(120,90,60,0.16)', boxShadow: '0 1px 2px rgba(80,50,20,0.04), 0 4px 16px rgba(80,50,20,0.06)' }
const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#7A6B5A', margin: '0 0 12px' }
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#7A6B5A', margin: '0 0 5px', letterSpacing: 0.3 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(120,90,60,0.16)', background: '#FAF6EF', fontSize: 14, color: '#2A1F14', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }
const outlineBtn: React.CSSProperties = { padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(120,90,60,0.16)', background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#2A1F14' }
const iconBtn: React.CSSProperties = { width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(120,90,60,0.16)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#2A1F14', fontFamily: 'inherit' }
