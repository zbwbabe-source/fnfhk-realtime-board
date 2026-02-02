import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// 간단한 메모리 캐시 (프로덕션에서는 Redis 등 사용 권장)
const insightCache = new Map<string, { insights: any; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1시간

/**
 * POST /api/insights/summary
 * 
 * Request Body:
 * {
 *   region: string,
 *   brand: string,
 *   asofDate: string,
 *   mode: 'mtd' | 'ytd',
 *   kpis: {
 *     section1: { k1, k2, k3 },
 *     section2: { k1, k2, k3 },
 *     section3: { k1, k2, k3 }
 *   }
 * }
 * 
 * Response:
 * {
 *   section1Line: string,
 *   section2Line: string,
 *   section3Line: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { region, brand, asofDate, mode, kpis } = body;

    // 캐시 사용 안 함 - 항상 최신 KPI로 인사이트 생성
    console.log('📊 Generating insights for:', { region, brand, asofDate, mode, kpis });

    // 인사이트 생성
    const insights = {
      section1Line: generateSection1Insight(kpis.section1, mode),
      section2Line: generateSection2Insight(kpis.section2),
      section3Line: generateSection3Insight(kpis.section3),
    };

    console.log('✅ Generated insights:', insights);
    return NextResponse.json(insights);

  } catch (error: any) {
    console.error('Error generating insights:', error);
    return NextResponse.json(
      { error: 'Failed to generate insights', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * 섹션1 인사이트 생성
 * 규칙: 한국어 1문장, 60자 이내, 숫자 1개 포함
 */
function generateSection1Insight(kpis: any, mode: string): string {
  const { k1, k2, k3 } = kpis; // k1: 실적, k2: YoY, k3: 목표대비
  
  console.log('📊 Generating insight from KPIs:', { k1, k2, k3, mode });
  
  // k2, k3가 문자열 "0.0%" 같은 경우도 처리
  const yoyMatch = String(k2).match(/([0-9.]+)%/);
  const progressMatch = String(k3).match(/([0-9.]+)%/);
  
  if (!yoyMatch || !progressMatch) {
    console.log('❌ Failed to parse KPIs:', { k2, k3, yoyMatch, progressMatch });
    return '데이터 분석 중입니다.';
  }
  
  const yoy = parseFloat(yoyMatch[1]);
  const progress = parseFloat(progressMatch[1]);
  const modeText = mode === 'ytd' ? '누적' : '당월';

  console.log('✅ Parsed values:', { yoy, progress, mode });

  // 실적이 0인 경우 (데이터 없음)
  if (progress === 0 && yoy === 0) {
    return `${modeText} 데이터가 아직 집계되지 않았습니다.`;
  }

  // 목표대비와 YoY를 함께 고려한 인사이트
  if (progress >= 100) {
    if (yoy >= 100) {
      return `${modeText} 목표 ${progress.toFixed(1)}% 달성, 전년대비 ${yoy.toFixed(1)}%로 성장세 지속.`;
    } else if (yoy > 0) {
      return `${modeText} 목표 ${progress.toFixed(1)}% 달성, 우수한 성과를 유지 중입니다.`;
    } else {
      return `${modeText} 목표 ${progress.toFixed(1)}% 달성했으나 전년 데이터 부재로 비교 불가.`;
    }
  } else if (progress >= 80) {
    if (yoy >= 90) {
      return `${modeText} 목표대비 ${progress.toFixed(1)}%로 양호, 전년 수준 유지 중.`;
    } else if (yoy >= 70) {
      return `목표대비 ${progress.toFixed(1)}%로 양호하나, 전년대비 ${yoy.toFixed(1)}%로 둔화.`;
    } else if (yoy > 0) {
      return `목표대비 ${progress.toFixed(1)}%이나 YoY ${yoy.toFixed(1)}%로 부진, 개선 필요.`;
    } else {
      return `목표대비 ${progress.toFixed(1)}%로 양호, 마감 전 추가 매출 집중 필요.`;
    }
  } else if (progress >= 60) {
    return `목표대비 ${progress.toFixed(1)}%로 둔화, 주말 프로모션 검토 권장.`;
  } else if (progress > 0) {
    return `목표대비 ${progress.toFixed(1)}%로 부진, 즉시 판매 전략 점검 필요.`;
  } else {
    return `${modeText} 실적 데이터 집계 대기 중입니다.`;
  }
}

/**
 * 섹션2 인사이트 생성
 */
function generateSection2Insight(kpis: any): string {
  const { k1 } = kpis; // k1: Sell-through
  
  // TODO: 실제 데이터 기반 인사이트 생성
  if (k1 === 'N/A') {
    return '당시즌 판매율 데이터를 분석 중입니다.';
  }
  
  const stMatch = k1.match(/([0-9.]+)%/);
  if (stMatch) {
    const st = parseFloat(stMatch[1]);
    if (st >= 70) {
      return `당시즌 판매율 ${st.toFixed(1)}%로 우수, 인기 상품 재입고 검토.`;
    } else if (st >= 50) {
      return `판매율 ${st.toFixed(1)}%로 양호, 재고 회전율 모니터링 지속.`;
    } else {
      return `판매율 ${st.toFixed(1)}%로 저조, 마크다운 프로모션 고려 필요.`;
    }
  }
  
  return '당시즌 판매 동향을 모니터링하고 있습니다.';
}

/**
 * 섹션3 인사이트 생성
 */
function generateSection3Insight(kpis: any): string {
  const { k1 } = kpis; // k1: 과시즌 재고
  
  // TODO: 실제 데이터 기반 인사이트 생성
  if (k1 === 'N/A') {
    return '과시즌 재고 소진 현황을 분석 중입니다.';
  }
  
  return '과시즌 재고 소진율 모니터링 중, 클리어런스 전략 점검 권장.';
}
