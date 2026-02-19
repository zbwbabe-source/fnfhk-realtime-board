'use client';

import { useState } from 'react';
import { type Language } from '@/lib/translations';

interface DailyHighlightProps {
  date: string;
  brand: string;
  language: Language;
  isYtdMode: boolean;
  hkmcSection1Data: any;
  hkmcSection2Data: any;
  hkmcSection3Data: any;
  twSection1Data: any;
  twSection2Data: any;
  twSection3Data: any;
}

interface SectionHighlight {
  section: string;
  diagnosis: string;
  suggestion: string;
  tone: 'good' | 'bad' | 'neutral';
}

function metricToneClass(tone: SectionHighlight['tone']) {
  if (tone === 'good') return 'border-green-300 bg-green-50 text-green-900';
  if (tone === 'bad') return 'border-red-300 bg-red-50 text-red-900';
  return 'border-gray-300 bg-gray-50 text-gray-800';
}

function toFixed1(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'N/A';
  return value.toFixed(1);
}

function toFixed0(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'N/A';
  return value.toFixed(0);
}

function buildSection1Highlight(section1Data: any, isYtdMode: boolean, language: Language): SectionHighlight {
  const total = section1Data?.total_subtotal;
  const progress = isYtdMode ? total?.progress_ytd : total?.progress;
  const yoy = isYtdMode ? total?.yoy_ytd : total?.yoy;

  if (typeof progress !== 'number') {
    return {
      section: 'Section1',
      diagnosis: language === 'ko' ? '매장별 매출 데이터가 아직 준비되지 않았습니다.' : 'Store sales data is not ready yet.',
      suggestion: language === 'ko' ? '데이터 적재 상태를 먼저 확인하세요.' : 'Check data load status first.',
      tone: 'neutral',
    };
  }

  const good = progress >= 95 && (typeof yoy !== 'number' || yoy >= 100);
  const bad = progress < 85 || (typeof yoy === 'number' && yoy < 90);

  if (good) {
    return {
      section: 'Section1',
      diagnosis:
        language === 'ko'
          ? `진척률 ${toFixed1(progress)}%, YoY ${toFixed0(yoy)}%로 매출 흐름이 안정적입니다.`
          : `Progress ${toFixed1(progress)}% and YoY ${toFixed0(yoy)}% indicate stable sales.`,
      suggestion:
        language === 'ko' ? '상위 매장 재고 보충을 우선 유지하세요.' : 'Keep fast replenishment for top stores.',
      tone: 'good',
    };
  }

  if (bad) {
    return {
      section: 'Section1',
      diagnosis:
        language === 'ko'
          ? `진척률 ${toFixed1(progress)}%, YoY ${toFixed0(yoy)}%로 회복이 더딥니다.`
          : `Progress ${toFixed1(progress)}% and YoY ${toFixed0(yoy)}% show a weak run-rate.`,
      suggestion:
        language === 'ko' ? '저성과 채널 중심으로 판촉/가격 점검이 필요합니다.' : 'Review promo and pricing in weak channels.',
      tone: 'bad',
    };
  }

  return {
    section: 'Section1',
    diagnosis:
      language === 'ko'
        ? `진척률 ${toFixed1(progress)}%, YoY ${toFixed0(yoy)}%로 보합 구간입니다.`
        : `Progress ${toFixed1(progress)}% and YoY ${toFixed0(yoy)}% are in a flat zone.`,
    suggestion:
      language === 'ko' ? '반응 좋은 SKU를 중심으로 주간 운영 강도를 유지하세요.' : 'Maintain weekly focus on responsive SKUs.',
    tone: 'neutral',
  };
}

