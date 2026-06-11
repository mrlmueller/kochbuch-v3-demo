import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV !== 'production'

// Backend origin the browser talks to directly (clientLogin / password-setup)
// and via fetch. Needed in connect-src.
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

// Content-Security-Policy.
// - script/style allow 'unsafe-inline' (Next injects inline hydration scripts;
//   the app uses inline styles throughout). No nonce is in use, so inline must
//   be permitted for the app to function.
// - dev additionally needs 'unsafe-eval' (React Fast Refresh) and ws:/http:
//   localhost (HMR + the local backend); prod omits those and upgrades http.
// - img-src is broad (https:) because the image-search picker renders thumbnails
//   from arbitrary upstream hosts.
// - Firebase Auth needs apis.google.com / gstatic (script), the project's
//   firebaseapp.com auth iframe (frame), and the Google identity endpoints
//   (connect). accounts.google.com is the sign-in popup.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://*.gstatic.com"
    : "script-src 'self' 'unsafe-inline' https://apis.google.com https://*.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  isDev
    ? `connect-src 'self' ${API} http://localhost:* ws://localhost:* https://*.googleapis.com https://*.firebaseapp.com wss://*.firebaseio.com`
    : `connect-src 'self' ${API} https://*.googleapis.com https://*.firebaseapp.com wss://*.firebaseio.com`,
  "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
  // Popups (Firebase Google sign-in) must keep working.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  // HSTS only matters over HTTPS; browsers ignore it on http/localhost in dev.
  ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]),
]

const nextConfig: NextConfig = {
  cacheComponents: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
  images: {
    loader: 'custom',
    loaderFile: './lib/image-loader.ts',
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
    ],
  },
}

export default nextConfig
