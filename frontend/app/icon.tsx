import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
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
          fontSize: 360,
          fontFamily: 'serif',
          fontWeight: 400,
          letterSpacing: -10,
        }}
      >
        K
      </div>
    ),
    { ...size },
  )
}
