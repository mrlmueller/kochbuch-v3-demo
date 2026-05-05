'use client'

import { useEffect } from 'react'

export function PersistLastRecipe({ slug }: { slug: string }) {
  useEffect(() => {
    try { localStorage.setItem('last_recipe', slug) } catch {}
  }, [slug])
  return null
}
