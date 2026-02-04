// app/api/insights/dashboard/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs"; // edge 말고 node 권장(안정성)
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 아주 단순 캐시(서버 인스턴스 내). Vercel은 인스턴스 바뀌면 초기화될 수 있음.
// 그래도 "느림" 체감은 크게 개선됨. (원하면 KV/Upstash로 강화 가능)
const memCache = new Map<string, { exp: number; value: any }>();

function cacheGet(key: string) {
  const hit = memCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    memCache.delete(key);
    return null;
  }
  return hit.value;
}
function cacheSet(key: string, value: any, ttlMs: number) {
  memCache.set(key, { exp: Date.now() + ttlMs, value });
}

// 80자 제한 강제(길면 줄임)
function clamp80(s: string) {
  if (!s) return s;
  return s.length <= 80 ? s : s.slice(0, 79) + "…";
}

// 숫자 -> 판단 신호로 변환 (실제 수치 포함)
function buildSignals(input: any) {
  const s1 = input.section1 ?? {};
  const s2 = input.section2 ?? {};
  const s3 = input.section3 ?? {};

  const section1 = {
    achievement_rate: Math.round(s1.achievement_rate || 0),
    yoy_ytd: Math.round(s1.yoy_ytd || 0),
    actual_sales: Math.round(s1.actual_sales_ytd || 0),
    target: Math.round(s1.target_ytd || 0),
    tone:
      s1.achievement_rate >= 100 ? "positive" :
      s1.achievement_rate >= 90 ? "neutral" : "negative",
    growth_quality:
      s1.yoy_ytd >= 30 ? "strong" :
      s1.yoy_ytd > 0 ? "mild" : "weak",
  };

  const section2 = {
    sellthrough_rate: Math.round(s2.sellthrough_rate || 0),
    sales_amt: Math.round(s2.sales_amt || 0),
    inbound_amt: Math.round(s2.inbound_amt || 0),
    sales_yoy: Math.round(s2.sales_yoy_pct || 100),
    tone:
      s2.sellthrough_rate >= 70 ? "positive" :
      s2.sellthrough_rate >= 60 ? "neutral" : "negative",
    risk:
      s2.sellthrough_rate < 60 ? "promo_pressure" :
      s2.sellthrough_rate < 65 ? "watch" : "stable",
  };

  const section3 = {
    sellthrough_rate: Math.round(s3.sellthrough_rate || 0),
    base_stock: Math.round(s3.base_stock_amt || 0),
    curr_stock: Math.round(s3.curr_stock_amt || 0),
    tone:
      s3.sellthrough_rate >= 25 ? "positive" :
      s3.sellthrough_rate >= 15 ? "neutral" : "negative",
    risk:
      s3.curr_stock_amt > 0
        ? (s3.sellthrough_rate < 20 ? "slow_burn" : "ok_burn")
        : "unknown",
  };

  return { section1, section2, section3 };
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        section1: "AI 비활성 상태임",
        section2: "AI 비활성 상태임",
        section3: "AI 비활성 상태임",
      });
    }

    const body = await req.json();
    const { region, brand, asof_date, skip_cache = false } = body;

    const cacheKey = `insight:${region}:${brand}:${asof_date}`;
    
    // 캐시 건너뛰기가 아닐 때만 캐시 확인
    if (!skip_cache) {
      const cached = cacheGet(cacheKey);
      if (cached) {
        console.log('✅ Cache hit for dashboard insights');
        return NextResponse.json(cached);
      }
    } else {
      console.log('⚠️ Skipping cache as requested');
    }

    const signals = buildSignals(body);
    console.log('🔍 Building insights from signals:', signals);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8초 컷

    const prompt = `
너는 리테일 데이터 분석가다.
아래 수치를 기반으로 현재 지표를 해석하라.

반드시 다음 3가지 관점을 모두 반영하여 분석:
① 최근 추세 (상승/하락/정체)
② 전월 대비 수준
③ 전년 동월 대비 수준

규칙:
- 반드시 구체적인 분석을 작성 (fallback 금지)
- 수치 기반으로 서술 (상회/유사/하회)
- 평가·지시·조언·관리 표현 금지
- 서술형 1문장, 80자 이내
- JSON 형식만 출력

입력 신호:
- Section1: ${JSON.stringify(signals.section1)}
- Section2: ${JSON.stringify(signals.section2)}
- Section3: ${JSON.stringify(signals.section3)}

출력 예시:
{
  "section1": "전년 대비 목표달성률 상승세이나 전월 대비 소폭 둔화",
  "section2": "판매율 전년 유사 수준이며 전월 대비 안정적 추세 유지 중",
  "section3": "소진율 전년 대비 개선 중이나 전월 대비 정체 구간"
}
`.trim();

    let result: any;

    try {
      const resp = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { 
            role: "system", 
            content: "너는 리테일 데이터 분석가다. 반드시 구체적인 분석을 제공하라. '추가 관찰 후 판단 필요함' 같은 회피 응답은 금지. 숫자 기반으로 최근추세, 전월비교, 전년비교를 모두 반영해 80자 이내로 서술하라." 
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.3, // 약간 높여서 더 다양한 응답 유도
        max_tokens: 300,
        response_format: { type: "json_object" },
      }, { signal: controller.signal as any });

      const text = resp.choices[0].message.content?.trim() ?? "{}";
      result = JSON.parse(text);
      console.log('✅ AI response:', result);
    } catch (e: any) {
      console.error('❌ OpenAI API error:', e.message);
      throw e;
    } finally {
      clearTimeout(timeout);
    }

    // 80자 제한 강제
    const final = {
      section1: clamp80(result.section1 ?? "추가 관찰 후 판단 필요함"),
      section2: clamp80(result.section2 ?? "추가 관찰 후 판단 필요함"),
      section3: clamp80(result.section3 ?? "추가 관찰 후 판단 필요함"),
    };

    cacheSet(cacheKey, final, 10 * 60 * 1000); // 10분 캐시
    console.log('✅ Dashboard insights generated:', final);
    return NextResponse.json(final);
  } catch (e: any) {
    console.error('❌ Dashboard insights failed:', e);
    // 타임아웃/실패 시 즉시 fallback
    return NextResponse.json({
      section1: "추가 관찰 후 판단 필요함",
      section2: "추가 관찰 후 판단 필요함",
      section3: "추가 관찰 후 판단 필요함",
    });
  }
}
