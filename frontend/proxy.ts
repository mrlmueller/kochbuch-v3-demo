import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/login']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const session = request.cookies.get('session')

  // Allow login page always
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    if (session) return NextResponse.redirect(new URL('/', request.url))
    return NextResponse.next()
  }

  // Require session for everything else
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
}
