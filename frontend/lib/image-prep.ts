// Client-side image normalization before upload.
//
// iOS encodes photos as HEIC, and dense imagery (e.g. photos that contain
// printed text — menus, recipe cards) compresses poorly, so raw HEIC files
// regularly exceed the server's upload size cap. Re-encoding to JPEG at a
// modest max dimension produces a predictable upload — same visual quality
// for AI vision input, a tiny fraction of the original bytes.
//
// Returns a `File` so the caller can drop it straight into FormData with a
// clean .jpg name.

const MAX_DIMENSION = 2048
const JPEG_QUALITY = 0.85

export async function prepareImageForUpload(file: File): Promise<File> {
  // Only touch image files; let the existing upload path reject anything else.
  if (!file.type.startsWith('image/')) return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    // Older Safari (or HEIC without system decoder) — fall back to an <img>.
    bitmap = await decodeViaImg(file)
  }

  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d unavailable')
    ctx.drawImage(bitmap, 0, 0, w, h)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    if (!blob) throw new Error('canvas toBlob produced null')

    const baseName = file.name.replace(/\.[^./\\]+$/, '') || 'photo'
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
  } finally {
    // ImageBitmap is GPU-backed; release ASAP.
    if (typeof bitmap.close === 'function') bitmap.close()
  }
}

// Fallback for browsers that can't decode HEIC via createImageBitmap.
// Uses an <img> element + Image.decode(), which relies on the browser's
// own image pipeline (iOS Safari decodes HEIC there).
async function decodeViaImg(file: File): Promise<ImageBitmap> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    // Round-trip through a canvas → ImageBitmap so the rest of the pipeline
    // doesn't need to special-case HTMLImageElement.
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d unavailable')
    ctx.drawImage(img, 0, 0)
    return await createImageBitmap(canvas)
  } finally {
    URL.revokeObjectURL(url)
  }
}
