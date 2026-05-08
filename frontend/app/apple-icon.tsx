import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#FAF6EF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#C2410C',
          fontSize: 130,
          fontFamily: 'serif',
          fontWeight: 400,
          letterSpacing: -4,
        }}
      >
        K
      </div>
    ),
    { ...size },
  )
}
