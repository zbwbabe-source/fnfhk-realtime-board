import { executeSnowflakeQuery } from '@/lib/snowflake';
import { getStoreInfo, normalizeBrand } from '@/lib/store-utils';
import { getCategoryMapping } from '@/lib/category-utils';
import { convertTwdToHkd, getPeriodFromDateString } from '@/lib/exchange-rate-utils';

export interface StoreDetailProductRow {
  prdt_cd: string;
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
  category_small: string;
  middle_category: string;
  sales_tag: number;
  sales_act: number;
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

function normalizeLargeCategory(raw: string): string {
  if (raw === '기타ACC') return '기타악세';
  return raw || '기타악세';
}

export async function fetchSection1StoreDetail({
  region,
  brand,
  date,
  shopCd,
  mode,
}: {
  region: string;
  brand: string;
  date: string;
  shopCd: string;
  mode: 'mtd' | 'ytd';
}): Promise<StoreDetailPayload> {
  const storeInfo = getStoreInfo(shopCd);
  if (!storeInfo) {
    throw new Error(`Unknown store code: ${shopCd}`);
  }

  const countries = region === 'HKMC' ? ['HK', 'MC'] : ['TW'];
  if (!countries.includes(storeInfo.country) || normalizeBrand(storeInfo.brand) !== brand || storeInfo.channel === 'Warehouse') {
    throw new Error(`Store ${shopCd} does not belong to ${region}/${brand}`);
  }

  const periodStartDate = getPeriodStartDate(date, mode);
  const lyDate = getLyDateString(date);
  const lyPeriodStartDate = getPeriodStartDate(lyDate, mode);
  const isTwRegion = region === 'TW';
  const currentPeriod = isTwRegion ? getPeriodFromDateString(date) : '';
  const lyPeriod = isTwRegion ? getPeriodFromDateString(lyDate) : '';
  const applyCurrentRate = (amount: number) => (isTwRegion ? convertTwdToHkd(amount, currentPeriod) || 0 : amount);
  const applyLyRate = (amount: number) => (isTwRegion ? convertTwdToHkd(amount, lyPeriod) || 0 : amount);

  const rows = await executeSnowflakeQuery(
    `
      SELECT
        PRDT_CD,
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
  const smallCategoryAggRows = await executeSnowflakeQuery(
    `
      SELECT
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
      GROUP BY SUBSTR(PART_CD, 3, 2)
      HAVING
        SUM(CASE WHEN SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN TAG_SALE_AMT ELSE 0 END) > 0
        OR SUM(CASE WHEN SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN ACT_SALE_AMT ELSE 0 END) > 0
        OR SUM(CASE WHEN SALE_DT BETWEEN TO_DATE(?) AND TO_DATE(?) THEN TAG_SALE_AMT ELSE 0 END) > 0
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

  const products: StoreDetailProductRow[] = rows
    .map((row: any) => {
      const partCd = String(row.PART_CD || '');
      const categorySmall = partCd.length >= 4 ? partCd.slice(2, 4) : '';
      const mapping = getCategoryMapping(categorySmall);
      const salesAct = applyCurrentRate(Number(row.SALES_ACT || 0));
      const salesTag = applyCurrentRate(Number(row.SALES_TAG || 0));
      const salesActLy = applyLyRate(Number(row.SALES_ACT_LY || 0));
      const salesTagLy = applyLyRate(Number(row.SALES_TAG_LY || 0));
      const discountRate = salesTag > 0 ? (1 - salesAct / salesTag) * 100 : null;
      const discountRateLy = salesTagLy > 0 ? (1 - salesActLy / salesTagLy) * 100 : null;

      return {
        prdt_cd: String(row.PRDT_CD || '').trim(),
        category: mapping.middle || 'Unknown',
        category_small: categorySmall || '-',
        category_large: normalizeLargeCategory(mapping.large),
        sales_tag: salesTag,
        sales_act: salesAct,
        sales_tag_yoy_pct: salesTagLy > 0 ? (salesTag / salesTagLy) * 100 : null,
        sales_act_yoy_pct: salesActLy > 0 ? (salesAct / salesActLy) * 100 : null,
        discount_rate: discountRate,
        discount_rate_diff:
          discountRate !== null && discountRateLy !== null ? discountRate - discountRateLy : null,
      };
    })
    .filter((row) => row.prdt_cd && (row.sales_tag > 0 || row.sales_act > 0))
    .sort((a, b) => b.sales_tag - a.sales_tag || b.sales_act - a.sales_act);

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

  smallCategoryAggRows.forEach((row: any) => {
    const categorySmall = String(row.CATEGORY_SMALL || '').trim();
    if (!categorySmall) return;
    const mapping = getCategoryMapping(categorySmall);
    const category = normalizeLargeCategory(mapping.large);
    const middleCategory = mapping.middle || 'Unknown';
    const salesAct = applyCurrentRate(Number(row.SALES_ACT || 0));
    const salesTag = applyCurrentRate(Number(row.SALES_TAG || 0));
    const salesActLy = applyLyRate(Number(row.SALES_ACT_LY || 0));
    const salesTagLy = applyLyRate(Number(row.SALES_TAG_LY || 0));
    if (salesTag <= 0 && salesAct <= 0 && salesTagLy <= 0 && salesActLy <= 0) return;

    if (!categoryMap.has(category)) {
      categoryMap.set(category, {
        category,
        sales_tag: 0,
        sales_act: 0,
        sales_tag_ly_base: 0,
        sales_act_ly_base: 0,
        product_count: 0,
      });
    }

    const categoryAgg = categoryMap.get(category)!;
    categoryAgg.sales_tag += salesTag;
    categoryAgg.sales_act += salesAct;
    categoryAgg.sales_tag_ly_base += salesTagLy;
    categoryAgg.sales_act_ly_base += salesActLy;

    if (!smallCategoryMap.has(categorySmall)) {
      smallCategoryMap.set(categorySmall, {
        category_small: categorySmall || '-',
        middle_category: middleCategory,
        category_large: category,
        sales_tag: 0,
        sales_act: 0,
        sales_tag_ly_base: 0,
        sales_act_ly_base: 0,
        product_count: 0,
      });
    }

    const smallAgg = smallCategoryMap.get(categorySmall)!;
    smallAgg.sales_tag += salesTag;
    smallAgg.sales_act += salesAct;
    smallAgg.sales_tag_ly_base += salesTagLy;
    smallAgg.sales_act_ly_base += salesActLy;
  });

  products.forEach((product) => {
    const existing = rawRowsBySmallCategory.get(product.category_small) || [];
    existing.push(product);
    rawRowsBySmallCategory.set(product.category_small, existing);
  });

  rawRowsBySmallCategory.forEach((productRows, categorySmall) => {
    const smallAgg = smallCategoryMap.get(categorySmall);
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
      category_small: smallAgg.category_small,
      middle_category: smallAgg.middle_category,
      sales_tag: smallAgg.sales_tag,
      sales_act: smallAgg.sales_act,
      sales_share_pct: 0,
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
    Array.from(rawRowsBySmallCategory.entries()).map(([categorySmall, productRows]) => [
      categorySmall,
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
  const totalSalesTagLy = rows.reduce((sum: number, row: any) => sum + applyLyRate(Number(row.SALES_TAG_LY || 0)), 0);
  const totalSalesActLy = rows.reduce((sum: number, row: any) => sum + applyLyRate(Number(row.SALES_ACT_LY || 0)), 0);
  const headerDiscountRate = totalSalesTag > 0 ? (1 - totalSalesAct / totalSalesTag) * 100 : null;
  const headerDiscountRateLy =
    totalSalesTagLy > 0 ? (1 - totalSalesActLy / totalSalesTagLy) * 100 : null;

  return {
    asof_date: date,
    period_start_date: periodStartDate,
    mode,
    region,
    brand,
    header: {
      shop_cd: shopCd,
      shop_name: storeInfo.store_name,
      mode,
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
