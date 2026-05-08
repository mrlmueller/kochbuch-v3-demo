import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mein Kochbuch',
    short_name: 'Kochbuch',
    description: 'Mein persönliches Kochbuch',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#FAF6EF',
    theme_color: '#FAF6EF',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icon1', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  }
}
