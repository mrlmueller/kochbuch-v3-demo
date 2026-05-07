import type { ImageLoaderProps } from 'next/image'

export default function imageLoader({ src, width }: ImageLoaderProps): string {
  if (src.startsWith('https://res.cloudinary.com/')) {
    return cloudinaryUrl(src, width)
  }
  // Firebase Storage and other sources: serve original URL.
  // (No Vercel optimizer in the path when loaderFile is set.)
  return src
}

function cloudinaryUrl(src: string, width: number): string {
  try {
    const url = new URL(src)
    const parts = url.pathname.split('/')
    const uploadIdx = parts.indexOf('upload')
    if (uploadIdx === -1) return src
    // Insert our transform right after 'upload'. If the stored URL already
    // has transform segments they become a chained step, which Cloudinary
    // applies sequentially — both are valid.
    parts.splice(uploadIdx + 1, 0, `w_${width},f_auto,q_auto,c_limit`)
    url.pathname = parts.join('/')
    return url.toString()
  } catch {
    return src
  }
}
