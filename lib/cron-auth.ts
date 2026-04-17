import { NextRequest } from 'next/server';

export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const envSecret = process.env.CRON_SECRET;
  if (!envSecret) return false;

  const authorization = request.headers.get('authorization');
  const secretFromHeader = request.headers.get('x-cron-secret');
  const secretFromParam = request.nextUrl.searchParams.get('secret');

  return (
    authorization === `Bearer ${envSecret}` ||
    secretFromHeader === envSecret ||
    secretFromParam === envSecret
  );
}