function buildSection2Highlight(section2Data: any, language: Language): SectionHighlight {
  const header = section2Data?.header;
  const st = header?.overall_sellthrough;
  const salesYoy = header?.sales_yoy_pct;
  const stPp = header?.sellthrough_yoy_pp;

  if (typeof st !== 'number') {
    return {
      section: 'Section2',
      diagnosis: language === 'ko' ? '당시즌 데이터가 아직 준비되지 않았습니다.' : 'In-season data is not ready yet.',
      suggestion: language === 'ko' ? '입고/판매 집계 완료 후 재확인하세요.' : 'Recheck after inbound/sales aggregation.',
      tone: 'neutral',
    };
  }

  const good = st >= 60 && (typeof salesYoy !== 'number' || salesYoy >= 100);
  const bad = st < 50 || (typeof salesYoy === 'number' && salesYoy < 90);

  if (good) {
    return {
      section: 'Section2',
      diagnosis:
        language === 'ko'
          ? `판매율 ${toFixed1(st)}%, 매출 YoY ${toFixed0(salesYoy)}%로 시즌 소화가 좋습니다.`
          : `Sell-through ${toFixed1(st)}% and Sales YoY ${toFixed0(salesYoy)}% are healthy.`,
      suggestion:
        language === 'ko' ? '리오더 타이밍을 당겨 기회손실을 줄이세요.' : 'Pull in reorders to reduce missed sales.',
      tone: 'good',
    };
  }

  if (bad) {
    return {
      section: 'Section2',
      diagnosis:
        language === 'ko'
          ? `판매율 ${toFixed1(st)}%, YoY ${toFixed0(salesYoy)}%로 시즌 소진이 약합니다.`
          : `Sell-through ${toFixed1(st)}% and YoY ${toFixed0(salesYoy)}% are weak.`,
      suggestion:
        language === 'ko'
          ? `저회전 카테고리 중심으로 재고 이동과 판촉을 강화하세요.`
          : `Strengthen stock transfer and promotion on slow categories.`,
      tone: 'bad',
    };
  }

  return {
    section: 'Section2',
    diagnosis:
      language === 'ko'
        ? `판매율 ${toFixed1(st)}%, YoY ${toFixed0(salesYoy)}%, 전년비 ${toFixed1(stPp)}%p 수준입니다.`
        : `Sell-through ${toFixed1(st)}%, YoY ${toFixed0(salesYoy)}%, vs LY ${toFixed1(stPp)}pp.`,
    suggestion:
      language === 'ko' ? '주력 라인의 판매 속도 차이를 주간 단위로 점검하세요.' : 'Monitor pace gap by key line weekly.',
    tone: 'neutral',
  };
}

function buildSection3Highlight(section3Data: any, language: Language): SectionHighlight {
  const header = section3Data?.header;
  const currStockYoy = header?.curr_stock_yoy_pct;
  const currStock = header?.curr_stock_amt;
  const staleRatioRaw = header?.stagnant_ratio;
  const staleRatio = typeof staleRatioRaw === 'number' ? staleRatioRaw * 100 : null;

  if (typeof currStock !== 'number') {
    return {
      section: 'Section3',
      diagnosis: language === 'ko' ? '과시즌 데이터가 아직 준비되지 않았습니다.' : 'Old-season data is not ready yet.',
      suggestion: language === 'ko' ? '스냅샷 생성 상태를 확인하세요.' : 'Check snapshot generation status.',
      tone: 'neutral',
    };
  }

  const good = (typeof currStockYoy === 'number' ? currStockYoy < 100 : false) && (typeof staleRatio === 'number' ? staleRatio < 20 : true);
  const bad = (typeof currStockYoy === 'number' ? currStockYoy > 120 : false) || (typeof staleRatio === 'number' ? staleRatio > 30 : false);

  if (good) {
    return {
      section: 'Section3',
      diagnosis:
        language === 'ko'
          ? `현재재고 YoY ${toFixed0(currStockYoy)}%, 정체비중 ${toFixed1(staleRatio)}%로 과시즌 관리가 양호합니다.`
          : `Current stock YoY ${toFixed0(currStockYoy)}% and stale ratio ${toFixed1(staleRatio)}% are under control.`,
      suggestion:
        language === 'ko' ? '소진 속도 유지 위해 고정 할인율은 유지하세요.' : 'Keep markdown cadence to sustain depletion.',
      tone: 'good',
    };
  }

  if (bad) {
    return {
      section: 'Section3',
      diagnosis:
        language === 'ko'
          ? `현재재고 YoY ${toFixed0(currStockYoy)}%, 정체비중 ${toFixed1(staleRatio)}%로 부담이 큽니다.`
          : `Current stock YoY ${toFixed0(currStockYoy)}% and stale ratio ${toFixed1(staleRatio)}% are elevated.`,
      suggestion:
        language === 'ko' ? '장기재고 중심으로 할인/채널전환을 즉시 확대하세요.' : 'Expand markdown and channel-shift for aged stock.',
      tone: 'bad',
    };
  }

  return {
    section: 'Section3',
    diagnosis:
      language === 'ko'
        ? `현재재고 YoY ${toFixed0(currStockYoy)}%, 정체비중 ${toFixed1(staleRatio)}%로 관리가 필요합니다.`
        : `Current stock YoY ${toFixed0(currStockYoy)}% and stale ratio ${toFixed1(staleRatio)}% need attention.`,
    suggestion:
      language === 'ko' ? '재고연령 구간별로 판매 전략을 분리 운영하세요.' : 'Split sales actions by inventory age band.',
    tone: 'neutral',
  };
}

