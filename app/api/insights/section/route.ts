import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    let prompt = '';
    let systemPrompt = language === 'ko' 
      ? '당신은 소매업 데이터 분석 전문가입니다. 주어진 KPI를 분석하여 신호등 색상(green/yellow/red)과 2줄 이내의 간결한 인사이트를 제공하세요.'
      : 'You are a retail data analysis expert. Analyze the given KPIs and provide a traffic light color (green/yellow/red) and a concise insight within 2 lines.';

    // 섹션별 프롬프트 생성
    if (section === '1') {
      const d = data as Section1Data;
      prompt = language === 'ko'
        ? `매장별 매출 현황:
- 연누적 달성률: ${d.achievement_rate.toFixed(1)}%
- 전년 대비: ${d.yoy_ytd > 0 ? '+' : ''}${d.yoy_ytd.toFixed(1)}%

기준:
- 초록(양호): 달성률 100% 이상 & YoY +5% 이상
- 노랑(유의): 달성률 90-100% 또는 YoY 0-5%
- 빨강(위험): 달성률 90% 미만 또는 YoY 마이너스

JSON 형식으로만 응답하세요:
{
  "status": "green|yellow|red",
  "insight": "2줄 이내의 인사이트"
}`
        : `Store Sales Status:
- YTD Achievement Rate: ${d.achievement_rate.toFixed(1)}%
- YoY: ${d.yoy_ytd > 0 ? '+' : ''}${d.yoy_ytd.toFixed(1)}%

Criteria:
- Green (Good): Achievement ≥100% & YoY ≥+5%
- Yellow (Caution): Achievement 90-100% or YoY 0-5%
- Red (Risk): Achievement <90% or YoY negative

Respond in JSON format only:
{
  "status": "green|yellow|red",
  "insight": "Concise insight within 2 lines"
}`;
    } else if (section === '2') {
      const d = data as Section2Data;
      prompt = language === 'ko'
        ? `당시즌 판매율 현황:
- 전체 판매율: ${d.sellthrough_rate.toFixed(1)}%
- 전년 대비 판매: ${d.sales_yoy_pct.toFixed(1)}%

기준:
- 초록(양호): 판매율 70% 이상 & 판매 YoY 100% 이상
- 노랑(유의): 판매율 50-70% 또는 판매 YoY 90-100%
- 빨강(위험): 판매율 50% 미만 또는 판매 YoY 90% 미만

JSON 형식으로만 응답하세요:
{
  "status": "green|yellow|red",
  "insight": "2줄 이내의 인사이트"
}`
        : `In-season Sell-through Status:
- Overall Sell-through: ${d.sellthrough_rate.toFixed(1)}%
- Sales YoY: ${d.sales_yoy_pct.toFixed(1)}%

Criteria:
- Green (Good): Sell-through ≥70% & Sales YoY ≥100%
- Yellow (Caution): Sell-through 50-70% or Sales YoY 90-100%
- Red (Risk): Sell-through <50% or Sales YoY <90%

Respond in JSON format only:
{
  "status": "green|yellow|red",
  "insight": "Concise insight within 2 lines"
}`;
    } else if (section === '3') {
      const d = data as Section3Data;
      prompt = language === 'ko'
        ? `과시즌 재고 소진 현황:
- 재고 소진율: ${d.sellthrough_rate.toFixed(1)}%
- 현재 재고: ${(d.curr_stock_amt / 1000000).toFixed(1)}M HKD

기준:
- 초록(양호): 소진율 25% 이상
- 노랑(유의): 소진율 15-25%
- 빨강(위험): 소진율 15% 미만

JSON 형식으로만 응답하세요:
{
  "status": "green|yellow|red",
  "insight": "2줄 이내의 인사이트"
}`
        : `Old-season Inventory Clearance:
- Clearance Rate: ${d.sellthrough_rate.toFixed(1)}%
- Current Stock: ${(d.curr_stock_amt / 1000000).toFixed(1)}M HKD

Criteria:
- Green (Good): Clearance ≥25%
- Yellow (Caution): Clearance 15-25%
- Red (Risk): Clearance <15%

Respond in JSON format only:
{
  "status": "green|yellow|red",
  "insight": "Concise insight within 2 lines"
}`;
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 200,
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
