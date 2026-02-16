import { executeSnowflakeQuery } from '@/lib/snowflake';
import { getStoreMaster, normalizeBrand } from '@/lib/store-utils';
import { loadWeightDataServer, calculateMonthEndProjection, calculateProjectedYoY } from '@/lib/weight-utils';
import { getPeriodFromDateString, convertTwdToHkd } from '@/lib/exchange-rate-utils';
import targetData from '@/data/target.json';

/**
 * 매장별 YTD 목표 계산 함수
 */
function calculateYtdTargetForStore(
  shopCd: string,
  year: number,
  currentMonth: number,
  currentDay: number,
  targetData: any
): number {
  let ytdTarget = 0;

  // 1월부터 당월까지의 전체 목표 합산
  for (let m = 1; m <= currentMonth; m++) {
    const periodKey = `${year}-${String(m).padStart(2, '0')}`;
    const periodData = targetData[periodKey] || {};
    const storeTarget = periodData[shopCd];
    if (storeTarget) {
      ytdTarget += storeTarget.target_mth || 0;
    }
  }

  return ytdTarget;
}

export interface StoreSalesPayload {
  asof_date: string;
  region: string;
  brand: string;
  hk_normal: any[];
  hk_normal_subtotal: any;
  hk_outlet: any[];
  hk_outlet_subtotal: any;
  hk_online: any[];
  hk_online_subtotal: any;
  hk_subtotal: any;
  mc_normal: any[];
  mc_normal_subtotal: any;
  mc_outlet: any[];
  mc_outlet_subtotal: any;
  mc_online: any[];
  mc_online_subtotal: any;
  mc_subtotal: any;
  tw_normal: any[];
  tw_normal_subtotal: any;
  tw_outlet: any[];
  tw_outlet_subtotal: any;
  tw_online: any[];
  tw_online_subtotal: any;
  tw_subtotal: any;
  total_subtotal: any;
}

/**
 * Section1 Store Sales 데이터 조회
 */
