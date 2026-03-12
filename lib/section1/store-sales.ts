import { executeSnowflakeQuery } from '@/lib/snowflake';
import { getStoreMaster, normalizeBrand } from '@/lib/store-utils';
import { buildProjectionWeightData, calculateMonthEndProjection, calculateProjectedYoY } from '@/lib/weight-utils';
import { getPeriodFromDateString, convertTwdToHkd } from '@/lib/exchange-rate-utils';
import { getSeasonCode } from '@/lib/date-utils';
import { getCategoryMapping } from '@/lib/category-utils';
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

type SeasonPart = 'S' | 'F';

function parseSeasonCode(sesn: string): { yy: number; part: SeasonPart } | null {
  const m = (sesn || '').match(/^(\d{2})([SF])$/);
  if (!m) return null;
  return { yy: Number(m[1]), part: m[2] as SeasonPart };
}

function seasonIndex(sesn: string): number | null {
  const parsed = parseSeasonCode(sesn);
  if (!parsed) return null;
  return parsed.yy * 2 + (parsed.part === 'S' ? 0 : 1);
}

function getNextSeasonCode(currentSesn: string): string {
  const parsed = parseSeasonCode(currentSesn);
  if (!parsed) return '';
  const nextYear = parsed.part === 'F' ? parsed.yy + 1 : parsed.yy;
  const nextPart: SeasonPart = parsed.part === 'F' ? 'S' : 'F';
  return `${String(nextYear).padStart(2, '0')}${nextPart}`;
}

function getPastSeasonCutoff(currentSesn: string): string {
  const parsed = parseSeasonCode(currentSesn);
  if (!parsed) return '';
  return `${String(parsed.yy - 1).padStart(2, '0')}${parsed.part}`;
}

function getPrevYearSeasonCode(sesn: string): string {
  const parsed = parseSeasonCode(sesn);
  if (!parsed) return '';
  return `${String(parsed.yy - 1).padStart(2, '0')}${parsed.part}`;
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
  season_category_sales: any;
  projection_meta?: {
    trainingYears: number[];
    methodSummary: string;
    explanation: string;
  };
}

