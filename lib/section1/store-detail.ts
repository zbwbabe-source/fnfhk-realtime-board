import { executeSnowflakeQuery } from '@/lib/snowflake';
import { getStoreInfo, normalizeBrand } from '@/lib/store-utils';
import { getCategoryMapping } from '@/lib/category-utils';
import { convertTwdToHkd, getPeriodFromDateString } from '@/lib/exchange-rate-utils';

export interface StoreDetailProductRow {
  prdt_cd: string;
  sesn: string;
  category: string;
  category_small: string;
  category_large: string;
  sales_tag: number;
  sales_act: number;
  sales_tag_yoy_pct: number | null;
  sales_act_yoy_pct: number | null;
  discount_rate: number | null;
  discount_rate_diff: number | null;
}

export interface StoreDetailSmallCategoryRow {
  category_small_key: string;
  category_small: string;
  middle_category: string;
  sales_tag: number;
  sales_act: number;
  sales_act_ly: number;
  sales_share_pct: number;
  sales_tag_yoy_pct: number | null;
  sales_act_yoy_pct: number | null;
  discount_rate: number | null;
  discount_rate_diff: number | null;
  product_count: number;
}

export interface StoreDetailCategoryRow {
  category: string;
  sales_tag: number;
  sales_act: number;
  sales_share_pct: number;
  sales_tag_yoy_pct: number | null;
  sales_act_yoy_pct: number | null;
  discount_rate: number | null;
  discount_rate_diff: number | null;
  product_count: number;
  small_categories: StoreDetailSmallCategoryRow[];
}

export interface StoreDetailPayload {
  asof_date: string;
  period_start_date: string;
  mode: 'mtd' | 'ytd';
  metric_key?: 'daily' | 'recent7d' | 'mtd' | 'projectedMtd' | 'ytd';
  region: string;
  brand: string;
  header: {
    shop_cd: string;
    shop_name: string;
    mode: 'mtd' | 'ytd';
    sales_tag: number;
    sales_act: number;
    sales_yoy_pct: number | null;
    sales_tag_yoy_pct: number | null;
    discount_rate: number | null;
    discount_rate_diff: number | null;
  };
  categories: StoreDetailCategoryRow[];
  products_by_small_category: Record<string, StoreDetailProductRow[]>;
}

function formatDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function getLyDateString(date: string): string {
  const current = new Date(date);
  const ly = new Date(current);
  ly.setFullYear(current.getFullYear() - 1);
  return formatDate(ly);
}