function buildCountryHighlights(section1Data: any, section2Data: any, section3Data: any, isYtdMode: boolean, language: Language) {
  return [
    buildSection1Highlight(section1Data, isYtdMode, language),
    buildSection2Highlight(section2Data, language),
    buildSection3Highlight(section3Data, language),
  ];
}

export default function DailyHighlight({
  date,
  brand,
  language,
  isYtdMode,
  hkmcSection1Data,
  hkmcSection2Data,
  hkmcSection3Data,
  twSection1Data,
  twSection2Data,
  twSection3Data,
}: DailyHighlightProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hkmcHighlights = buildCountryHighlights(hkmcSection1Data, hkmcSection2Data, hkmcSection3Data, isYtdMode, language);
  const twHighlights = buildCountryHighlights(twSection1Data, twSection2Data, twSection3Data, isYtdMode, language);

  return (
    <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-bold text-gray-900">
          {language === 'ko' ? '오늘의 하이라이트' : "Today's Highlights"}
        </h2>
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600">
            {date} | {brand} | {isYtdMode ? 'YTD' : 'MTD'}
          </span>
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
            aria-expanded={isExpanded}
          >
            {isExpanded
              ? language === 'ko'
                ? '접기'
                : 'Collapse'
              : language === 'ko'
                ? '펼치기'
                : 'Expand'}
          </button>
        </div>
      </div>

      {isExpanded && <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">HKMC</h3>
          <div className="space-y-2">
            {hkmcHighlights.map((item) => (
              <div key={`hkmc-${item.section}`} className={`rounded-md border px-3 py-2 ${metricToneClass(item.tone)}`}>
                <div className="text-xs font-semibold mb-1">{item.section}</div>
                <div className="text-sm">{item.diagnosis}</div>
                <div className="text-xs mt-1 opacity-90">
                  {language === 'ko' ? '제언:' : 'Action:'} {item.suggestion}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">TW</h3>
          <div className="space-y-2">
            {twHighlights.map((item) => (
              <div key={`tw-${item.section}`} className={`rounded-md border px-3 py-2 ${metricToneClass(item.tone)}`}>
                <div className="text-xs font-semibold mb-1">{item.section}</div>
                <div className="text-sm">{item.diagnosis}</div>
                <div className="text-xs mt-1 opacity-90">
                  {language === 'ko' ? '제언:' : 'Action:'} {item.suggestion}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>}
    </div>
  );
}
