// app/api/insights/summary/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 간단한 인메모리 캐시
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

// 금액 포맷팅 (K/M 단위)
function formatCurrency(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toFixed(0);
}

// 상세 데이터 구조화
function buildDetailedData(input: any) {
  const s1 = input.section1 ?? {};
  const s2 = input.section2 ?? {};
  const s3 = input.section3 ?? {};

  // 월말 환산 계산 (단순 일할 계산)
  const elapsedDays = s1.elapsed_days || 1;
  const totalDays = s1.total_days || 30;
  const actualSales = s1.actual_sales_ytd || 0;
  const target = s1.target_ytd || 1;
  
  // 월말 환산 실적 = (현재 실적 / 경과 일수) × 월 총 일수
  const projectedSales = (actualSales / elapsedDays) * totalDays;
  // 월말 환산 달성률 = (월말 환산 실적 / 목표) × 100
  const projectedAchievementRate = Math.round((projectedSales / target) * 100);

  return {
    section1: {
      actual_sales: formatCurrency(actualSales),
      actual_sales_raw: Math.round(actualSales),
      achievement_rate: Math.round(s1.achievement_rate || 0),
      yoy: Math.round(s1.yoy_ytd || 0),
      target: formatCurrency(target),
      // 월말 환산 정보 추가
      elapsed_days: elapsedDays,
      total_days: totalDays,
      projected_achievement_rate: projectedAchievementRate,
    },
    section2: {
      sellthrough_rate: Math.round(s2.sellthrough_rate || 0),
      sales_amt: formatCurrency(s2.sales_amt || 0),
      sales_amt_raw: Math.round(s2.sales_amt || 0),
      inbound_amt: formatCurrency(s2.inbound_amt || 0),
      inbound_amt_raw: Math.round(s2.inbound_amt || 0),
      sales_yoy: Math.round(s2.sales_yoy_pct || 100),
    },
    section3: {
      sellthrough_rate: Math.round(s3.sellthrough_rate || 0),
      base_stock: formatCurrency(s3.base_stock_amt || 0),
      curr_stock: formatCurrency(s3.curr_stock_amt || 0),
      curr_stock_raw: Math.round(s3.curr_stock_amt || 0),
      stagnant_ratio: s3.stagnant_ratio ? s3.stagnant_ratio.toFixed(1) : '0.0',
    }
  };
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        main_summary: "AI 인사이트 기능이 비활성화되었습니다.",
        key_insights: [
          "OpenAI API 키가 설정되지 않았습니다.",
          "환경 변수 OPENAI_API_KEY를 설정해주세요."
        ]
      });
    }

    const body = await req.json();
    const { region, brand, asof_date, skip_cache = false } = body;

    const cacheKey = `summary:${region}:${brand}:${asof_date}`;
    
    // 캐시 확인
    if (!skip_cache) {
      const cached = cacheGet(cacheKey);
      if (cached) {
        console.log('✅ Cache hit for executive summary');
        return NextResponse.json(cached);
      }
    }

    const detailedData = buildDetailedData(body);
    console.log('📊 Building executive summary from data:', detailedData);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10초 타임아웃

    const prompt = `
너는 CEO/CFO에게 보고하는 경영 분석가다.
이 요약만 읽어도 대시보드를 보지 않아도 되게 만드는 것이 목표다.

입력 데이터:
섹션1 (매장별 매출):
- 당월실적: ${detailedData.section1.actual_sales} HKD
- 경과일수: ${detailedData.section1.elapsed_days}일 / 월총일수: ${detailedData.section1.total_days}일
- 월말환산 달성률: ${detailedData.section1.projected_achievement_rate}% (단순환산: ${detailedData.section1.elapsed_days}일 실적을 ${detailedData.section1.total_days}일로 환산)
- YoY: ${detailedData.section1.yoy}%
- 목표: ${detailedData.section1.target} HKD

섹션2 (당시즌 판매):
- 당시즌판매율: ${detailedData.section2.sellthrough_rate}%
- 누적판매: ${detailedData.section2.sales_amt} HKD
- 누적입고: ${detailedData.section2.inbound_amt} HKD
- 판매YoY: ${detailedData.section2.sales_yoy}%

섹션3 (과시즌 재고):
- 현재재고: ${detailedData.section3.curr_stock} HKD
- 소진율: ${detailedData.section3.sellthrough_rate}% (10/1 대비)
- 정체재고비중: ${detailedData.section3.stagnant_ratio}%

출력 형식:
{
  "main_summary": "매장별 매출은 당월실적 [수치]를 기록하며 월말 단순 환산 시 목표 대비 [%] 예상. 당시즌 판매는 판매율 [%]로 [재고회전 평가], 누적판매 [수치] 달성. 과시즌 재고는 현재 [수치] 잔존, 소진율 [%]로 [관리 평가]. [종합평가].",
  "key_insights": [
    "당월실적 ${detailedData.section1.actual_sales} HKD 기록, 목표달성률 ${detailedData.section1.achievement_rate}%로 [평가]",
    "전년 대비 YoY ${detailedData.section1.yoy}%로 [성장세 평가]",
    "당시즌판매율 ${detailedData.section2.sellthrough_rate}%로 재고회전 [평가]",
    "누적판매 ${detailedData.section2.sales_amt} 대비 누적입고 ${detailedData.section2.inbound_amt}로 [효율 평가]",
    "과시즌재고 ${detailedData.section3.curr_stock} HKD 잔존, 10/1 대비 소진율 ${detailedData.section3.sellthrough_rate}%",
    "정체재고비중 ${detailedData.section3.stagnant_ratio}%로 [리스크 평가]",
    "[전반적 종합 평가]"
  ]
}

중요 규칙:
1. 지표명은 반드시 입력 데이터에 표시된 명칭 그대로 사용
2. **월중에는 목표달성률이 아닌 "월말 단순 환산" 달성률을 사용하여 관리 필요성 판단**
3. 환산 방식: "${detailedData.section1.elapsed_days}일 실적 ÷ ${detailedData.section1.elapsed_days}일 × ${detailedData.section1.total_days}일 = 월말 예상 실적"
4. 모든 수치는 반드시 명시 (HKD, %, K/M 단위 포함)
5. 추측/가정/전망 금지 (단, 월말 환산은 단순 산술 계산이므로 허용)
6. 보고서체 사용 (~임, ~하고 있음)
7. main_summary는 4-5문장, 300자 이내
8. key_insights는 5-7개 불릿, 각 불릿 80자 이내
9. 평가는 명확하게 (양호함/안정적임/우수함/관리 필요함/주의 필요함 등)

출력은 JSON 형식만 사용.
`.trim();

    let result: any;

    try {
      const resp = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { 
            role: "system", 
            content: "너는 CEO/CFO에게 보고하는 경영 분석가다. 반드시 지표명과 수치를 명시하여 구체적인 경영 요약을 작성하라. 추측이나 가정은 금지. 보고서체를 사용하고 평가는 명확하게 제시하라." 
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.4,
        max_tokens: 800,
        response_format: { type: "json_object" },
      }, { signal: controller.signal as any });

      const text = resp.choices[0].message.content?.trim() ?? "{}";
      result = JSON.parse(text);
      console.log('✅ AI executive summary generated:', result);
    } catch (e: any) {
      console.error('❌ OpenAI API error:', e.message);
      throw e;
    } finally {
      clearTimeout(timeout);
    }

    // 응답 검증 및 기본값 설정
    const final = {
      main_summary: result.main_summary || "데이터 분석 중 오류가 발생했습니다.",
      key_insights: Array.isArray(result.key_insights) && result.key_insights.length > 0
        ? result.key_insights
        : [
            "당월실적 데이터를 확인해주세요.",
            "당시즌 판매율 데이터를 확인해주세요.",
            "과시즌 재고 데이터를 확인해주세요."
          ]
    };

    // 300자 제한 (main_summary)
    if (final.main_summary.length > 300) {
      final.main_summary = final.main_summary.slice(0, 297) + "...";
    }

    // 80자 제한 (각 insight)
    final.key_insights = final.key_insights.map((insight: string) => {
      if (insight.length > 80) {
        return insight.slice(0, 77) + "...";
      }
      return insight;
    });

    cacheSet(cacheKey, final, 10 * 60 * 1000); // 10분 캐시
    console.log('✅ Executive summary cached');
    return NextResponse.json(final);
  } catch (e: any) {
    console.error('❌ Executive summary API failed:', e);
    // 실패 시 기본 응답
    return NextResponse.json({
      main_summary: "요약 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      key_insights: [
        "데이터를 불러오는 중 문제가 발생했습니다.",
        "네트워크 연결을 확인해주세요.",
        "문제가 지속되면 관리자에게 문의하세요."
      ]
    });
  }
}
