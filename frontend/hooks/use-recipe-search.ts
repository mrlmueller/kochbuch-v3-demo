'use client'

import Fuse from 'fuse.js'
import { useEffect, useRef, useState } from 'react'
import { clientGetRecipes, type RecipeListItem } from '@/lib/api'

// Module-level cache: one fetch + one Fuse index for the lifetime of the page.
let recipeCache: RecipeListItem[] | null = null
let loadPromise: Promise<RecipeListItem[]> | null = null
let fuseInstance: Fuse<RecipeListItem> | null = null

function getOrLoadFuse(): Promise<Fuse<RecipeListItem>> {
  if (fuseInstance) return Promise.resolve(fuseInstance)
  if (!loadPromise) {
    loadPromise = clientGetRecipes().then(data => {
      recipeCache = data.items
      fuseInstance = new Fuse(recipeCache, {
        keys: [
          { name: 'title', weight: 2 },
          { name: 'ingredient_names', weight: 1 },
        ],
        threshold: 0.4,
        minMatchCharLength: 2,
        ignoreLocation: true,
      })
      return recipeCache
    })
  }
  return loadPromise.then(() => fuseInstance!)
}

export function useRecipeSearch(query: string) {
  const [results, setResults] = useState<RecipeListItem[]>([])
  const [loading, setLoading] = useState(false)
  const cancelRef = useRef(false)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      setLoading(false)
      return
    }

    cancelRef.current = false
    setLoading(true)

    getOrLoadFuse().then(fuse => {
      if (cancelRef.current) return
      setResults(fuse.search(q).map(r => r.item))
      setLoading(false)
    })

    return () => {
      cancelRef.current = true
    }
  }, [query])

  return { results, loading }
}