export async function fetchSection1StoreSales({
  region,
  brand,
  date,
}: {
  region: string;
  brand: string;
  date: string;
}): Promise<StoreSalesPayload> {
  // Store master 로드
  const storeMaster = getStoreMaster();
  const countries = region === 'HKMC' ? ['HK', 'MC'] : ['TW'];

  // Section 1용 매장: Warehouse 제외
  const targetStores = storeMaster.filter(
    (s) =>
      countries.includes(s.country) &&
      normalizeBrand(s.brand) === brand &&
      s.channel !== 'Warehouse'
  );

  console.log(`📊 Filtered stores: ${targetStores.length} stores (brand=${brand})`);

  if (targetStores.length === 0) {
    return {
      asof_date: date,
      region,
      brand,
      hk_normal: [],
      hk_normal_subtotal: null,
      hk_outlet: [],
      hk_outlet_subtotal: null,
      hk_online: [],
      hk_online_subtotal: null,
      hk_subtotal: null,
      mc_normal: [],
      mc_normal_subtotal: null,
      mc_outlet: [],
      mc_outlet_subtotal: null,
      mc_online: [],
      mc_online_subtotal: null,
      mc_subtotal: null,
      tw_normal: [],
      tw_normal_subtotal: null,
      tw_outlet: [],
      tw_outlet_subtotal: null,
      tw_online: [],
      tw_online_subtotal: null,
      tw_subtotal: null,
      total_subtotal: null,
    };
  }

  const storeCodes = targetStores.map((s) => `'${s.store_code}'`).join(',');

  // 날짜 계산
  const asofDate = new Date(date);
  const year = asofDate.getFullYear();
  const month = asofDate.getMonth() + 1;

  // 목표값 데이터 로드 (period 기준)
  const periodKey = `${year}-${String(month).padStart(2, '0')}`;
  const targetsByStore = (targetData as any)[periodKey] || {};

  console.log(
    `📊 Target period: ${periodKey}, stores with targets: ${
      Object.keys(targetsByStore).length
    }`
  );

  // 가중치 데이터 로드 (서버 사이드)
  const weightMap = await loadWeightDataServer();

  // MTD + YTD + MoM(전월 대비) 동시 조회 쿼리
  const query = `
    WITH store_sales AS (
      SELECT
        LOCAL_SHOP_CD AS shop_cd,
        
        /* MTD ACT */
        SUM(
          CASE
            WHEN SALE_DT BETWEEN DATE_TRUNC('MONTH', TO_DATE(?)) AND TO_DATE(?)
            THEN ACT_SALE_AMT ELSE 0
          END
        ) AS mtd_act,
        
        /* MTD ACT PY (전년 동월) */
        SUM(
          CASE
            WHEN SALE_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('MONTH', TO_DATE(?))) AND DATEADD(YEAR, -1, TO_DATE(?))
            THEN ACT_SALE_AMT ELSE 0
          END
        ) AS mtd_act_py,
        
        /* MTD ACT PM (전월) */
        SUM(
          CASE
            WHEN SALE_DT BETWEEN DATEADD(MONTH, -1, DATE_TRUNC('MONTH', TO_DATE(?))) AND DATEADD(DAY, -1, DATE_TRUNC('MONTH', TO_DATE(?)))
            THEN ACT_SALE_AMT ELSE 0
          END
        ) AS mtd_act_pm,
        
        /* MTD TAG (정가 기준) */
        SUM(
          CASE
            WHEN SALE_DT BETWEEN DATE_TRUNC('MONTH', TO_DATE(?)) AND TO_DATE(?)
            THEN TAG_SALE_AMT ELSE 0
          END
        ) AS mtd_tag,
        
        /* YTD ACT */
        SUM(
          CASE
            WHEN SALE_DT BETWEEN DATE_TRUNC('YEAR', TO_DATE(?)) AND TO_DATE(?)
            THEN ACT_SALE_AMT ELSE 0
          END
        ) AS ytd_act,
        
        /* YTD ACT PY */
        SUM(
          CASE
            WHEN SALE_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('YEAR', TO_DATE(?))) AND DATEADD(YEAR, -1, TO_DATE(?))
            THEN ACT_SALE_AMT ELSE 0
          END
        ) AS ytd_act_py,
        
        /* YTD TAG (정가 기준) */
        SUM(
          CASE
            WHEN SALE_DT BETWEEN DATE_TRUNC('YEAR', TO_DATE(?)) AND TO_DATE(?)
            THEN TAG_SALE_AMT ELSE 0
          END
        ) AS ytd_tag
        
      FROM SAP_FNF.DW_HMD_SALE_D
      WHERE
        (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
        AND LOCAL_SHOP_CD IN (${storeCodes})
        AND SALE_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('YEAR', TO_DATE(?))) AND TO_DATE(?)
      GROUP BY LOCAL_SHOP_CD
    )
    SELECT
      shop_cd,
      mtd_act,
      mtd_act_py,
      mtd_act_pm,
      mtd_tag,
      CASE
        WHEN mtd_act_py > 0
        THEN (mtd_act / mtd_act_py) * 100
        ELSE 0
      END AS yoy,
      CASE
        WHEN mtd_act_pm > 0
        THEN (mtd_act / mtd_act_pm) * 100
        ELSE 0
      END AS mom,
      ytd_act,
      ytd_act_py,
      ytd_tag,
      CASE
        WHEN ytd_act_py > 0
        THEN (ytd_act / ytd_act_py) * 100
        ELSE 0
      END AS yoy_ytd
    FROM store_sales
    ORDER BY shop_cd
  `;

  const rows = await executeSnowflakeQuery(query, [
    date,
    date, // MTD ACT current
    date,
    date, // MTD ACT PY
    date,
    date, // MTD ACT PM (전월)
    date,
    date, // MTD TAG current
    date,
    date, // YTD ACT current
    date,
    date, // YTD ACT PY
    date,
    date, // YTD TAG current
    brand, // brand filter
    date,
    date, // date range filter
  ]);

  console.log('📊 Section1 Query Result:', {
    region,
    brand,
    date,
    targetStoresCount: targetStores.length,
    rowsCount: rows.length,
  });

  // TW 리전일 때 환율 적용
  const isTwRegion = region === 'TW';
  const period = isTwRegion ? getPeriodFromDateString(date) : '';

  // 환율 적용 헬퍼 함수
  const applyExchangeRate = (amount: number): number => {
    if (!isTwRegion) return amount;
    return convertTwdToHkd(amount, period) || 0;
  };

  // Store master 맵 생성
  const storeMap = new Map(targetStores.map((s) => [s.store_code, s]));

  // 데이터 가공
  const hk_normal: any[] = [];
  const hk_outlet: any[] = [];
  const hk_online: any[] = [];
  const mc_normal: any[] = [];
  const mc_outlet: any[] = [];
  const mc_online: any[] = [];
  const tw_normal: any[] = [];
  const tw_outlet: any[] = [];
  const tw_online: any[] = [];

  // SQL 결과를 Map으로 변환 (빠른 조회용)
  const rowMap = new Map(rows.map((row: any) => [row.SHOP_CD, row]));

  // 모든 targetStores를 순회하며 데이터 생성 (데이터 없으면 0으로)
  targetStores.forEach((storeInfo) => {
    const row = rowMap.get(storeInfo.store_code);

    // 데이터가 있으면 실제 값, 없으면 0
    const mtd_act = row ? applyExchangeRate(parseFloat(row.MTD_ACT || 0)) : 0;
    const mtd_act_py = row ? applyExchangeRate(parseFloat(row.MTD_ACT_PY || 0)) : 0;
    const mtd_act_pm = row ? applyExchangeRate(parseFloat(row.MTD_ACT_PM || 0)) : 0;
    const mtd_tag = row ? applyExchangeRate(parseFloat(row.MTD_TAG || 0)) : 0;
    const yoy = row ? parseFloat(row.YOY || 0) : 0;
    const mom = row ? parseFloat(row.MOM || 0) : 0;

    // YTD 데이터 (환율 적용)
    const ytd_act = row ? applyExchangeRate(parseFloat(row.YTD_ACT || 0)) : 0;
    const ytd_act_py = row ? applyExchangeRate(parseFloat(row.YTD_ACT_PY || 0)) : 0;
    const ytd_tag = row ? applyExchangeRate(parseFloat(row.YTD_TAG || 0)) : 0;
    const yoy_ytd = row ? parseFloat(row.YOY_YTD || 0) : 0;

    // 할인율 계산: 1 - (ACT / TAG)
    const discount_rate_mtd = mtd_tag > 0 ? (1 - mtd_act / mtd_tag) * 100 : 0;
    const discount_rate_ytd = ytd_tag > 0 ? (1 - ytd_act / ytd_tag) * 100 : 0;

    // MTD 목표값 가져오기 (환율 적용)
    const targetInfo = targetsByStore[storeInfo.store_code];
    const target_mth = targetInfo ? applyExchangeRate(targetInfo.target_mth) : 0;
    const progress = target_mth > 0 ? (mtd_act / target_mth) * 100 : 0;

    // YTD 목표 계산 (매장별, 환율 적용)
    const ytd_target_original = calculateYtdTargetForStore(
      storeInfo.store_code,
      year,
      month,
      asofDate.getDate(),
      targetData
    );
    const ytd_target = applyExchangeRate(ytd_target_original);
    const progress_ytd = ytd_target > 0 ? (ytd_act / ytd_target) * 100 : 0;

    // 월말환산 계산 (MTD 기준)
    const monthEndProjection = calculateMonthEndProjection(mtd_act, date, weightMap);

    // 환산 YoY 계산 (MTD 기준)
    const projectedYoY = calculateProjectedYoY(mtd_act, mtd_act_py, date, weightMap);

    const record = {
      shop_cd: storeInfo.store_code,
      shop_name: storeInfo.store_name || storeInfo.store_code,
      country: storeInfo.country,
      channel: storeInfo.channel,

      // MTD 데이터
      target_mth,
      mtd_act,
      progress,
      mtd_act_py,
      mtd_act_pm,
      yoy,
      mom,
      monthEndProjection,
      projectedYoY,
      discount_rate_mtd,

      // YTD 데이터
      ytd_target,
      ytd_act,
      progress_ytd,
      ytd_act_py,
      yoy_ytd,
      discount_rate_ytd,

      forecast: null,
    };

    if (storeInfo.country === 'HK') {
      if (storeInfo.channel === '정상') hk_normal.push(record);
      else if (storeInfo.channel === '아울렛') hk_outlet.push(record);
      else if (storeInfo.channel === '온라인') hk_online.push(record);
    } else if (storeInfo.country === 'MC') {
      if (storeInfo.channel === '정상') mc_normal.push(record);
      else if (storeInfo.channel === '아울렛') mc_outlet.push(record);
      else if (storeInfo.channel === '온라인') mc_online.push(record);
    } else if (storeInfo.country === 'TW') {
      if (storeInfo.channel === '정상') tw_normal.push(record);
      else if (storeInfo.channel === '아울렛') tw_outlet.push(record);
      else if (storeInfo.channel === '온라인') tw_online.push(record);
    }
  });

  // 정렬 함수: 당월실적 0인 매장을 맨 아래로
  const sortByClosedStatus = (a: any, b: any) => {
    if (a.mtd_act === 0 && b.mtd_act !== 0) return 1;
    if (a.mtd_act !== 0 && b.mtd_act === 0) return -1;
    return a.shop_cd.localeCompare(b.shop_cd);
  };

  // 각 채널별로 정렬
  hk_normal.sort(sortByClosedStatus);
  hk_outlet.sort(sortByClosedStatus);
  hk_online.sort(sortByClosedStatus);
  mc_normal.sort(sortByClosedStatus);
  mc_outlet.sort(sortByClosedStatus);
  mc_online.sort(sortByClosedStatus);
  tw_normal.sort(sortByClosedStatus);
  tw_outlet.sort(sortByClosedStatus);
  tw_online.sort(sortByClosedStatus);

  // 채널별 합계 계산 함수
  const calculateSubtotal = (stores: any[], name: string, country: string, channel: string) => {
    if (stores.length === 0) return null;

    // MTD 합계
    const target_mth = stores.reduce((sum, s) => sum + s.target_mth, 0);
    const mtd_act = stores.reduce((sum, s) => sum + s.mtd_act, 0);
    const mtd_act_py = stores.reduce((sum, s) => sum + s.mtd_act_py, 0);
    const mtd_act_pm = stores.reduce((sum, s) => sum + s.mtd_act_pm, 0);
    const progress = target_mth > 0 ? (mtd_act / target_mth) * 100 : 0;
    const yoy = mtd_act_py > 0 ? (mtd_act / mtd_act_py) * 100 : 0;
    const mom = mtd_act_pm > 0 ? (mtd_act / mtd_act_pm) * 100 : 0;

    // YTD 합계
    const ytd_target = stores.reduce((sum, s) => sum + s.ytd_target, 0);
    const ytd_act = stores.reduce((sum, s) => sum + s.ytd_act, 0);
    const ytd_act_py = stores.reduce((sum, s) => sum + s.ytd_act_py, 0);
    const progress_ytd = ytd_target > 0 ? (ytd_act / ytd_target) * 100 : 0;
    const yoy_ytd = ytd_act_py > 0 ? (ytd_act / ytd_act_py) * 100 : 0;

    // 합계의 월말환산 계산
    const monthEndProjection = calculateMonthEndProjection(mtd_act, date, weightMap);

    // 합계의 환산 YoY 계산
    const projectedYoY = calculateProjectedYoY(mtd_act, mtd_act_py, date, weightMap);

    return {
      shop_cd: `${country}_${channel}_TOTAL`,
      shop_name: name,
      country,
      channel: '합계',

      // MTD
      target_mth,
      mtd_act,
      progress,
      mtd_act_py,
      mtd_act_pm,
      yoy,
      mom,
      monthEndProjection,
      projectedYoY,

      // YTD
      ytd_target,
      ytd_act,
      progress_ytd,
      ytd_act_py,
      yoy_ytd,

      forecast: null,
    };
  };

  // HK 채널별 합계
  const hk_normal_subtotal = calculateSubtotal(hk_normal, 'HK 정상 합계', 'HK', '정상');
  const hk_outlet_subtotal = calculateSubtotal(hk_outlet, 'HK 아울렛 합계', 'HK', '아울렛');
  const hk_online_subtotal = calculateSubtotal(hk_online, 'HK 온라인 합계', 'HK', '온라인');

  // HK 전체 합계
  const hk_all_stores = [...hk_normal, ...hk_outlet, ...hk_online];
  const hk_subtotal = calculateSubtotal(hk_all_stores, 'HK 전체', 'HK', '전체');

  // MC 채널별 합계
  const mc_normal_subtotal = calculateSubtotal(mc_normal, 'MC 정상 합계', 'MC', '정상');
  const mc_outlet_subtotal = calculateSubtotal(mc_outlet, 'MC 아울렛 합계', 'MC', '아울렛');
  const mc_online_subtotal = calculateSubtotal(mc_online, 'MC 온라인 합계', 'MC', '온라인');

  // MC 전체 합계
  const mc_all_stores = [...mc_normal, ...mc_outlet, ...mc_online];
  const mc_subtotal = calculateSubtotal(mc_all_stores, 'MC 전체', 'MC', '전체');

  // TW 채널별 합계
  const tw_normal_subtotal = calculateSubtotal(tw_normal, 'TW 정상 합계', 'TW', '정상');
  const tw_outlet_subtotal = calculateSubtotal(tw_outlet, 'TW 아울렛 합계', 'TW', '아울렛');
  const tw_online_subtotal = calculateSubtotal(tw_online, 'TW 온라인 합계', 'TW', '온라인');

  // TW 전체 합계
  const tw_all_stores = [...tw_normal, ...tw_outlet, ...tw_online];
  const tw_subtotal = calculateSubtotal(tw_all_stores, 'TW 전체', 'TW', '전체');

  // 전체 합계 (리전별 분기)
  let all_stores, total_subtotal;
  if (region === 'TW') {
    all_stores = tw_all_stores;
    total_subtotal = calculateSubtotal(all_stores, 'TW 전체', 'TW', '전체');
  } else {
    // HKMC 전체 합계
    all_stores = [
      ...hk_normal,
      ...hk_outlet,
      ...hk_online,
      ...mc_normal,
      ...mc_outlet,
      ...mc_online,
    ];
    total_subtotal = calculateSubtotal(all_stores, 'HKMC 전체', 'HKMC', '전체');
  }

  return {
    asof_date: date,
    region,
    brand,
    hk_normal,
    hk_normal_subtotal,
    hk_outlet,
    hk_outlet_subtotal,
    hk_online,
    hk_online_subtotal,
    hk_subtotal,
    mc_normal,
    mc_normal_subtotal,
    mc_outlet,
    mc_outlet_subtotal,
    mc_online,
    mc_online_subtotal,
    mc_subtotal,
    tw_normal,
    tw_normal_subtotal,
    tw_outlet,
    tw_outlet_subtotal,
    tw_online,
    tw_online_subtotal,
    tw_subtotal,
    total_subtotal,
  };
}
