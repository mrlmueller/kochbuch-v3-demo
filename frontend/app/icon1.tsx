import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <path d="M 38 28 Q 32 20 38 10" stroke="#C2410C" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M 58 28 Q 64 20 58 10" stroke="#C2410C" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M 48 32 Q 42 24 48 14" stroke="#C2410C" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M 12 50 Q 12 82 48 82 Q 84 82 84 50 Z" fill="#2A1F14"/>
  <ellipse cx="48" cy="50" rx="36" ry="6" fill="#C2410C"/>
</svg>`

export default function Icon() {
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', background: '#FAF6EF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUri} alt="" width={512} height={512} />
      </div>
    ),
    { ...size },
  )
}