function getPeriodStartDate(date: string, mode: 'mtd' | 'ytd'): string {
  const current = new Date(date);
  if (mode === 'ytd') {
    return `${current.getFullYear()}-01-01`;
  }
  return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-01`;
}

function shiftDays(date: string, days: number): string {
  const current = new Date(date);
  current.setDate(current.getDate() + days);
  return formatDate(current);
}

function getPeriodRangeForMetric(
  date: string,
  mode: 'mtd' | 'ytd',
  metricKey?: 'daily' | 'recent7d' | 'mtd' | 'projectedMtd' | 'ytd'
) {
  const normalizedMetricKey = metricKey || mode;
  if (normalizedMetricKey === 'daily') {
    return { mode: 'mtd' as const, periodStartDate: date, lyPeriodStartDate: getLyDateString(date) };
  }
  if (normalizedMetricKey === 'recent7d') {
    const periodStartDate = shiftDays(date, -6);
    return { mode: 'mtd' as const, periodStartDate, lyPeriodStartDate: getLyDateString(periodStartDate) };
  }
  if (normalizedMetricKey === 'ytd') {
    const periodStartDate = getPeriodStartDate(date, 'ytd');
    return { mode: 'ytd' as const, periodStartDate, lyPeriodStartDate: getPeriodStartDate(getLyDateString(date), 'ytd') };
  }
  const periodStartDate = getPeriodStartDate(date, 'mtd');
  return { mode: 'mtd' as const, periodStartDate, lyPeriodStartDate: getPeriodStartDate(getLyDateString(date), 'mtd') };
}

function normalizeLargeCategory(raw: string): string {
  if (raw === '기타ACC') return '기타악세';
  return raw || '기타악세';
}

type SeasonPart = 'S' | 'F';

function parseSeasonCode(sesn: string): { yy: number; part: SeasonPart } | null {
  const match = String(sesn || '').trim().toUpperCase().match(/^(\d{2})([SF])$/);
  if (!match) return null;
  return { yy: Number(match[1]), part: match[2] as SeasonPart };
}

function getSeasonBucketLabel(sesn: string, asofDate: string): string | null {
  const parsed = parseSeasonCode(sesn);
  if (!parsed) return null;

  const date = new Date(asofDate);
  const year = date.getFullYear() % 100;
  const month = date.getMonth() + 1;
  const activePart: SeasonPart = month >= 3 && month <= 8 ? 'S' : 'F';
  const currentSYear = month >= 3 ? year : year - 1;
  const currentFYear = month >= 9 ? year : year - 1;

  if (activePart === 'S') {
    if (parsed.part === 'F') return '과시즌F';
    if (parsed.yy === currentSYear) return '당시즌의류';
    if (parsed.yy === currentSYear - 1) return '1년차의류';
    if (parsed.yy === currentSYear - 2) return '2년차의류';
    return '과시즌의류';
  }

  if (parsed.part === 'S') return '과시즌S';
  if (parsed.yy === currentFYear) return '당시즌의류';
  if (parsed.yy === currentFYear - 1) return '1년차의류';
  if (parsed.yy === currentFYear - 2) return '2년차의류';
  if (parsed.yy <= currentFYear - 3) return '과시즌의류';
  return null;
}

function getDisplayCategory(largeCategory: string, sesn: string, asofDate: string): string {
  if (largeCategory !== '의류') return largeCategory;
  return getSeasonBucketLabel(sesn, asofDate) || '의류';
}

export async function fetchSection1StoreDetail({
  region,
  brand,
  date,
  shopCd,
  mode,
  metricKey,
}: {
  region: string;
  brand: string;
  date: string;
  shopCd: string;
  mode: 'mtd' | 'ytd';
  metricKey?: 'daily' | 'recent7d' | 'mtd' | 'projectedMtd' | 'ytd';
}): Promise<StoreDetailPayload> {
  const storeInfo = getStoreInfo(shopCd);
  if (!storeInfo) {
    throw new Error(`Unknown store code: ${shopCd}`);
  }

  const countries = region === 'HKMC' ? ['HK', 'MC'] : ['TW'];
  if (!countries.includes(storeInfo.country) || normalizeBrand(storeInfo.brand) !== brand || storeInfo.channel === 'Warehouse') {
    throw new Error(`Store ${shopCd} does not belong to ${region}/${brand}`);
  }

  const lyDate = getLyDateString(date);
  const { mode: normalizedMode, periodStartDate, lyPeriodStartDate } = getPeriodRangeForMetric(date, mode, metricKey);
  const isTwRegion = region === 'TW';
  const currentPeriod = isTwRegion ? getPeriodFromDateString(date) : '';
  const lyPeriod = isTwRegion ? getPeriodFromDateString(lyDate) : '';
  const applyCurrentRate = (amount: number) => (isTwRegion ? convertTwdToHkd(amount, currentPeriod) || 0 : amount);
  const applyLyRate = (amount: number) => (isTwRegion ? convertTwdToHkd(amount, lyPeriod) || 0 : amount);

  const rows = await executeSnowflakeQuery(
    `
      SELECT
        PRDT_CD,
        ANY_VALUE(SESN) AS SESN,
        ANY_VALUE(PART_CD) AS PART_CD,
        SUM(CASE WHEN SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN ACT_SALE_AMT ELSE 0 END) AS SALES_ACT,
        SUM(CASE WHEN SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN TAG_SALE_AMT ELSE 0 END) AS SALES_TAG,
        SUM(CASE WHEN SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN ACT_SALE_AMT ELSE 0 END) AS SALES_ACT_LY,
        SUM(CASE WHEN SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN TAG_SALE_AMT ELSE 0 END) AS SALES_TAG_LY
      FROM SAP_FNF.DW_HMD_SALE_D
      WHERE
        (CASE WHEN BRD_CD IN ('M', 'I') THEN 'M' ELSE BRD_CD END) = ?
        AND LOCAL_SHOP_CD = ?
        AND SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?)
      GROUP BY PRDT_CD
      HAVING
        SUM(CASE WHEN SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN TAG_SALE_AMT ELSE 0 END) > 0
        OR SUM(CASE WHEN SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN ACT_SALE_AMT ELSE 0 END) > 0
      ORDER BY SALES_TAG DESC, SALES_ACT DESC
    `,
    [
      periodStartDate,
      date,
      periodStartDate,
      date,
      lyPeriodStartDate,
      lyDate,
      lyPeriodStartDate,
      lyDate,
      brand,
      shopCd,
      lyPeriodStartDate,
      date,
      lyPeriodStartDate,
      date,
      periodStartDate,
      date,
      periodStartDate,
      date,
    ]
  );
  const seasonSmallCategoryAggRows = await executeSnowflakeQuery(
    `
      SELECT
        SESN,
        SUBSTR(PART_CD, 3, 2) AS CATEGORY_SMALL,
        SUM(CASE WHEN SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN ACT_SALE_AMT ELSE 0 END) AS SALES_ACT,
        SUM(CASE WHEN SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN TAG_SALE_AMT ELSE 0 END) AS SALES_TAG,
        SUM(CASE WHEN SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN ACT_SALE_AMT ELSE 0 END) AS SALES_ACT_LY,
        SUM(CASE WHEN SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN TAG_SALE_AMT ELSE 0 END) AS SALES_TAG_LY
      FROM SAP_FNF.DW_HMD_SALE_D
      WHERE
        (CASE WHEN BRD_CD IN ('M', 'I') THEN 'M' ELSE BRD_CD END) = ?
        AND LOCAL_SHOP_CD = ?
        AND SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?)
      GROUP BY SESN, SUBSTR(PART_CD, 3, 2)
      HAVING
        SUM(CASE WHEN SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN TAG_SALE_AMT ELSE 0 END) > 0
        OR SUM(CASE WHEN SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN ACT_SALE_AMT ELSE 0 END) > 0
        OR SUM(CASE WHEN SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN TAG_SALE_AMT ELSE 0 END) > 0
        OR SUM(CASE WHEN SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN ACT_SALE_AMT ELSE 0 END) > 0
    `,
    [
      periodStartDate,
      date,
      periodStartDate,
      date,
      lyPeriodStartDate,
      lyDate,
      lyPeriodStartDate,
      lyDate,
      brand,
      shopCd,
      lyPeriodStartDate,
      date,
      periodStartDate,
      date,
      periodStartDate,
      date,
      lyPeriodStartDate,
      lyDate,
      lyPeriodStartDate,
      lyDate,
    ]
  );
  const products: StoreDetailProductRow[] = [];
  const categoryMap = new Map<
    string,
    {
      category: string;
      sales_tag: number;
      sales_act: number;
      sales_tag_ly_base: number;
      sales_act_ly_base: number;
      product_count: number;
    }
  >();
  const smallCategoryMap = new Map<
    string,
    {
      category_small_key: string;
      category_small: string;
      middle_category: string;
      category_large: string;
      sales_tag: number;
      sales_act: number;
      sales_tag_ly_base: number;
      sales_act_ly_base: number;
      product_count: number;
    }
  >();
  const rawRowsBySmallCategory = new Map<string, StoreDetailProductRow[]>();

  rows.forEach((row: any) => {
    const prdtCd = String(row.PRDT_CD || '').trim();
    const partCd = String(row.PART_CD || '');
    const sesn = String(row.SESN || '').trim().toUpperCase();
    const categorySmall = partCd.length >= 4 ? partCd.slice(2, 4) : '';
    const mapping = getCategoryMapping(categorySmall);
    const categoryLarge = getDisplayCategory(normalizeLargeCategory(mapping.large), sesn, date);
    const middleCategory = mapping.middle || 'Unknown';
    const salesAct = applyCurrentRate(Number(row.SALES_ACT || 0));
    const salesTag = applyCurrentRate(Number(row.SALES_TAG || 0));
    const salesActLy = applyLyRate(Number(row.SALES_ACT_LY || 0));
    const salesTagLy = applyLyRate(Number(row.SALES_TAG_LY || 0));

    if (!prdtCd || (salesTag <= 0 && salesAct <= 0 && salesTagLy <= 0 && salesActLy <= 0)) return;

    const discountRate = salesTag > 0 ? (1 - salesAct / salesTag) * 100 : null;
    const discountRateLy = salesTagLy > 0 ? (1 - salesActLy / salesTagLy) * 100 : null;

    const product: StoreDetailProductRow = {
      prdt_cd: prdtCd,
      sesn,
      category: middleCategory,
      category_small: categorySmall || '-',
      category_large: categoryLarge,
      sales_tag: salesTag,
      sales_act: salesAct,
      sales_tag_yoy_pct: salesTagLy > 0 ? (salesTag / salesTagLy) * 100 : null,
      sales_act_yoy_pct: salesActLy > 0 ? (salesAct / salesActLy) * 100 : null,
      discount_rate: discountRate,
      discount_rate_diff:
        discountRate !== null && discountRateLy !== null ? discountRate - discountRateLy : null,
    };
    products.push(product);

    const categorySmallKey = `${categoryLarge}__${categorySmall || '-'}`;
    const existing = rawRowsBySmallCategory.get(categorySmallKey) || [];
    existing.push(product);
    rawRowsBySmallCategory.set(categorySmallKey, existing);
  });

  products.sort((a, b) => b.sales_tag - a.sales_tag || b.sales_act - a.sales_act);

  seasonSmallCategoryAggRows.forEach((row: any) => {
    const sesn = String(row.SESN || '').trim().toUpperCase();
    const categorySmall = String(row.CATEGORY_SMALL || '').trim() || '-';
    const mapping = getCategoryMapping(categorySmall);
    const normalizedLarge = normalizeLargeCategory(mapping.large);
    const currentCategoryLarge = getDisplayCategory(normalizedLarge, sesn, date);
    const middleCategory = mapping.middle || 'Unknown';
    const salesAct = applyCurrentRate(Number(row.SALES_ACT || 0));
    const salesTag = applyCurrentRate(Number(row.SALES_TAG || 0));
    const salesActLy = applyLyRate(Number(row.SALES_ACT_LY || 0));
    const salesTagLy = applyLyRate(Number(row.SALES_TAG_LY || 0));

    if (salesTag <= 0 && salesAct <= 0 && salesTagLy <= 0 && salesActLy <= 0) return;

    if (!categoryMap.has(currentCategoryLarge)) {
      categoryMap.set(currentCategoryLarge, {
        category: currentCategoryLarge,
        sales_tag: 0,
        sales_act: 0,
        sales_tag_ly_base: 0,
        sales_act_ly_base: 0,
        product_count: 0,
      });
    }
    const currentCategoryAgg = categoryMap.get(currentCategoryLarge)!;
    currentCategoryAgg.sales_tag += salesTag;
    currentCategoryAgg.sales_act += salesAct;
    currentCategoryAgg.sales_tag_ly_base += salesTagLy;
    currentCategoryAgg.sales_act_ly_base += salesActLy;

    const currentCategorySmallKey = `${currentCategoryLarge}__${categorySmall}`;
    if (!smallCategoryMap.has(currentCategorySmallKey)) {
      smallCategoryMap.set(currentCategorySmallKey, {
        category_small_key: currentCategorySmallKey,
        category_small: categorySmall,
        middle_category: middleCategory,
        category_large: currentCategoryLarge,
        sales_tag: 0,
        sales_act: 0,
        sales_tag_ly_base: 0,
        sales_act_ly_base: 0,
        product_count: 0,
      });
    }
    const currentSmallAgg = smallCategoryMap.get(currentCategorySmallKey)!;
    currentSmallAgg.sales_tag += salesTag;
    currentSmallAgg.sales_act += salesAct;
    currentSmallAgg.sales_tag_ly_base += salesTagLy;
    currentSmallAgg.sales_act_ly_base += salesActLy;
  });

  rawRowsBySmallCategory.forEach((productRows, categorySmallKey) => {
    const smallAgg = smallCategoryMap.get(categorySmallKey);
    if (!smallAgg) return;
    smallAgg.product_count = productRows.length;
    const categoryAgg = categoryMap.get(smallAgg.category_large);
    if (!categoryAgg) return;
    categoryAgg.product_count += productRows.length;
  });

  const smallCategories = Array.from(smallCategoryMap.values()).map((smallAgg) => {
    const discountRate = smallAgg.sales_tag > 0 ? (1 - smallAgg.sales_act / smallAgg.sales_tag) * 100 : null;
    const discountRateLy =
      smallAgg.sales_tag_ly_base > 0
        ? (1 - smallAgg.sales_act_ly_base / smallAgg.sales_tag_ly_base) * 100
        : null;
    return {
      category_small_key: smallAgg.category_small_key,
      category_small: smallAgg.category_small,
      middle_category: smallAgg.middle_category,
      sales_tag: smallAgg.sales_tag,
      sales_act: smallAgg.sales_act,
      sales_share_pct: 0,
      sales_act_ly: smallAgg.sales_act_ly_base,
      sales_tag_yoy_pct:
        smallAgg.sales_tag_ly_base > 0 ? (smallAgg.sales_tag / smallAgg.sales_tag_ly_base) * 100 : null,
      sales_act_yoy_pct:
        smallAgg.sales_act_ly_base > 0 ? (smallAgg.sales_act / smallAgg.sales_act_ly_base) * 100 : null,
      discount_rate: discountRate,
      discount_rate_diff:
        discountRate !== null && discountRateLy !== null ? discountRate - discountRateLy : null,
      product_count: smallAgg.product_count,
      category_large: smallAgg.category_large,
    };
  });

  const categories: StoreDetailCategoryRow[] = Array.from(categoryMap.values())
    .map((categoryAgg) => {
      const discountRate = categoryAgg.sales_tag > 0 ? (1 - categoryAgg.sales_act / categoryAgg.sales_tag) * 100 : null;
      const discountRateLy =
        categoryAgg.sales_tag_ly_base > 0
          ? (1 - categoryAgg.sales_act_ly_base / categoryAgg.sales_tag_ly_base) * 100
          : null;

      return {
        category: categoryAgg.category,
        sales_tag: categoryAgg.sales_tag,
        sales_act: categoryAgg.sales_act,
        sales_share_pct: 0,
        sales_tag_yoy_pct:
          categoryAgg.sales_tag_ly_base > 0 ? (categoryAgg.sales_tag / categoryAgg.sales_tag_ly_base) * 100 : null,
        sales_act_yoy_pct:
          categoryAgg.sales_act_ly_base > 0 ? (categoryAgg.sales_act / categoryAgg.sales_act_ly_base) * 100 : null,
        discount_rate: discountRate,
        discount_rate_diff:
          discountRate !== null && discountRateLy !== null ? discountRate - discountRateLy : null,
        product_count: categoryAgg.product_count,
        small_categories: [],
      };
    })
    .sort((a, b) => b.sales_tag - a.sales_tag || b.sales_act - a.sales_act);

  const productsBySmallCategory = Object.fromEntries(
    Array.from(rawRowsBySmallCategory.entries()).map(([categorySmallKey, productRows]) => [
      categorySmallKey,
      [...productRows].sort((a, b) => b.sales_tag - a.sales_tag || b.sales_act - a.sales_act),
    ])
  );

  const totalSalesTag = categories.reduce((sum, category) => sum + category.sales_tag, 0);
  const totalSalesAct = categories.reduce((sum, category) => sum + category.sales_act, 0);
  categories.forEach((category) => {
    category.sales_share_pct = totalSalesTag > 0 ? (category.sales_tag / totalSalesTag) * 100 : 0;
    const categorySmallRows = smallCategories
      .filter((smallCategory) => smallCategory.category_large === category.category)
      .sort((a, b) => b.sales_tag - a.sales_tag || b.sales_act - a.sales_act)
      .map(({ category_large, ...smallCategory }) => smallCategory);
    category.small_categories = categorySmallRows.map((smallCategory) => ({
      ...smallCategory,
      sales_share_pct: category.sales_tag > 0 ? (smallCategory.sales_tag / category.sales_tag) * 100 : 0,
    }));
  });
  const categoryOrder = new Map<string, number>([
    ['당시즌의류', 0],
    ['1년차의류', 1],
    ['2년차의류', 2],
    ['과시즌의류', 3],
    ['과시즌F', 4],
    ['과시즌S', 4],
  ]);
  categories.sort((a, b) => {
    const aOrder = categoryOrder.get(a.category);
    const bOrder = categoryOrder.get(b.category);
    if (aOrder !== undefined || bOrder !== undefined) {
      return (aOrder ?? 999) - (bOrder ?? 999);
    }
    return b.sales_tag - a.sales_tag || b.sales_act - a.sales_act;
  });
  const totalSalesTagLy = rows.reduce((sum: number, row: any) => sum + applyLyRate(Number(row.SALES_TAG_LY || 0)), 0);
  const totalSalesActLy = rows.reduce((sum: number, row: any) => sum + applyLyRate(Number(row.SALES_ACT_LY || 0)), 0);
  const headerDiscountRate = totalSalesTag > 0 ? (1 - totalSalesAct / totalSalesTag) * 100 : null;
  const headerDiscountRateLy =
    totalSalesTagLy > 0 ? (1 - totalSalesActLy / totalSalesTagLy) * 100 : null;

  return {
    asof_date: date,
    period_start_date: periodStartDate,
    mode: normalizedMode,
    metric_key: metricKey,
    region,
    brand,
    header: {
      shop_cd: shopCd,
      shop_name: storeInfo.store_name,
      mode: normalizedMode,
      sales_tag: totalSalesTag,
      sales_act: totalSalesAct,
      sales_yoy_pct: totalSalesActLy > 0 ? (totalSalesAct / totalSalesActLy) * 100 : null,
      sales_tag_yoy_pct: totalSalesTagLy > 0 ? (totalSalesTag / totalSalesTagLy) * 100 : null,
      discount_rate: headerDiscountRate,
      discount_rate_diff:
        headerDiscountRate !== null && headerDiscountRateLy !== null ? headerDiscountRate - headerDiscountRateLy : null,
    },
    categories,
    products_by_small_category: productsBySmallCategory,
  };
}
