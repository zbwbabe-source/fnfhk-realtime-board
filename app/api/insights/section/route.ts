import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// OpenAI 클라이언트를 함수 내부에서 생성 (API 키 체크 후)
function createOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

interface Section1Data {
  actual_sales_ytd: number;
  target_ytd: number;
  achievement_rate: number;
  yoy_ytd: number;
}

interface Section2Data {
  sellthrough_rate: number;
  sales_amt: number;
  inbound_amt: number;
  sales_yoy_pct: number;
}

interface Section3Data {
  base_stock_amt: number;
  curr_stock_amt: number;
  sellthrough_rate: number;
}

interface InsightRequest {
  section: '1' | '2' | '3';
  data: Section1Data | Section2Data | Section3Data;
  language: 'ko' | 'en';
}

/**
 * POST /api/insights/section
 * 
 * 각 섹션의 데이터를 분석해서 신호등 색상과 짧은 인사이트 제공
 */
export async function POST(request: NextRequest) {
  try {
    const body: InsightRequest = await request.json();
    const { section, data, language } = body;

    // API 키가 없으면 조용히 실패 (아무것도 표시하지 않음)
    const openai = createOpenAIClient();
    if (!openai) {
      console.log('⚠️ OpenAI API key not configured, skipping insights');
      // 약간의 지연 후 null 응답 (로딩 느낌 주기)
      await new Promise(resolve => setTimeout(resolve, 2000));
      return NextResponse.json({ status: null, insight: null });
    }

    let prompt = '';
    let systemPrompt = language === 'ko' 
      ? '당신은 리테일 기업의 CFO 관점에서 판단하는 경영 분석가입니다. 숫자를 요약하지 말고, 반드시 "의미·판단·리스크"만 서술하세요. 긍정/중립/부정 중 하나로 명확히 판단하고, 경영 관점에서 중요한 포인트 1가지만 최대 1문장, 20자 이내로 작성하세요.'
      : 'You are a CFO-perspective business analyst for a retail company. Do not summarize numbers; focus only on "meaning, judgment, and risk." Provide a clear judgment (positive/neutral/negative) and mention only one key point from a management perspective in one sentence, within 20 characters.';

    // 섹션별 프롬프트 생성
    if (section === '1') {
      const d = data as Section1Data;
      prompt = language === 'ko'
        ? `아래는 특정 지역·브랜드의 당월 매출 성과 지표입니다.
매출 성장의 '질'을 CFO 관점에서 판단하세요.

지표:
- 연누적 달성률: ${d.achievement_rate.toFixed(1)}%
- 전년 대비 성장률(YoY): ${d.yoy_ytd > 0 ? '+' : ''}${d.yoy_ytd.toFixed(1)}%

판단 기준:
- YoY와 목표 달성률의 괴리를 해석할 것
- 단기 반등인지 추세적 개선인지 판단할 것
- 추가 액션이 필요한 경우만 언급

신호등 색상 기준:
- green(긍정): 달성률 100% 이상 & YoY +5% 이상
- yellow(중립): 달성률 90-100% 또는 YoY 0-5%
- red(부정): 달성률 90% 미만 또는 YoY 마이너스

JSON 형식으로만 응답하세요:
{
  "status": "green|yellow|red",
  "insight": "최대 1문장, 20자 이내"
}

출력 예시:
"목표 대비 속도 점검 필요함" / "성장 흐름은 안정적임" / "반등이나 지속성은 미확인"`
        : `Below are the monthly sales performance indicators for a specific region and brand.
Judge the 'quality' of sales growth from a CFO perspective.

Indicators:
- YTD Achievement Rate: ${d.achievement_rate.toFixed(1)}%
- YoY Growth Rate: ${d.yoy_ytd > 0 ? '+' : ''}${d.yoy_ytd.toFixed(1)}%

Judgment Criteria:
- Interpret the gap between YoY and target achievement rate
- Determine if it's a short-term rebound or a trend-based improvement
- Mention only if additional action is needed

Traffic Light Criteria:
- green(positive): Achievement ≥100% & YoY ≥+5%
- yellow(neutral): Achievement 90-100% or YoY 0-5%
- red(negative): Achievement <90% or YoY negative

Respond in JSON format only:
{
  "status": "green|yellow|red",
  "insight": "One sentence, within 20 characters"
}

Output examples:
"Check pacing vs target" / "Growth trend stable" / "Sustainability unclear"`;
    } else if (section === '2') {
      const d = data as Section2Data;
      prompt = language === 'ko'
        ? `아래는 당시즌 판매율 및 관련 지표입니다.
재고 회전 관점에서 리스크 여부를 판단하세요.

지표:
- 전체 판매율: ${d.sellthrough_rate.toFixed(1)}%
- 전년 대비 판매 증감률: ${d.sales_yoy_pct.toFixed(1)}%

판단 기준:
- 판매율 수준이 정상 / 경계 / 위험 중 어디인지 판단
- 매출 대비 판매 속도의 적정성 평가
- 할인 개입 가능성이 있으면 언급

신호등 색상 기준:
- green(긍정): 판매율 70% 이상 & 판매 YoY 100% 이상
- yellow(중립): 판매율 50-70% 또는 판매 YoY 90-100%
- red(부정): 판매율 50% 미만 또는 판매 YoY 90% 미만

JSON 형식으로만 응답하세요:
{
  "status": "green|yellow|red",
  "insight": "최대 1문장, 20자 이내"
}

출력 예시:
"회전 속도는 보수적임" / "할인 압력 가능성 있음" / "시즌 진행은 안정적임"`
        : `Below are the in-season sell-through rate and related indicators.
Judge the risk from an inventory turnover perspective.

Indicators:
- Overall Sell-through: ${d.sellthrough_rate.toFixed(1)}%
- Sales YoY Change: ${d.sales_yoy_pct.toFixed(1)}%

Judgment Criteria:
- Determine if sell-through level is normal / caution / risk
- Evaluate the adequacy of sales velocity vs sales amount
- Mention if discount intervention is possible

Traffic Light Criteria:
- green(positive): Sell-through ≥70% & Sales YoY ≥100%
- yellow(neutral): Sell-through 50-70% or Sales YoY 90-100%
- red(negative): Sell-through <50% or Sales YoY <90%

Respond in JSON format only:
{
  "status": "green|yellow|red",
  "insight": "One sentence, within 20 characters"
}

Output examples:
"Turnover is conservative" / "Discount pressure likely" / "Season pacing stable"`;
    } else if (section === '3') {
      const d = data as Section3Data;
      prompt = language === 'ko'
        ? `아래는 과시즌 재고 및 소진 관련 지표입니다.
재무 리스크 관점에서 상태를 판단하세요.

지표:
- 재고 소진율: ${d.sellthrough_rate.toFixed(1)}%
- 현재 잔존 재고: ${(d.curr_stock_amt / 1000000).toFixed(1)}M HKD

판단 기준:
- 과시즌 재고가 관리 가능 수준인지 판단
- 소진 추세 대비 잔존 리스크 평가
- 손익 영향 가능성이 있으면 명확히 언급

신호등 색상 기준:
- green(긍정): 소진율 25% 이상
- yellow(중립): 소진율 15-25%
- red(부정): 소진율 15% 미만

JSON 형식으로만 응답하세요:
{
  "status": "green|yellow|red",
  "insight": "최대 1문장, 20자 이내"
}

출력 예시:
"손익 부담 잔존함" / "소진은 진행 중이나 느림" / "재고 리스크 관리 구간"`
        : `Below are the old-season inventory and clearance indicators.
Judge the status from a financial risk perspective.

Indicators:
- Clearance Rate: ${d.sellthrough_rate.toFixed(1)}%
- Current Remaining Stock: ${(d.curr_stock_amt / 1000000).toFixed(1)}M HKD

Judgment Criteria:
- Determine if old-season inventory is at a manageable level
- Evaluate remaining risk vs clearance trend
- Clearly mention if there's a P&L impact possibility

Traffic Light Criteria:
- green(positive): Clearance ≥25%
- yellow(neutral): Clearance 15-25%
- red(negative): Clearance <15%

Respond in JSON format only:
{
  "status": "green|yellow|red",
  "insight": "One sentence, within 20 characters"
}

Output examples:
"P&L burden remains" / "Clearance slow but ongoing" / "Inventory risk managed"`;
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 100, // 20자 이내로 줄임
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(completion.choices[0].message.content || '{}');

    console.log(`✅ Section ${section} Insight:`, result);

    return NextResponse.json({
      status: result.status || 'yellow',
      insight: result.insight || '',
    });

  } catch (error: any) {
    console.error('Error in /api/insights/section:', error);
    return NextResponse.json(
      { error: 'Failed to generate insight', message: error.message },
      { status: 500 }
    );
  }
}
