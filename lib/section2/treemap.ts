import { executeSnowflakeQuery } from '@/lib/snowflake';
import { getStoresByRegionBrandChannel, normalizeBrand } from '@/lib/store-utils';
import { getSeasonCode, getSection2StartDate, formatDateYYYYMMDD } from '@/lib/date-utils';
import { getCategoryMapping } from '@/lib/category-utils';
import { getPeriodFromDateString, convertTwdToHkd } from '@/lib/exchange-rate-utils';

/**
 * Section2 Treemap Payload
 */
export interface TreemapPayload {
  asof_date: string;
  cum_start_date: string;
  mode: string;
  region: string;
  brand: string;
  sesn: string;
  total_sales_tag: number;
  total_sales_act: number;
  large_categories: any[];
}

/**
 * Section2 Treemap 데이터 조회
 */
export async function fetchSection2Treemap({
  region,
  brand,
  date,
  mode = 'monthly',
}: {
  region: string;
  brand: string;
  date: string;
  mode?: string;
}): Promise<TreemapPayload> {
  const normalizedBrand = normalizeBrand(brand);
  const asofDate = new Date(date);
  const sesn = getSeasonCode(asofDate);

  // 날짜 범위 계산
  let startDateStr: string;
  if (mode === 'monthly') {
    // 당월: 이번 달 1일 ~ asof_date
    const year = asofDate.getFullYear();
    const month = asofDate.getMonth();
    const startDate = new Date(year, month, 1);
    startDateStr = formatDateYYYYMMDD(startDate);
  } else {
    // 누적: 요약 카드와 동일하게 시즌 시작일 - 6개월 ~ asof_date
    const startDate = new Date(getSection2StartDate(asofDate));
    startDate.setMonth(startDate.getMonth() - 6);
    startDateStr = formatDateYYYYMMDD(startDate);
  }

  // 전년 날짜 계산
  const asofDateLY = new Date(asofDate);
  asofDateLY.setFullYear(asofDateLY.getFullYear() - 1);
  const dateLY = formatDateYYYYMMDD(asofDateLY);
  const sesnLY = getSeasonCode(asofDateLY);

  let startDateLYStr: string;
  if (mode === 'monthly') {
    const year = asofDateLY.getFullYear();
    const month = asofDateLY.getMonth();
    const startDateLY = new Date(year, month, 1);
    startDateLYStr = formatDateYYYYMMDD(startDateLY);
  } else {
    const startDateLY = new Date(getSection2StartDate(asofDateLY));
    startDateLY.setMonth(startDateLY.getMonth() - 6);
    startDateLYStr = formatDateYYYYMMDD(startDateLY);
  }

  console.log('📊 Treemap API Params:', {
    region,
    brand,
    date,
    mode,
    sesn,
    startDate: startDateStr,
    sesnLY,
    startDateLY: startDateLYStr,
  });

  // 매장 코드 (warehouse 제외)
  const salesStoreCodes = getStoresByRegionBrandChannel(region, brand, true);

  if (salesStoreCodes.length === 0) {
    return {
      asof_date: date,
      cum_start_date: startDateStr,
      mode,
      region,
      brand,
      sesn,
      total_sales_tag: 0,
      total_sales_act: 0,
      large_categories: [],
    };
  }

  const salesStoreCodesStr = salesStoreCodes.map((s) => `'${s}'`).join(',');

  // TW 리전일 때 환율 적용
  const isTwRegion = region === 'TW';
  const period = isTwRegion ? getPeriodFromDateString(date) : '';

  // 환율 적용 헬퍼 함수
  const applyExchangeRate = (amount: number | null): number | null => {
    if (amount === null) return null;
    if (!isTwRegion) return amount;
    return convertTwdToHkd(amount, period);
  };

  // SQL: 소분류별 TY와 LY 집계
  const query = `
    WITH 
    -- THIS YEAR (TY) 소분류별 집계
    sales_ty AS (
      SELECT 
        SUBSTR(PART_CD, 3, 2) AS category_small,
        SUM(TAG_SALE_AMT) AS sales_tag_ty,
        SUM(ACT_SALE_AMT) AS sales_act_ty,
        SUM(SALE_QTY) AS sales_qty_ty
      FROM SAP_FNF.DW_HMD_SALE_D
      WHERE 
        (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
        AND SESN = ?
        AND SALE_DT BETWEEN ? AND ?
        AND LOCAL_SHOP_CD IN (${salesStoreCodesStr})
      GROUP BY category_small
    ),
    -- LAST YEAR (LY) 소분류별 집계
    sales_ly AS (
      SELECT 
        SUBSTR(PART_CD, 3, 2) AS category_small,
        SUM(TAG_SALE_AMT) AS sales_tag_ly,
        SUM(ACT_SALE_AMT) AS sales_act_ly,
        SUM(SALE_QTY) AS sales_qty_ly
      FROM SAP_FNF.DW_HMD_SALE_D
      WHERE 
        (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
        AND SESN = ?
        AND SALE_DT BETWEEN ? AND ?
        AND LOCAL_SHOP_CD IN (${salesStoreCodesStr})
      GROUP BY category_small
    )
    SELECT 
      COALESCE(ty.category_small, ly.category_small) AS category_small,
      COALESCE(ty.sales_tag_ty, 0) AS sales_tag_ty,
      COALESCE(ty.sales_act_ty, 0) AS sales_act_ty,
      COALESCE(ly.sales_tag_ly, 0) AS sales_tag_ly,
      COALESCE(ly.sales_act_ly, 0) AS sales_act_ly,
      -- 할인율 (TY)
      CASE 
        WHEN COALESCE(ty.sales_tag_ty, 0) > 0 
        THEN ((COALESCE(ty.sales_tag_ty, 0) - COALESCE(ty.sales_act_ty, 0)) / COALESCE(ty.sales_tag_ty, 0)) * 100
        ELSE 0 
      END AS discount_rate_ty,
      -- 할인율 (LY)
      CASE 
        WHEN COALESCE(ly.sales_tag_ly, 0) > 0 
        THEN ((COALESCE(ly.sales_tag_ly, 0) - COALESCE(ly.sales_act_ly, 0)) / COALESCE(ly.sales_tag_ly, 0)) * 100
        ELSE 0 
      END AS discount_rate_ly,
      -- 매출 YoY
      CASE 
        WHEN COALESCE(ly.sales_act_ly, 0) > 0 
        THEN (COALESCE(ty.sales_act_ty, 0) / COALESCE(ly.sales_act_ly, 0)) * 100
        ELSE NULL 
      END AS yoy
    FROM sales_ty ty
    FULL OUTER JOIN sales_ly ly 
      ON ty.category_small = ly.category_small
    WHERE COALESCE(ty.category_small, ly.category_small) IS NOT NULL
      AND COALESCE(ty.sales_act_ty, ly.sales_act_ly, 0) > 0
    ORDER BY sales_act_ty DESC
  `;

  const rows = await executeSnowflakeQuery(query, [
    normalizedBrand,
    sesn,
    startDateStr,
    date, // TY
    normalizedBrand,
    sesnLY,
    startDateLYStr,
    dateLY, // LY
  ]);

  console.log(`✅ Treemap: Retrieved ${rows.length} small categories`);

  // 소분류 데이터 처리
  const smallCategories = rows.map((row: any) => {
    const smallCode = row.CATEGORY_SMALL;
    const mapping = getCategoryMapping(smallCode);
    const salesTagTY = applyExchangeRate(parseFloat(row.SALES_TAG_TY || 0)) || 0;
    const salesActTY = applyExchangeRate(parseFloat(row.SALES_ACT_TY || 0)) || 0;
    const salesTagLY = applyExchangeRate(parseFloat(row.SALES_TAG_LY || 0)) || 0;
    const salesActLY = applyExchangeRate(parseFloat(row.SALES_ACT_LY || 0)) || 0;

    // 할인율 재계산 (환율 적용 후)
    const discountRateTY = salesTagTY > 0 ? ((salesTagTY - salesActTY) / salesTagTY) * 100 : 0;
    const discountRateLY = salesTagLY > 0 ? ((salesTagLY - salesActLY) / salesTagLY) * 100 : 0;

    // YoY 재계산 (환율 적용 후)
    const yoy = salesActLY > 0 ? (salesActTY / salesActLY) * 100 : null;

    return {
      code: smallCode,
      large: mapping.large,
      middle: mapping.middle,
      sales_tag: salesTagTY,
      sales_act: salesActTY,
      sales_act_ly: salesActLY,
      discount_rate: discountRateTY,
      discount_rate_ly: discountRateLY,
      discount_rate_diff: discountRateTY - discountRateLY,
      yoy,
    };
  });

  // 중분류별 집계
  const middleMap = new Map<string, any>();
  smallCategories.forEach((item) => {
    const key = `${item.large}|${item.middle}`;
    if (!middleMap.has(key)) {
      middleMap.set(key, {
        name: item.middle,
        large: item.large,
        sales_tag: 0,
        sales_act: 0,
        sales_act_ly: 0,
        discount_rate_weighted: 0,
        discount_rate_ly_weighted: 0,
        yoy_weighted: 0,
        total_sales_for_weight: 0,
        small_categories: [],
      });
    }
    const middleData = middleMap.get(key);
    middleData.sales_tag += item.sales_tag;
    middleData.sales_act += item.sales_act;
    middleData.sales_act_ly += item.sales_act_ly;
    middleData.discount_rate_weighted += item.discount_rate * item.sales_act;
    middleData.discount_rate_ly_weighted += item.discount_rate_ly * item.sales_act;
    if (item.yoy !== null) {
      middleData.yoy_weighted += item.yoy * item.sales_act;
      middleData.total_sales_for_weight += item.sales_act;
    }
    middleData.small_categories.push(item);
  });

  // 중분류 비율 계산
  const middleCategories = Array.from(middleMap.values()).map((middle) => {
    const discount_rate =
      middle.sales_tag > 0 ? ((middle.sales_tag - middle.sales_act) / middle.sales_tag) * 100 : 0;
    const discount_rate_ly =
      middle.sales_act > 0 ? middle.discount_rate_ly_weighted / middle.sales_act : 0;
    const yoy = middle.sales_act_ly > 0 ? (middle.sales_act / middle.sales_act_ly) * 100 : null;

    return {
      name: middle.name,
      large: middle.large,
      sales_tag: middle.sales_tag,
      sales_act: middle.sales_act,
      sales_act_ly: middle.sales_act_ly,
      sales_pct: 0, // Will be calculated later
      sales_pct_ly: 0,
      sales_pct_diff: 0,
      discount_rate,
      discount_rate_ly,
      discount_rate_diff: discount_rate - discount_rate_ly,
      yoy,
      small_categories: middle.small_categories.map((small: any) => ({
        code: small.code,
        sales_tag: small.sales_tag,
        sales_act: small.sales_act,
        sales_pct: middle.sales_act > 0 ? (small.sales_act / middle.sales_act) * 100 : 0,
        sales_pct_ly: middle.sales_act_ly > 0 ? (small.sales_act_ly / middle.sales_act_ly) * 100 : 0,
        sales_pct_diff:
          (middle.sales_act > 0 ? (small.sales_act / middle.sales_act) * 100 : 0) -
          (middle.sales_act_ly > 0 ? (small.sales_act_ly / middle.sales_act_ly) * 100 : 0),
        discount_rate: small.discount_rate,
        discount_rate_ly: small.discount_rate_ly,
        discount_rate_diff: small.discount_rate_diff,
        yoy: small.yoy,
      })),
    };
  });

  // 대분류별 집계
  const largeMap = new Map<string, any>();
  middleCategories.forEach((middle) => {
    if (!largeMap.has(middle.large)) {
      largeMap.set(middle.large, {
        name: middle.large,
        sales_tag: 0,
        sales_act: 0,
        sales_act_ly: 0,
        discount_rate_weighted: 0,
        discount_rate_ly_weighted: 0,
        yoy_weighted: 0,
        total_sales_for_weight: 0,
        middle_categories: [],
      });
    }
    const largeData = largeMap.get(middle.large);
    largeData.sales_tag += middle.sales_tag;
    largeData.sales_act += middle.sales_act;
    largeData.sales_act_ly += middle.sales_act_ly;
    largeData.discount_rate_weighted += middle.discount_rate * middle.sales_act;
    largeData.discount_rate_ly_weighted += middle.discount_rate_ly * middle.sales_act;
    if (middle.yoy !== null) {
      largeData.yoy_weighted += middle.yoy * middle.sales_act;
      largeData.total_sales_for_weight += middle.sales_act;
    }
    largeData.middle_categories.push(middle);
  });

  // 전체 매출 계산
  const totalSalesTag = Array.from(largeMap.values()).reduce(
    (sum, large) => sum + large.sales_tag,
    0
  );
  const totalSalesAct = Array.from(largeMap.values()).reduce(
    (sum, large) => sum + large.sales_act,
    0
  );
  const totalSalesActLY = Array.from(largeMap.values()).reduce(
    (sum, large) => sum + large.sales_act_ly,
    0
  );

  // 대분류 비율 계산 및 정렬
  const largeCategories = Array.from(largeMap.values())
    .map((large) => {
      const discount_rate =
        large.sales_tag > 0 ? ((large.sales_tag - large.sales_act) / large.sales_tag) * 100 : 0;
      const discount_rate_ly =
        large.sales_act > 0 ? large.discount_rate_ly_weighted / large.sales_act : 0;
      const yoy = large.sales_act_ly > 0 ? (large.sales_act / large.sales_act_ly) * 100 : null;

      // 중분류에 대분류 내 비율 계산
      const middleWithPct = large.middle_categories.map((middle: any) => ({
        ...middle,
        sales_pct: large.sales_act > 0 ? (middle.sales_act / large.sales_act) * 100 : 0,
        sales_pct_ly: large.sales_act_ly > 0 ? (middle.sales_act_ly / large.sales_act_ly) * 100 : 0,
        sales_pct_diff:
          (large.sales_act > 0 ? (middle.sales_act / large.sales_act) * 100 : 0) -
          (large.sales_act_ly > 0 ? (middle.sales_act_ly / large.sales_act_ly) * 100 : 0),
      }));

      return {
        name: large.name,
        sales_tag: large.sales_tag,
        sales_act: large.sales_act,
        sales_pct: totalSalesAct > 0 ? (large.sales_act / totalSalesAct) * 100 : 0,
        sales_pct_ly: totalSalesActLY > 0 ? (large.sales_act_ly / totalSalesActLY) * 100 : 0,
        sales_pct_diff:
          (totalSalesAct > 0 ? (large.sales_act / totalSalesAct) * 100 : 0) -
          (totalSalesActLY > 0 ? (large.sales_act_ly / totalSalesActLY) * 100 : 0),
        discount_rate,
        discount_rate_ly,
        discount_rate_diff: discount_rate - discount_rate_ly,
        yoy,
        middle_categories: middleWithPct,
      };
    })
    .sort((a, b) => b.sales_act - a.sales_act);

  console.log('📊 Treemap aggregation:', {
    large_count: largeCategories.length,
    middle_count: middleCategories.length,
    small_count: smallCategories.length,
    total_sales_tag: totalSalesTag,
    total_sales_act: totalSalesAct,
  });

  return {
    asof_date: date,
    cum_start_date: startDateStr,
    mode,
    region,
    brand,
    sesn,
    total_sales_tag: totalSalesTag,
    total_sales_act: totalSalesAct,
    large_categories: largeCategories,
  };
}
