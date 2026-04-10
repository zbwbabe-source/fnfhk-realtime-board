import { executeSnowflakeQuery } from '@/lib/snowflake';
import { getCategoryDetailName, getCategoryMapping } from '@/lib/category-utils';
import { getPeriodFromDateString, convertTwdToHkd } from '@/lib/exchange-rate-utils';
import { getSeasonCode } from '@/lib/date-utils';
import { getStoresByRegionBrandChannel } from '@/lib/store-utils';

type DetailMode = 'mtd' | 'ytd';
export type Section1CategoryDetailKey =
  | 'currentSeason'
  | 'nextSeason'
  | 'pastSeason'
  | 'hat'
  | 'shoes'
  | 'bag';

type SeasonPart = 'S' | 'F';

export interface Section1CategoryDetailRow {
  key: string;
  category_small: string;
  category_label: string;
  middle_category: string;
  sales_act: number;
  sales_yoy_pct: number | null;
  discount_rate: number | null;
  discount_rate_diff: number | null;
  sales_share_pct: number;
  sales_share_diff_pct: number | null;
}

export interface Section1CategoryDetailPayload {
  asof_date: string;
  period_start_date: string;
  mode: DetailMode;
  region: string;
  brand: string;
  category_key: Section1CategoryDetailKey;
  category_title: string;
  header: {
    sales_act: number;
    sales_yoy_pct: number | null;
    discount_rate: number | null;
    discount_rate_diff: number | null;
  };
  rows: Section1CategoryDetailRow[];
}

