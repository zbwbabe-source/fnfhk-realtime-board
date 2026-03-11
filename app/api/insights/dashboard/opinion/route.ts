import { NextResponse } from 'next/server';
import { getRedisClient, buildKey } from '@/lib/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function buildOpinionKey(brand: string, date: string): string {
  return buildKey(['insights', 'exec', 'opinion', brand, date]);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const brand = String(searchParams.get('brand') || '').trim().toUpperCase();
    const date = String(searchParams.get('date') || '').trim();

    if (!brand || !date) {
      return NextResponse.json({ error: 'brand and date are required' }, { status: 400 });
    }

    const redis = getRedisClient();
    const key = buildOpinionKey(brand, date);
    const data = await redis.get<{
      hkmcOpinion: string;
      twOpinion: string;
      savedAt: string;
    }>(key);

    return NextResponse.json({
      hkmcOpinion: data?.hkmcOpinion || '',
      twOpinion: data?.twOpinion || '',
      savedAt: data?.savedAt || null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch business opinion' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const brand = String(body?.brand || '').trim().toUpperCase();
    const date = String(body?.date || '').trim();
    const hasHkmcOpinion = Object.prototype.hasOwnProperty.call(body || {}, 'hkmcOpinion');
    const hasTwOpinion = Object.prototype.hasOwnProperty.call(body || {}, 'twOpinion');
    const hkmcOpinion = hasHkmcOpinion ? String(body?.hkmcOpinion || '') : null;
    const twOpinion = hasTwOpinion ? String(body?.twOpinion || '') : null;

    if (!brand || !date) {
      return NextResponse.json({ error: 'brand and date are required' }, { status: 400 });
    }
    if (!hasHkmcOpinion && !hasTwOpinion) {
      return NextResponse.json({ error: 'hkmcOpinion or twOpinion is required' }, { status: 400 });
    }

    const redis = getRedisClient();
    const key = buildOpinionKey(brand, date);
    const existing = await redis.get<{
      hkmcOpinion: string;
      twOpinion: string;
      savedAt: string;
    }>(key);

    const payload = {
      hkmcOpinion: hasHkmcOpinion ? hkmcOpinion || '' : existing?.hkmcOpinion || '',
      twOpinion: hasTwOpinion ? twOpinion || '' : existing?.twOpinion || '',
      savedAt: new Date().toISOString(),
    };

    // Keep one-year history per date key.
    await redis.set(key, payload, { ex: 60 * 60 * 24 * 365 });

    return NextResponse.json({
      success: true,
      hkmcOpinion: payload.hkmcOpinion,
      twOpinion: payload.twOpinion,
      savedAt: payload.savedAt,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to save business opinion' }, { status: 500 });
  }
}
