import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME ?? ''
const KEY   = process.env.CLOUDINARY_API_KEY ?? ''
const SECRET = process.env.CLOUDINARY_API_SECRET ?? ''

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = (await cookies()).get('session')
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!CLOUD || !KEY || !SECRET) {
    return NextResponse.json({ error: 'upload not configured' }, { status: 503 })
  }

  const contentType = req.headers.get('content-type') ?? ''

  // JSON mode: { url } — Cloudinary fetches the remote image itself.
  // Used by the search-picker so external images get re-hosted under
  // our Cloudinary account (stable URLs, image optimization).
  if (contentType.includes('application/json')) {
    let body: { url?: string }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
    const remoteUrl = body.url ?? ''
    if (!/^https?:\/\//.test(remoteUrl)) {
      return NextResponse.json({ error: 'invalid url' }, { status: 400 })
    }
    return uploadToCloudinary(remoteUrl)
  }

  // Multipart mode: form file upload from the dropzone / file picker.
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'invalid form data' }, { status: 400 })
  }

  const file = form.get('file')
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'no file' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (max 10 MB)' }, { status: 413 })
  }

  return uploadToCloudinary(file)
}

async function uploadToCloudinary(source: Blob | string): Promise<NextResponse> {
  const timestamp = Math.round(Date.now() / 1000)
  // Params must be sorted alphabetically, without api_key/file/resource_type
  const paramsToSign = `folder=recipes&timestamp=${timestamp}`
  const signature = crypto
    .createHash('sha256')
    .update(paramsToSign + SECRET)
    .digest('hex')

  const upload = new FormData()
  upload.set('file', source)
  upload.set('folder', 'recipes')
  upload.set('timestamp', String(timestamp))
  upload.set('api_key', KEY)
  upload.set('signature', signature)

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, {
    method: 'POST',
    body: upload,
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: text }, { status: 502 })
  }

  const data = await res.json() as { secure_url: string }
  return NextResponse.json({ url: data.secure_url })
}