function formatDateToYmd(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function getMonthEndDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
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
      season_category_sales: null,
    };
  }

  const storeCodes = targetStores.map((s) => `'${s.store_code}'`).join(',');

  // 날짜 계산
  const asofDate = new Date(date);
  const year = asofDate.getFullYear();
  const previousYearDate = new Date(asofDate);
  previousYearDate.setFullYear(asofDate.getFullYear() - 1);
  const previousYearDateString = formatDateToYmd(previousYearDate);
  const month = asofDate.getMonth() + 1;
  const currentSesn = getSeasonCode(asofDate);
  const nextSesn = getNextSeasonCode(currentSesn);
  const pastCutoffSesn = getPastSeasonCutoff(currentSesn);

  // 목표값 데이터 로드 (period 기준)
  const periodKey = `${year}-${String(month).padStart(2, '0')}`;
  const targetsByStore = (targetData as any)[periodKey] || {};

  console.log(
    `📊 Target period: ${periodKey}, stores with targets: ${
      Object.keys(targetsByStore).length
    }`
  );

  const projectionWeights = await buildProjectionWeightData({
    region,
    brand,
    date,
    storeCodes: targetStores.map((store) => store.store_code),
  });
  const weightMap = projectionWeights.weightMap;

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
        
        SUM(
          CASE
            WHEN SALE_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('MONTH', TO_DATE(?))) AND DATEADD(YEAR, -1, TO_DATE(?))
            THEN TAG_SALE_AMT ELSE 0
          END
        ) AS mtd_tag_py,
        
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
        ) AS ytd_tag,
        
        SUM(
          CASE
            WHEN SALE_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('YEAR', TO_DATE(?))) AND DATEADD(YEAR, -1, TO_DATE(?))
            THEN TAG_SALE_AMT ELSE 0
          END
        ) AS ytd_tag_py
        
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
      mtd_tag_py,
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
      ytd_tag_py,
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
    date, // MTD TAG PY
    date,
    date, // YTD ACT current
    date,
    date, // YTD ACT PY
    date,
    date, // YTD TAG current
    date,
    date, // YTD TAG PY
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

  const monthlyStoreSalesQuery = `
    SELECT
      LOCAL_SHOP_CD AS shop_cd,
      YEAR(SALE_DT) AS sale_year,
      MONTH(SALE_DT) AS sale_month,
      SUM(ACT_SALE_AMT) AS sales_amt
    FROM SAP_FNF.DW_HMD_SALE_D
    WHERE
      (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
      AND LOCAL_SHOP_CD IN (${storeCodes})
      AND (
        SALE_DT BETWEEN DATE_TRUNC('YEAR', TO_DATE(?)) AND TO_DATE(?)
        OR SALE_DT BETWEEN DATE_TRUNC('YEAR', TO_DATE(?)) AND TO_DATE(?)
      )
    GROUP BY LOCAL_SHOP_CD, YEAR(SALE_DT), MONTH(SALE_DT)
    ORDER BY LOCAL_SHOP_CD, sale_year, sale_month
  `;

  const monthlyStoreSalesRows = await executeSnowflakeQuery(monthlyStoreSalesQuery, [
    brand,
    date,
    date,
    previousYearDateString,
    previousYearDateString,
  ]);

  const dailyStoreSalesRows = await executeSnowflakeQuery(
    `
      SELECT
        LOCAL_SHOP_CD AS shop_cd,
        TO_DATE(SALE_DT) AS sale_dt,
        SUM(ACT_SALE_AMT) AS sales_amt
      FROM SAP_FNF.DW_HMD_SALE_D
      WHERE
        (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
        AND LOCAL_SHOP_CD IN (${storeCodes})
        AND SALE_DT BETWEEN DATE_TRUNC('MONTH', TO_DATE(?)) AND TO_DATE(?)
      GROUP BY LOCAL_SHOP_CD, TO_DATE(SALE_DT)
    `,
    [brand, date, date]
  );

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
  const monthlySalesMap = new Map<string, number>();
  const positiveSalesDayCountMap = new Map<string, number>();
  const zeroSalesDayMap = new Map<string, number>();

  monthlyStoreSalesRows.forEach((row: any) => {
    const shopCd = String(row.SHOP_CD || '');
    const saleYear = Number(row.SALE_YEAR || 0);
    const saleMonth = Number(row.SALE_MONTH || 0);
    if (!shopCd || !saleYear || !saleMonth) return;

    const rawSales = parseFloat(row.SALES_AMT || 0);
    const key = `${shopCd}:${saleYear}:${saleMonth}`;
    monthlySalesMap.set(key, rawSales);
  });

  dailyStoreSalesRows.forEach((row: any) => {
    const shopCd = String(row.SHOP_CD || '');
    if (!shopCd) return;
    const salesAmt = parseFloat(row.SALES_AMT || 0);
    if (salesAmt <= 0) return;
    positiveSalesDayCountMap.set(shopCd, (positiveSalesDayCountMap.get(shopCd) || 0) + 1);
  });

  const elapsedDaysInMonth = asofDate.getDate();
  targetStores.forEach((storeInfo) => {
    const positiveDays = positiveSalesDayCountMap.get(storeInfo.store_code) || 0;
    zeroSalesDayMap.set(storeInfo.store_code, Math.max(0, elapsedDaysInMonth - positiveDays));
  });

  const getMonthlySales = (shopCd: string, targetYear: number, targetMonth: number): number => {
    const rawAmount = monthlySalesMap.get(`${shopCd}:${targetYear}:${targetMonth}`) || 0;
    return applyExchangeRate(rawAmount);
  };

  // 모든 targetStores를 순회하며 데이터 생성 (데이터 없으면 0으로)
  targetStores.forEach((storeInfo) => {
    const row = rowMap.get(storeInfo.store_code);

    // 데이터가 있으면 실제 값, 없으면 0
    const mtd_act = row ? applyExchangeRate(parseFloat(row.MTD_ACT || 0)) : 0;
    const mtd_act_py = row ? applyExchangeRate(parseFloat(row.MTD_ACT_PY || 0)) : 0;
    const mtd_act_pm = row ? applyExchangeRate(parseFloat(row.MTD_ACT_PM || 0)) : 0;
    const mtd_tag = row ? applyExchangeRate(parseFloat(row.MTD_TAG || 0)) : 0;
    const mtd_tag_py = row ? applyExchangeRate(parseFloat(row.MTD_TAG_PY || 0)) : 0;
    const yoy = row ? parseFloat(row.YOY || 0) : 0;
    const mom = row ? parseFloat(row.MOM || 0) : 0;

    // YTD 데이터 (환율 적용)
    const ytd_act = row ? applyExchangeRate(parseFloat(row.YTD_ACT || 0)) : 0;
    const ytd_act_py = row ? applyExchangeRate(parseFloat(row.YTD_ACT_PY || 0)) : 0;
    const ytd_tag = row ? applyExchangeRate(parseFloat(row.YTD_TAG || 0)) : 0;
    const ytd_tag_py = row ? applyExchangeRate(parseFloat(row.YTD_TAG_PY || 0)) : 0;
    const yoy_ytd = row ? parseFloat(row.YOY_YTD || 0) : 0;

    // 할인율 계산: 1 - (ACT / TAG)
    const discount_rate_mtd = mtd_tag > 0 ? (1 - mtd_act / mtd_tag) * 100 : 0;
    const discount_rate_ytd = ytd_tag > 0 ? (1 - ytd_act / ytd_tag) * 100 : 0;
    const discount_rate_mtd_ly = mtd_tag_py > 0 ? (1 - mtd_act_py / mtd_tag_py) * 100 : null;
    const discount_rate_ytd_ly = ytd_tag_py > 0 ? (1 - ytd_act_py / ytd_tag_py) * 100 : null;
    const discount_rate_mtd_diff =
      discount_rate_mtd_ly === null ? null : discount_rate_mtd - discount_rate_mtd_ly;
    const discount_rate_ytd_diff =
      discount_rate_ytd_ly === null ? null : discount_rate_ytd - discount_rate_ytd_ly;

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
    const projected_progress = target_mth > 0 ? (monthEndProjection / target_mth) * 100 : 0;

    // 환산 YoY 계산 (MTD 기준)
    const projectedYoY = calculateProjectedYoY(mtd_act, mtd_act_py, date, weightMap);
    const previousMonthActualYtd = ytd_act - mtd_act;
    const previousMonthActualYtdPy = ytd_act_py - mtd_act_py;
    const currentMonthFullPy = getMonthlySales(storeInfo.store_code, year - 1, month);
    const ytdMonthEndProjection = previousMonthActualYtd + monthEndProjection;
    const ytdProjectedBasePy = previousMonthActualYtdPy + currentMonthFullPy;
    const projected_progress_ytd = ytd_target > 0 ? (ytdMonthEndProjection / ytd_target) * 100 : 0;
    const ytdProjectedYoY = ytdProjectedBasePy > 0 ? (ytdMonthEndProjection / ytdProjectedBasePy) * 100 : 0;

    const resolvedShopName = storeInfo.store_code === 'MC4' ? 'Senado Outlet' : (storeInfo.store_name || storeInfo.store_code);

    const record = {
      shop_cd: storeInfo.store_code,
      shop_name: resolvedShopName,
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
      projected_progress,
      projectedYoY,
      discount_rate_mtd,
      discount_rate_mtd_ly,
      discount_rate_mtd_diff,
      mtd_tag,
      mtd_tag_py,
      mtd_zero_sales_days: zeroSalesDayMap.get(storeInfo.store_code) || 0,

      // YTD 데이터
      ytd_target,
      ytd_act,
      progress_ytd,
      ytd_act_py,
      yoy_ytd,
      ytdMonthEndProjection,
      projected_progress_ytd,
      ytdProjectedYoY,
      discount_rate_ytd,
      discount_rate_ytd_ly,
      discount_rate_ytd_diff,
      ytd_tag,
      ytd_tag_py,

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

  const calculateStoreComparisonMetrics = (stores: any[]) => {
    if (stores.length === 0) {
      return {
        same_store_yoy: null,
        same_store_yoy_ytd: null,
        active_store_count_mtd: 0,
        active_store_count_mtd_py: 0,
        same_store_count_mtd: 0,
        active_store_count_ytd_avg: 0,
        active_store_count_ytd_avg_py: 0,
        same_store_count_ytd_avg: 0,
      };
    }

    const isOfflineStore = (store: any) => store?.channel !== '온라인';
    const isExcludedByZeroSalesRule = (store: any) =>
      isOfflineStore(store) &&
      typeof store.mtd_zero_sales_days === 'number' &&
      store.mtd_zero_sales_days >= 5;

    const isEligibleSameStoreMtd = (store: any) =>
      store.mtd_act > 0 &&
      store.mtd_act_py > 0 &&
      !isExcludedByZeroSalesRule(store);

    const sameStoreMtdCurrentSales = stores.reduce((sum, store) => {
      return isEligibleSameStoreMtd(store) ? sum + store.mtd_act : sum;
    }, 0);
    const sameStoreMtdPrevSales = stores.reduce((sum, store) => {
      return isEligibleSameStoreMtd(store) ? sum + store.mtd_act_py : sum;
    }, 0);

    let currentStoreCountSum = 0;
    let previousStoreCountSum = 0;
    let sameStoreCountSum = 0;
    let sameStoreYtdCurrentSales = 0;
    let sameStoreYtdPrevSales = 0;

    for (let monthIndex = 1; monthIndex <= month; monthIndex += 1) {
      let activeCurrentCount = 0;
      let activePreviousCount = 0;
      let sameStoreCount = 0;

      stores.forEach((store) => {
        const currentMonthSales = getMonthlySales(store.shop_cd, year, monthIndex);
        const previousMonthSales = getMonthlySales(store.shop_cd, year - 1, monthIndex);
        const isCurrentAsOfMonth = monthIndex === month;
        const isCurrentMonthEligible = !isCurrentAsOfMonth || !isExcludedByZeroSalesRule(store);
        const hasCurrentSales = currentMonthSales > 0 && isCurrentMonthEligible;
        const hasPreviousSales = previousMonthSales > 0;

        if (hasCurrentSales) activeCurrentCount += 1;
        if (hasPreviousSales) activePreviousCount += 1;

        if (hasCurrentSales && hasPreviousSales) {
          sameStoreCount += 1;
          sameStoreYtdCurrentSales += currentMonthSales;
          sameStoreYtdPrevSales += previousMonthSales;
        }
      });

      currentStoreCountSum += activeCurrentCount;
      previousStoreCountSum += activePreviousCount;
      sameStoreCountSum += sameStoreCount;
    }

    return {
      same_store_yoy: sameStoreMtdPrevSales > 0 ? (sameStoreMtdCurrentSales / sameStoreMtdPrevSales) * 100 : null,
      same_store_yoy_ytd: sameStoreYtdPrevSales > 0 ? (sameStoreYtdCurrentSales / sameStoreYtdPrevSales) * 100 : null,
      active_store_count_mtd: stores.filter((store) => store.mtd_act > 0 && !isExcludedByZeroSalesRule(store)).length,
      active_store_count_mtd_py: stores.filter((store) => store.mtd_act_py > 0).length,
      same_store_count_mtd: stores.filter((store) => isEligibleSameStoreMtd(store)).length,
      active_store_count_ytd_avg: month > 0 ? currentStoreCountSum / month : 0,
      active_store_count_ytd_avg_py: month > 0 ? previousStoreCountSum / month : 0,
      same_store_count_ytd_avg: month > 0 ? sameStoreCountSum / month : 0,
    };
  };

  // 채널별 합계 계산 함수
  const calculateSubtotal = (stores: any[], name: string, country: string, channel: string) => {
    if (stores.length === 0) return null;

    // MTD 합계
    const target_mth = stores.reduce((sum, s) => sum + s.target_mth, 0);
    const mtd_act = stores.reduce((sum, s) => sum + s.mtd_act, 0);
    const mtd_act_py = stores.reduce((sum, s) => sum + s.mtd_act_py, 0);
    const mtd_act_pm = stores.reduce((sum, s) => sum + s.mtd_act_pm, 0);
    const mtd_tag = stores.reduce((sum, s) => sum + (s.mtd_tag || 0), 0);
    const mtd_tag_py = stores.reduce((sum, s) => sum + (s.mtd_tag_py || 0), 0);
    const progress = target_mth > 0 ? (mtd_act / target_mth) * 100 : 0;
    const yoy = mtd_act_py > 0 ? (mtd_act / mtd_act_py) * 100 : 0;
    const mom = mtd_act_pm > 0 ? (mtd_act / mtd_act_pm) * 100 : 0;
    const discount_rate_mtd = mtd_tag > 0 ? (1 - mtd_act / mtd_tag) * 100 : 0;
    const discount_rate_mtd_ly = mtd_tag_py > 0 ? (1 - mtd_act_py / mtd_tag_py) * 100 : null;
    const discount_rate_mtd_diff =
      discount_rate_mtd_ly === null ? null : discount_rate_mtd - discount_rate_mtd_ly;

    // YTD 합계
    const ytd_target = stores.reduce((sum, s) => sum + s.ytd_target, 0);
    const ytd_act = stores.reduce((sum, s) => sum + s.ytd_act, 0);
    const ytd_act_py = stores.reduce((sum, s) => sum + s.ytd_act_py, 0);
    const ytd_tag = stores.reduce((sum, s) => sum + (s.ytd_tag || 0), 0);
    const ytd_tag_py = stores.reduce((sum, s) => sum + (s.ytd_tag_py || 0), 0);
    const progress_ytd = ytd_target > 0 ? (ytd_act / ytd_target) * 100 : 0;
    const yoy_ytd = ytd_act_py > 0 ? (ytd_act / ytd_act_py) * 100 : 0;
    const discount_rate_ytd = ytd_tag > 0 ? (1 - ytd_act / ytd_tag) * 100 : 0;
    const discount_rate_ytd_ly = ytd_tag_py > 0 ? (1 - ytd_act_py / ytd_tag_py) * 100 : null;
    const discount_rate_ytd_diff =
      discount_rate_ytd_ly === null ? null : discount_rate_ytd - discount_rate_ytd_ly;

    // 합계의 월말환산 계산
    const monthEndProjection = calculateMonthEndProjection(mtd_act, date, weightMap);
    const projected_progress = target_mth > 0 ? (monthEndProjection / target_mth) * 100 : 0;

    // 합계의 환산 YoY 계산
    const projectedYoY = calculateProjectedYoY(mtd_act, mtd_act_py, date, weightMap);
    const ytdMonthEndProjection = ytd_act - mtd_act + monthEndProjection;
    const monthEndDate = getMonthEndDate(asofDate);
    const previousYearMonthEndDate = new Date(monthEndDate);
    previousYearMonthEndDate.setFullYear(monthEndDate.getFullYear() - 1);
    const previousYearMonthEndString = formatDateToYmd(previousYearMonthEndDate);
    const fullMonthProgressivePy = calculateMonthEndProjection(mtd_act_py, previousYearMonthEndString, weightMap);
    const ytdProjectedBasePy = ytd_act_py - mtd_act_py + fullMonthProgressivePy;
    const projected_progress_ytd = ytd_target > 0 ? (ytdMonthEndProjection / ytd_target) * 100 : 0;
    const ytdProjectedYoY = ytdProjectedBasePy > 0 ? (ytdMonthEndProjection / ytdProjectedBasePy) * 100 : 0;
    const comparisonMetrics = calculateStoreComparisonMetrics(stores);

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
      projected_progress,
      projectedYoY,
      same_store_yoy: comparisonMetrics.same_store_yoy,
      active_store_count_mtd: comparisonMetrics.active_store_count_mtd,
      active_store_count_mtd_py: comparisonMetrics.active_store_count_mtd_py,
      same_store_count_mtd: comparisonMetrics.same_store_count_mtd,
      discount_rate_mtd,
      discount_rate_mtd_ly,
      discount_rate_mtd_diff,

      // YTD
      ytd_target,
      ytd_act,
      progress_ytd,
      ytd_act_py,
      yoy_ytd,
      ytdMonthEndProjection,
      projected_progress_ytd,
      ytdProjectedYoY,
      same_store_yoy_ytd: comparisonMetrics.same_store_yoy_ytd,
      active_store_count_ytd_avg: comparisonMetrics.active_store_count_ytd_avg,
      active_store_count_ytd_avg_py: comparisonMetrics.active_store_count_ytd_avg_py,
      same_store_count_ytd_avg: comparisonMetrics.same_store_count_ytd_avg,
      same_store_filter_rule: 'exclude_offline_mtd_zero_sales_days_ge_5',
      discount_rate_ytd,
      discount_rate_ytd_ly,
      discount_rate_ytd_diff,

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

  const seasonCategoryQuery = `
    SELECT
      SESN AS sesn,
      SUBSTR(PART_CD, 3, 2) AS category_small,
      SUM(
        CASE
          WHEN SALE_DT BETWEEN DATE_TRUNC('MONTH', TO_DATE(?)) AND TO_DATE(?)
          THEN ACT_SALE_AMT ELSE 0
        END
      ) AS mtd_act_ty,
      SUM(
        CASE
          WHEN SALE_DT BETWEEN DATE_TRUNC('MONTH', TO_DATE(?)) AND TO_DATE(?)
          THEN TAG_SALE_AMT ELSE 0
        END
      ) AS mtd_tag_ty,
      SUM(
        CASE
          WHEN SALE_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('MONTH', TO_DATE(?))) AND DATEADD(YEAR, -1, TO_DATE(?))
          THEN ACT_SALE_AMT ELSE 0
        END
      ) AS mtd_act_ly,
      SUM(
        CASE
          WHEN SALE_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('MONTH', TO_DATE(?))) AND DATEADD(YEAR, -1, TO_DATE(?))
          THEN TAG_SALE_AMT ELSE 0
        END
      ) AS mtd_tag_ly,
      SUM(
        CASE
          WHEN SALE_DT BETWEEN DATE_TRUNC('YEAR', TO_DATE(?)) AND TO_DATE(?)
          THEN ACT_SALE_AMT ELSE 0
        END
      ) AS ytd_act_ty,
      SUM(
        CASE
          WHEN SALE_DT BETWEEN DATE_TRUNC('YEAR', TO_DATE(?)) AND TO_DATE(?)
          THEN TAG_SALE_AMT ELSE 0
        END
      ) AS ytd_tag_ty,
      SUM(
        CASE
          WHEN SALE_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('YEAR', TO_DATE(?))) AND DATEADD(YEAR, -1, TO_DATE(?))
          THEN ACT_SALE_AMT ELSE 0
        END
      ) AS ytd_act_ly,
      SUM(
        CASE
          WHEN SALE_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('YEAR', TO_DATE(?))) AND DATEADD(YEAR, -1, TO_DATE(?))
          THEN TAG_SALE_AMT ELSE 0
        END
      ) AS ytd_tag_ly
    FROM SAP_FNF.DW_HMD_SALE_D
    WHERE
      (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
      AND LOCAL_SHOP_CD IN (${storeCodes})
      AND SALE_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('YEAR', TO_DATE(?))) AND TO_DATE(?)
      AND SESN IS NOT NULL
    GROUP BY SESN, category_small
  `;

  const seasonCategoryRows = await executeSnowflakeQuery(seasonCategoryQuery, [
    date,
    date,
    date,
    date,
    date,
    date,
    date,
    date,
    date,
    date,
    date,
    date,
    date,
    date,
    date,
    date,
    brand,
    date,
    date,
  ]);

  type SeasonCategoryAccumulator = {
    mtd_ty: number;
    mtd_ly: number;
    ytd_ty: number;
    ytd_ly: number;
    mtd_tag_ty: number;
    mtd_tag_ly: number;
    ytd_tag_ty: number;
    ytd_tag_ly: number;
  };

  const createSeasonCategoryAccumulator = (): SeasonCategoryAccumulator => ({
    mtd_ty: 0,
    mtd_ly: 0,
    ytd_ty: 0,
    ytd_ly: 0,
    mtd_tag_ty: 0,
    mtd_tag_ly: 0,
    ytd_tag_ty: 0,
    ytd_tag_ly: 0,
  });

  const seasonCategoryAcc = {
    current: createSeasonCategoryAccumulator(),
    next: createSeasonCategoryAccumulator(),
    past: createSeasonCategoryAccumulator(),
    hat: createSeasonCategoryAccumulator(),
    shoes: createSeasonCategoryAccumulator(),
    bag: createSeasonCategoryAccumulator(),
  };

  const pastCutoffIndex = seasonIndex(pastCutoffSesn);
  const currentIndex = seasonIndex(currentSesn);
  const nextIndex = seasonIndex(nextSesn);
  const prevCurrentSesn = getPrevYearSeasonCode(currentSesn);
  const prevNextSesn = getPrevYearSeasonCode(nextSesn);
  const prevPastCutoffSesn = getPrevYearSeasonCode(pastCutoffSesn);
  const prevPastCutoffIndex = seasonIndex(prevPastCutoffSesn);
  const seasonRollup = new Map<string, SeasonCategoryAccumulator>();

  seasonCategoryRows.forEach((row: any) => {
    const sesn = (row.SESN || '').trim();
    const sesnIdx = seasonIndex(sesn);
    const smallCode = (row.CATEGORY_SMALL || '').trim();
    const mapping = getCategoryMapping(smallCode);
    const isHat = mapping.middle === 'Headwear';
    const isShoes = mapping.middle === 'Shoes';
    const isBag = mapping.middle === 'BAG';
    const isApparel = ['OUTER', 'INNER', 'BOTTOM', 'Wear_etc'].includes(mapping.middle);

    const mtdTy = applyExchangeRate(parseFloat(row.MTD_ACT_TY || 0));
    const mtdLy = applyExchangeRate(parseFloat(row.MTD_ACT_LY || 0));
    const mtdTagTy = applyExchangeRate(parseFloat(row.MTD_TAG_TY || 0));
    const mtdTagLy = applyExchangeRate(parseFloat(row.MTD_TAG_LY || 0));
    const ytdTy = applyExchangeRate(parseFloat(row.YTD_ACT_TY || 0));
    const ytdLy = applyExchangeRate(parseFloat(row.YTD_ACT_LY || 0));
    const ytdTagTy = applyExchangeRate(parseFloat(row.YTD_TAG_TY || 0));
    const ytdTagLy = applyExchangeRate(parseFloat(row.YTD_TAG_LY || 0));

    if (isApparel) {
      const seasonAgg = seasonRollup.get(sesn) || createSeasonCategoryAccumulator();
      seasonAgg.mtd_ty += mtdTy;
      seasonAgg.mtd_ly += mtdLy;
      seasonAgg.ytd_ty += ytdTy;
      seasonAgg.ytd_ly += ytdLy;
      seasonAgg.mtd_tag_ty += mtdTagTy;
      seasonAgg.mtd_tag_ly += mtdTagLy;
      seasonAgg.ytd_tag_ty += ytdTagTy;
      seasonAgg.ytd_tag_ly += ytdTagLy;
      seasonRollup.set(sesn, seasonAgg);

      if (sesnIdx !== null) {
        if (pastCutoffIndex !== null && sesnIdx <= pastCutoffIndex) {
          seasonCategoryAcc.past.mtd_ty += mtdTy;
          seasonCategoryAcc.past.ytd_ty += ytdTy;
          seasonCategoryAcc.past.mtd_tag_ty += mtdTagTy;
          seasonCategoryAcc.past.ytd_tag_ty += ytdTagTy;
        }
        if (prevPastCutoffIndex !== null && sesnIdx <= prevPastCutoffIndex) {
          seasonCategoryAcc.past.mtd_ly += mtdLy;
          seasonCategoryAcc.past.ytd_ly += ytdLy;
          seasonCategoryAcc.past.mtd_tag_ly += mtdTagLy;
          seasonCategoryAcc.past.ytd_tag_ly += ytdTagLy;
        }
      }
    }

    if (isHat) {
      seasonCategoryAcc.hat.mtd_ty += mtdTy;
      seasonCategoryAcc.hat.mtd_ly += mtdLy;
      seasonCategoryAcc.hat.ytd_ty += ytdTy;
      seasonCategoryAcc.hat.ytd_ly += ytdLy;
      seasonCategoryAcc.hat.mtd_tag_ty += mtdTagTy;
      seasonCategoryAcc.hat.mtd_tag_ly += mtdTagLy;
      seasonCategoryAcc.hat.ytd_tag_ty += ytdTagTy;
      seasonCategoryAcc.hat.ytd_tag_ly += ytdTagLy;
    } else if (isShoes) {
      seasonCategoryAcc.shoes.mtd_ty += mtdTy;
      seasonCategoryAcc.shoes.mtd_ly += mtdLy;
      seasonCategoryAcc.shoes.ytd_ty += ytdTy;
      seasonCategoryAcc.shoes.ytd_ly += ytdLy;
      seasonCategoryAcc.shoes.mtd_tag_ty += mtdTagTy;
      seasonCategoryAcc.shoes.mtd_tag_ly += mtdTagLy;
      seasonCategoryAcc.shoes.ytd_tag_ty += ytdTagTy;
      seasonCategoryAcc.shoes.ytd_tag_ly += ytdTagLy;
    } else if (isBag) {
      seasonCategoryAcc.bag.mtd_ty += mtdTy;
      seasonCategoryAcc.bag.mtd_ly += mtdLy;
      seasonCategoryAcc.bag.ytd_ty += ytdTy;
      seasonCategoryAcc.bag.ytd_ly += ytdLy;
      seasonCategoryAcc.bag.mtd_tag_ty += mtdTagTy;
      seasonCategoryAcc.bag.mtd_tag_ly += mtdTagLy;
      seasonCategoryAcc.bag.ytd_tag_ty += ytdTagTy;
      seasonCategoryAcc.bag.ytd_tag_ly += ytdTagLy;
    }
  });

  const currentTy = seasonRollup.get(currentSesn);
  const currentLy = seasonRollup.get(prevCurrentSesn);
  const nextTy = seasonRollup.get(nextSesn);
  const nextLy = seasonRollup.get(prevNextSesn);

  seasonCategoryAcc.current.mtd_ty = currentTy?.mtd_ty || 0;
  seasonCategoryAcc.current.ytd_ty = currentTy?.ytd_ty || 0;
  seasonCategoryAcc.current.mtd_ly = currentLy?.mtd_ly || 0;
  seasonCategoryAcc.current.ytd_ly = currentLy?.ytd_ly || 0;
  seasonCategoryAcc.current.mtd_tag_ty = currentTy?.mtd_tag_ty || 0;
  seasonCategoryAcc.current.ytd_tag_ty = currentTy?.ytd_tag_ty || 0;
  seasonCategoryAcc.current.mtd_tag_ly = currentLy?.mtd_tag_ly || 0;
  seasonCategoryAcc.current.ytd_tag_ly = currentLy?.ytd_tag_ly || 0;

  seasonCategoryAcc.next.mtd_ty = nextTy?.mtd_ty || 0;
  seasonCategoryAcc.next.ytd_ty = nextTy?.ytd_ty || 0;
  seasonCategoryAcc.next.mtd_ly = nextLy?.mtd_ly || 0;
  seasonCategoryAcc.next.ytd_ly = nextLy?.ytd_ly || 0;
  seasonCategoryAcc.next.mtd_tag_ty = nextTy?.mtd_tag_ty || 0;
  seasonCategoryAcc.next.ytd_tag_ty = nextTy?.ytd_tag_ty || 0;
  seasonCategoryAcc.next.mtd_tag_ly = nextLy?.mtd_tag_ly || 0;
  seasonCategoryAcc.next.ytd_tag_ly = nextLy?.ytd_tag_ly || 0;

  const toMetric = (label: string, m: SeasonCategoryAccumulator) => {
    const mtdDiscountRate = m.mtd_tag_ty > 0 ? (1 - m.mtd_ty / m.mtd_tag_ty) * 100 : null;
    const mtdDiscountRateLy = m.mtd_tag_ly > 0 ? (1 - m.mtd_ly / m.mtd_tag_ly) * 100 : null;
    const ytdDiscountRate = m.ytd_tag_ty > 0 ? (1 - m.ytd_ty / m.ytd_tag_ty) * 100 : null;
    const ytdDiscountRateLy = m.ytd_tag_ly > 0 ? (1 - m.ytd_ly / m.ytd_tag_ly) * 100 : null;

    return {
      label,
      mtd_act: m.mtd_ty,
      mtd_yoy: m.mtd_ly > 0 ? (m.mtd_ty / m.mtd_ly) * 100 : null,
      mtd_discount_rate: mtdDiscountRate,
      mtd_discount_rate_ly: mtdDiscountRateLy,
      mtd_discount_rate_diff:
        mtdDiscountRate !== null && mtdDiscountRateLy !== null ? mtdDiscountRate - mtdDiscountRateLy : null,
      ytd_act: m.ytd_ty,
      ytd_yoy: m.ytd_ly > 0 ? (m.ytd_ty / m.ytd_ly) * 100 : null,
      ytd_discount_rate: ytdDiscountRate,
      ytd_discount_rate_ly: ytdDiscountRateLy,
      ytd_discount_rate_diff:
        ytdDiscountRate !== null && ytdDiscountRateLy !== null ? ytdDiscountRate - ytdDiscountRateLy : null,
    };
  };

  const seasonCategorySales = {
    season_labels: {
      current: currentSesn,
      next: nextSesn,
      past: `~${pastCutoffSesn}`,
    },
    metrics: {
      currentSeason: toMetric('당시즌의류', seasonCategoryAcc.current),
      nextSeason: toMetric('차시즌의류', seasonCategoryAcc.next),
      pastSeason: toMetric('과시즌의류', seasonCategoryAcc.past),
      hat: toMetric('모자', seasonCategoryAcc.hat),
      shoes: toMetric('신발', seasonCategoryAcc.shoes),
      bag: toMetric('가방', seasonCategoryAcc.bag),
    },
  };

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
    season_category_sales: seasonCategorySales,
    projection_meta: projectionWeights.meta,
  };
}
