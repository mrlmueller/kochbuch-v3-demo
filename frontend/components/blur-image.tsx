'use client'

import { useEffect, useRef, useState } from 'react'
import Image, { type ImageProps } from 'next/image'
import { decode } from 'blurhash'

interface BlurImageProps extends ImageProps {
  blurhash?: string | null
}

export function BlurImage({ blurhash: hash, onLoad, style, ...props }: BlurImageProps) {
  const [loaded, setLoaded] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

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
        style={{ ...style, opacity: loaded ? 1 : 0, transition: 'opacity 0.35s ease' }}
        onLoad={(e) => {
          setLoaded(true)
          onLoad?.(e)
        }}
      />
    </>
  )
}
