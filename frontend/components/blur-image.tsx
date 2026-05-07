'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image, { type ImageProps } from 'next/image'
import { decode } from 'blurhash'

interface BlurImageProps extends ImageProps {
  blurhash?: string | null
}

export function BlurImage({ blurhash: hash, onLoad, style, ...props }: BlurImageProps) {
  const [loaded, setLoaded] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Callback ref on the <img>: if the image is already in the browser cache
  // it fires its load event before React attaches onLoad, so we'd never see it.
  // Checking .complete at mount time catches that case.
  const imgRef = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) setLoaded(true)
  }, [])

  useEffect(() => {
    if (!hash || !canvasRef.current) return
    try {
      const pixels = decode(hash, 32, 32)
      const ctx = canvasRef.current.getContext('2d')
      if (!ctx) return
      const imageData = ctx.createImageData(32, 32)
      imageData.data.set(pixels)
      ctx.putImageData(imageData, 0, 0)
    } catch {
      // invalid hash — silently skip
    }
  }, [hash])

  return (
    <>
      {hash && !loaded && (
        <canvas
          ref={canvasRef}
          width={32}
          height={32}
          aria-hidden
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
      )}
      <Image
        {...props}
        ref={imgRef}
        style={{ ...style, opacity: loaded ? 1 : 0, transition: 'opacity 0.35s ease' }}
        onLoad={(e) => {
          setLoaded(true)
          onLoad?.(e)
        }}
        onError={() => setLoaded(true)}
      />
    </>
  )
}
