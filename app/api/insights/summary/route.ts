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

  // 날짜 단순환산 월말 진척률 계산
  const elapsedDays = s1.elapsed_days || 1;
  const totalDays = s1.total_days || 30;
  const currentProgress = s1.achievement_rate || 0;
  
  // 안전 장치: elapsed_days가 비정상적으로 작으면 환산하지 않음
  const projectedProgress = (elapsedDays >= 3) 
    ? Math.round((currentProgress / elapsedDays) * totalDays)
    : 0; // 3일 미만은 환산 의미 없음

  console.log('📊 Projection calculation:', {
    elapsedDays,
    totalDays,
    currentProgress,
    projectedProgress,
    formula: `(${currentProgress}% / ${elapsedDays}일) × ${totalDays}일 = ${projectedProgress}%`
  });

  // ASOFDATE에서 월/일 추출
  const asofDate = input.asof_date || '';
  const dateObj = new Date(asofDate);
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();
  const asofDateFormatted = `${month}월 ${day}일`;

  // 정체재고비중 전월말 대비 증감
  const stagnantRatio = parseFloat(s3.stagnant_ratio || 0);
  const prevStagnantRatio = (s3.prev_month_stagnant_ratio || 0) * 100;
  const stagnantRatioChange = stagnantRatio - prevStagnantRatio;
  const stagnantRatioChangeText = stagnantRatioChange > 0 
    ? `${stagnantRatioChange.toFixed(1)}%p 증가`
    : stagnantRatioChange < 0 
    ? `${Math.abs(stagnantRatioChange).toFixed(1)}%p 감소`
    : '변동 없음';

  return {
    section1: {
      actual_sales: formatCurrency(s1.actual_sales_ytd || 0),
      actual_sales_raw: Math.round(s1.actual_sales_ytd || 0),
      achievement_rate: Math.round(currentProgress),
      yoy: Math.round(s1.yoy_ytd || 0),
      target: formatCurrency(s1.target_ytd || 0),
      asof_date: asofDateFormatted,
      elapsed_days: elapsedDays,
      total_days: totalDays,
      projected_progress: projectedProgress,
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
      stagnant_ratio: stagnantRatio.toFixed(1),
      stagnant_ratio_change: stagnantRatioChangeText,
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
- ASOFDATE: ${detailedData.section1.asof_date}
- 현재 진척률: ${detailedData.section1.achievement_rate}%
- 날짜 단순환산 월말 진척률: ${detailedData.section1.projected_progress > 0 ? `${detailedData.section1.projected_progress}% (${detailedData.section1.elapsed_days}일 진척 ÷ ${detailedData.section1.elapsed_days}일 × ${detailedData.section1.total_days}일)` : '계산 불가 (경과일수 부족)'}
- YoY: ${detailedData.section1.yoy}%
- 목표: ${detailedData.section1.target} HKD

섹션2 (당시즌 판매):
- 당시즌판매율: ${detailedData.section2.sellthrough_rate}%
- 누적판매: ${detailedData.section2.sales_amt} HKD (최초 입고시점부터)
- 누적입고: ${detailedData.section2.inbound_amt} HKD
- 판매YoY: ${detailedData.section2.sales_yoy}%

섹션3 (과시즌 재고):
- 현재재고: ${detailedData.section3.curr_stock} HKD
- 소진율: ${detailedData.section3.sellthrough_rate}% (10/1 대비)
- 정체재고비중: ${detailedData.section3.stagnant_ratio}% (전월말 대비 ${detailedData.section3.stagnant_ratio_change})

출력 형식 (반드시 아래 형식을 따를 것):
{
  "main_summary": "매장별 매출은 당월실적 ${detailedData.section1.actual_sales} HKD를 기록하며 ${detailedData.section1.asof_date} 현재 진척률 ${detailedData.section1.achievement_rate}%임. ${detailedData.section1.projected_progress > 0 ? `날짜로 단순환산시, 월말일 진척률은 ${detailedData.section1.projected_progress}%임.` : '날짜로 단순환산은 경과일수 부족으로 생략.'} 당시즌 판매는 판매율 ${detailedData.section2.sellthrough_rate}%로 [재고회전 평가]를 받고 있으며, 최초 입고시점부터 누적판매 ${detailedData.section2.sales_amt} HKD 달성함. 과시즌 재고는 현재 ${detailedData.section3.curr_stock} HKD 잔존하며, 소진율 ${detailedData.section3.sellthrough_rate}%로 [소진율 평가]. 정체재고비중 ${detailedData.section3.stagnant_ratio}%로 전월말 대비 ${detailedData.section3.stagnant_ratio_change}.",
  "key_insights": [
    "당월실적 ${detailedData.section1.actual_sales} HKD 기록, ${detailedData.section1.asof_date} 현재 진척률 ${detailedData.section1.achievement_rate}%",
    "전년 대비 YoY ${detailedData.section1.yoy}%로 [성장세 평가]",
    "당시즌판매율 ${detailedData.section2.sellthrough_rate}%로 재고회전 [평가]",
    "누적판매 ${detailedData.section2.sales_amt} 대비 누적입고 ${detailedData.section2.inbound_amt}로 [효율 평가]",
    "과시즌재고 ${detailedData.section3.curr_stock} HKD 잔존, 10/1 대비 소진율 ${detailedData.section3.sellthrough_rate}%",
    "정체재고비중 ${detailedData.section3.stagnant_ratio}%로 [리스크 평가], 전월말 대비 ${detailedData.section3.stagnant_ratio_change}",
    "[전반적 종합 평가]"
  ]
}

중요 규칙:
1. 반드시 위의 출력 형식을 따를 것 (수치와 날짜 모두 포함)
2. [평가] 부분만 적절한 평가 문구로 대체할 것
   - 재고회전 평가: 안정적/양호/우수 등
   - 소진율 평가: 관리 필요/양호/주의 필요 등
   - 리스크 평가: 안정적/주의 필요 등
3. 모든 수치는 반드시 명시된 대로 사용 (HKD, %, K/M 단위 포함)
4. 추측/가정/전망 금지 (단, 날짜 단순환산은 허용)
5. 보고서체 사용 (~임, ~함)
6. main_summary는 300자 이내
7. key_insights는 5-7개 불릿, 각 불릿 80자 이내

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
