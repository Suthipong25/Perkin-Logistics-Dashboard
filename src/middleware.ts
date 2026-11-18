import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  const maxLen = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < maxLen; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

export function middleware(req: NextRequest) {
  const expectedUser = process.env.APP_AUTH_USER || 'perkin';
  const expectedPass = process.env.APP_AUTH_PASSWORD;

  // Fail closed: block all access until APP_AUTH_PASSWORD is configured in Vercel
  if (!expectedPass) {
    return new NextResponse(
      'Internal system locked. Configure APP_AUTH_PASSWORD in environment variables to enable access.',
      {
        status: 503,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      }
    );
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Basic ')) {
    try {
      const decoded = atob(authHeader.slice(6).trim());
      const sep = decoded.indexOf(':');
      if (sep !== -1) {
        const user = decoded.slice(0, sep);
        const pass = decoded.slice(sep + 1);
        if (timingSafeEqual(user, expectedUser) && timingSafeEqual(pass, expectedPass)) {
          const res = NextResponse.next();
          res.headers.set('X-Robots-Tag', 'noindex, nofollow');
          return res;
        }
      }
    } catch {
      // Invalid base64 header -> fall through to 401
    }
  }

  return new NextResponse('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Perkin Logistics Internal"',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export const config = {
  matcher: ['/:path*'],
};