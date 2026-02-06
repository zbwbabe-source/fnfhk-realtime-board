// app/api/insights/summary/edit/route.ts
import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';

// Upstash Redis 클라이언트
let redis: Redis | null = null;

function getRedisClient() {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    
    if (!url || !token) {
      throw new Error("Upstash Redis credentials not configured");
    }
    
    redis = new Redis({
      url,
      token,
    });
  }
  return redis;
}

// GET: 편집된 요약 불러오기
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const region = searchParams.get('region');
    const brand = searchParams.get('brand');
    const date = searchParams.get('date');
    
    if (!region || !brand || !date) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }
    
    const key = `summary:edited:${region}:${brand}:${date}`;
    const client = getRedisClient();
    
    const data = await client.get(key);
    
    if (!data) {
      return NextResponse.json({ edited: false, data: null });
    }
    
    console.log('✅ Edited summary retrieved from Redis:', key);
    return NextResponse.json({ edited: true, data });
  } catch (error: any) {
    console.error('❌ Failed to retrieve edited summary:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// POST: 편집된 요약 저장
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { region, brand, date, main_summary, key_insights } = body;
    
    if (!region || !brand || !date || !main_summary || !key_insights) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    const key = `summary:edited:${region}:${brand}:${date}`;
    const client = getRedisClient();
    
    const data = {
      main_summary,
      key_insights,
      edited_at: new Date().toISOString(),
    };
    
    // 30일 TTL (2592000초)
    await client.set(key, data, { ex: 2592000 });
    
    console.log('✅ Edited summary saved to Redis:', key);
    return NextResponse.json({ success: true, key });
  } catch (error: any) {
    console.error('❌ Failed to save edited summary:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// DELETE: 편집 내용 삭제 (원본으로 복원)
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const region = searchParams.get('region');
    const brand = searchParams.get('brand');
    const date = searchParams.get('date');
    
    if (!region || !brand || !date) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }
    
    const key = `summary:edited:${region}:${brand}:${date}`;
    const client = getRedisClient();
    
    await client.del(key);
    
    console.log('✅ Edited summary deleted from Redis:', key);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ Failed to delete edited summary:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
