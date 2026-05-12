import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_ALLOWED_ORIGIN = '*';

function resolveAllowedOrigin(origin: string | null): string {
  const configured = process.env.DASHBOARD_API_ALLOWED_ORIGINS;
  if (!configured) return DEFAULT_ALLOWED_ORIGIN;

  const allowedOrigins = configured
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (allowedOrigins.includes('*')) return DEFAULT_ALLOWED_ORIGIN;
  if (origin && allowedOrigins.includes(origin)) return origin;

  return allowedOrigins[0] || DEFAULT_ALLOWED_ORIGIN;
}

function applyCorsHeaders(response: NextResponse, request: NextRequest): NextResponse {
  const origin = request.headers.get('origin');
  const allowedOrigin = resolveAllowedOrigin(origin);

  response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
  response.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Cron-Secret'
  );
  response.headers.set('Access-Control-Max-Age', '86400');

  if (allowedOrigin !== DEFAULT_ALLOWED_ORIGIN) {
    response.headers.set('Vary', 'Origin');
  }

  return response;
}

export function middleware(request: NextRequest) {
  if (request.method === 'OPTIONS') {
    return applyCorsHeaders(new NextResponse(null, { status: 204 }), request);
  }

  return applyCorsHeaders(NextResponse.next(), request);
}

export const config = {
  matcher: '/api/:path*',
};