function parseSeasonCode(sesn: string): { yy: number; part: SeasonPart } | null {
  const match = String(sesn || '').trim().toUpperCase().match(/^(\d{2})([SF])$/);
  if (!match) return null;
  return { yy: Number(match[1]), part: match[2] as SeasonPart };
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

function getPeriodStartDate(date: string, mode: DetailMode): string {
  const current = new Date(date);
  if (mode === 'ytd') return `${current.getFullYear()}-01-01`;
  return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-01`;
}

function getLyDateString(date: string): string {
  const current = new Date(date);
  const ly = new Date(current);
  ly.setFullYear(current.getFullYear() - 1);
  const year = ly.getFullYear();
  const month = String(ly.getMonth() + 1).padStart(2, '0');
  const day = String(ly.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getSegmentForRow(
  targetDate: string,
  sesn: string,
  middleCategory: string
): Section1CategoryDetailKey | null {
  const currentSesn = getSeasonCode(new Date(targetDate));
  const nextSesn = getNextSeasonCode(currentSesn);
  const pastCutoffSesn = getPastSeasonCutoff(currentSesn);
  const sesnIdx = seasonIndex(sesn);
  const pastCutoffIdx = seasonIndex(pastCutoffSesn);

  if (middleCategory === 'Headwear') return 'hat';
  if (middleCategory === 'Shoes') return 'shoes';
  if (middleCategory === 'BAG') return 'bag';

  const isApparel = ['OUTER', 'INNER', 'BOTTOM', 'Wear_etc'].includes(middleCategory);
  if (!isApparel) return null;
  if (sesn === currentSesn) return 'currentSeason';
  if (sesn === nextSesn) return 'nextSeason';
  if (sesnIdx !== null && pastCutoffIdx !== null && sesnIdx <= pastCutoffIdx) return 'pastSeason';
  return null;
}

function getCategoryTitle(key: Section1CategoryDetailKey, seasonLabels: { current: string; next: string; past: string }) {
  switch (key) {
    case 'currentSeason':
      return `당시즌(${seasonLabels.current})`;
    case 'nextSeason':
      return `차시즌(${seasonLabels.next})`;
    case 'pastSeason':
      return `과시즌(${seasonLabels.past})`;
    case 'hat':
      return '모자';
    case 'shoes':
      return '신발';
    case 'bag':
      return '가방';
  }
}

export async function fetchSection1CategoryDetail({
  region,
  brand,
  date,
  categoryKey,
  mode,
}: {
  region: string;
  brand: string;
  date: string;
  categoryKey: Section1CategoryDetailKey;
  mode: DetailMode;
}): Promise<Section1CategoryDetailPayload> {
  const storeCodes = getStoresByRegionBrandChannel(region, brand, true);
  if (storeCodes.length === 0) {
    throw new Error(`No stores found for ${region}/${brand}`);
  }

  const periodStartDate = getPeriodStartDate(date, mode);
  const lyDate = getLyDateString(date);
  const lyPeriodStartDate = getPeriodStartDate(lyDate, mode);
  const isTwRegion = region === 'TW';
  const currentPeriod = isTwRegion ? getPeriodFromDateString(date) : '';
  const lyPeriod = isTwRegion ? getPeriodFromDateString(lyDate) : '';
  const applyCurrentRate = (amount: number) => (isTwRegion ? convertTwdToHkd(amount, currentPeriod) || 0 : amount);
  const applyLyRate = (amount: number) => (isTwRegion ? convertTwdToHkd(amount, lyPeriod) || 0 : amount);

  const placeholders = storeCodes.map(() => '?').join(',');
  const rows = await executeSnowflakeQuery(
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
        AND LOCAL_SHOP_CD IN (${placeholders})
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
      ...storeCodes,
      lyPeriodStartDate,
      date,
      lyPeriodStartDate,
      date,
      periodStartDate,
      date,
      lyPeriodStartDate,
      lyDate,
      lyPeriodStartDate,
      lyDate,
    ]
  );

  const currentSesn = getSeasonCode(new Date(date));
  const nextSesn = getNextSeasonCode(currentSesn);
  const pastCutoffSesn = getPastSeasonCutoff(currentSesn);

  const seasonLabels = {
    current: currentSesn,
    next: nextSesn,
    past: `~${pastCutoffSesn}`,
  };

  const rowMap = new Map<
    string,
    {
      key: string;
      category_small: string;
      category_label: string;
      middle_category: string;
      sales_act: number;
      sales_tag: number;
      sales_act_ly: number;
      sales_tag_ly: number;
    }
  >();

  rows.forEach((row: any) => {
    const sesn = String(row.SESN || '').trim().toUpperCase();
    const categorySmall = String(row.CATEGORY_SMALL || '').trim().toUpperCase();
    const mapping = getCategoryMapping(categorySmall);
    const middleCategory = mapping.middle || 'Unknown';
    const currentSegment = getSegmentForRow(date, sesn, middleCategory);
    const lySegment = getSegmentForRow(lyDate, sesn, middleCategory);
    const salesAct = applyCurrentRate(Number(row.SALES_ACT || 0));
    const salesTag = applyCurrentRate(Number(row.SALES_TAG || 0));
    const salesActLy = applyLyRate(Number(row.SALES_ACT_LY || 0));
    const salesTagLy = applyLyRate(Number(row.SALES_TAG_LY || 0));
    const detailName = getCategoryDetailName(categorySmall);
    const categoryLabel = detailName ? `${categorySmall} - ${detailName}` : categorySmall || '-';

    if (currentSegment === categoryKey) {
      const existing = rowMap.get(categorySmall) || {
        key: categorySmall,
        category_small: categorySmall,
        category_label: categoryLabel,
        middle_category: middleCategory,
        sales_act: 0,
        sales_tag: 0,
        sales_act_ly: 0,
        sales_tag_ly: 0,
      };
      existing.sales_act += salesAct;
      existing.sales_tag += salesTag;
      rowMap.set(categorySmall, existing);
    }

    if (lySegment === categoryKey) {
      const existing = rowMap.get(categorySmall) || {
        key: categorySmall,
        category_small: categorySmall,
        category_label: categoryLabel,
        middle_category: middleCategory,
        sales_act: 0,
        sales_tag: 0,
        sales_act_ly: 0,
        sales_tag_ly: 0,
      };
      existing.sales_act_ly += salesActLy;
      existing.sales_tag_ly += salesTagLy;
      rowMap.set(categorySmall, existing);
    }
  });

  const totals = Array.from(rowMap.values()).reduce(
    (acc, row) => {
      acc.sales_act += row.sales_act;
      acc.sales_tag += row.sales_tag;
      acc.sales_act_ly += row.sales_act_ly;
      acc.sales_tag_ly += row.sales_tag_ly;
      return acc;
    },
    { sales_act: 0, sales_tag: 0, sales_act_ly: 0, sales_tag_ly: 0 }
  );

  const headerDiscountRate = totals.sales_tag > 0 ? (1 - totals.sales_act / totals.sales_tag) * 100 : null;
  const headerDiscountRateLy = totals.sales_tag_ly > 0 ? (1 - totals.sales_act_ly / totals.sales_tag_ly) * 100 : null;

  const resultRows: Section1CategoryDetailRow[] = Array.from(rowMap.values())
    .map((row) => {
      const discountRate = row.sales_tag > 0 ? (1 - row.sales_act / row.sales_tag) * 100 : null;
      const discountRateLy = row.sales_tag_ly > 0 ? (1 - row.sales_act_ly / row.sales_tag_ly) * 100 : null;
      const salesSharePct = totals.sales_act > 0 ? (row.sales_act / totals.sales_act) * 100 : 0;
      const salesShareLyPct = totals.sales_act_ly > 0 ? (row.sales_act_ly / totals.sales_act_ly) * 100 : 0;

      return {
        key: row.key,
        category_small: row.category_small,
        category_label: row.category_label,
        middle_category: row.middle_category,
        sales_act: row.sales_act,
        sales_yoy_pct: row.sales_act_ly > 0 ? (row.sales_act / row.sales_act_ly) * 100 : null,
        discount_rate: discountRate,
        discount_rate_diff:
          discountRate !== null && discountRateLy !== null ? discountRate - discountRateLy : null,
        sales_share_pct: salesSharePct,
        sales_share_diff_pct:
          totals.sales_act_ly > 0 ? salesSharePct - salesShareLyPct : null,
      };
    })
    .sort((a, b) => b.sales_act - a.sales_act);

  return {
    asof_date: date,
    period_start_date: periodStartDate,
    mode,
    region,
    brand,
    category_key: categoryKey,
    category_title: getCategoryTitle(categoryKey, seasonLabels),
    header: {
      sales_act: totals.sales_act,
      sales_yoy_pct: totals.sales_act_ly > 0 ? (totals.sales_act / totals.sales_act_ly) * 100 : null,
      discount_rate: headerDiscountRate,
      discount_rate_diff:
        headerDiscountRate !== null && headerDiscountRateLy !== null ? headerDiscountRate - headerDiscountRateLy : null,
    },
    rows: resultRows,
  };
}
