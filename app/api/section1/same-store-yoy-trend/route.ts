import { NextRequest, NextResponse } from 'next/server';
import { executeSnowflakeQuery } from '@/lib/snowflake';
import { getStoreMaster, normalizeBrand } from '@/lib/store-utils';
import { convertTwdToHkd, getPeriodFromDateString } from '@/lib/exchange-rate-utils';
import { getSnapshot, setSnapshot } from '@/lib/snapshotCache';
import { formatDateYYYYMMDD, getYesterday } from '@/lib/date-utils';

export const dynamic = 'force-dynamic';

function formatDateToYmd(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function shiftYears(date: Date, years: number) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const region = searchParams.get('region') || 'HKMC';
    const brand = searchParams.get('brand') || 'M';
    const date = searchParams.get('date') || '';
    const window = (searchParams.get('window') || 'all') as 'all' | '120d' | '30d' | '7d';

    if (!date) {
      return NextResponse.json({ error: 'date is required' }, { status: 400 });
    }

    const asofDate = new Date(`${date}T00:00:00`);
    if (Number.isNaN(asofDate.getTime())) {
      return NextResponse.json({ error: 'invalid date' }, { status: 400 });
    }

    const resource = `same-store-yoy-trend-${window}`;
    const snapshot = await getSnapshot<any>('SECTION1', resource, region, brand, date);
    if (snapshot) {
      return NextResponse.json(snapshot.payload);
    }

    const storeMaster = getStoreMaster();
    const countries = region === 'HKMC' ? ['HK', 'MC'] : ['TW'];
    const targetStores = storeMaster.filter(
      (store) =>
        countries.includes(store.country) &&
        normalizeBrand(store.brand) === brand &&
        store.channel !== 'Warehouse'
    );

    const shopCodes = targetStores.map((store) => String(store.store_code || '')).filter(Boolean);
    if (shopCodes.length === 0) {
      return NextResponse.json({ rows: [] });
    }

    const startDate =
      window === 'all'
        ? new Date(asofDate.getFullYear(), 0, 1)
        : addDays(asofDate, -(window === '7d' ? 6 : window === '30d' ? 29 : 119));
    const previousStartDate = shiftYears(startDate, -1);
    const previousEndDate = shiftYears(asofDate, -1);
    const storeCodesSql = shopCodes.map((code) => `'${code.replace(/'/g, "''")}'`).join(',');

    const rows = await executeSnowflakeQuery(
      `
        SELECT
          LOCAL_SHOP_CD AS shop_cd,
          TO_DATE(SALE_DT) AS sale_dt,
          SUM(ACT_SALE_AMT) AS sales_amt
        FROM SAP_FNF.DW_HMD_SALE_D
        WHERE
          (CASE WHEN BRD_CD IN ('M','I') THEN 'M' ELSE BRD_CD END) = ?
          AND LOCAL_SHOP_CD IN (${storeCodesSql})
          AND (
            TO_DATE(SALE_DT) BETWEEN TO_DATE(?) AND TO_DATE(?)
            OR TO_DATE(SALE_DT) BETWEEN TO_DATE(?) AND TO_DATE(?)
          )
        GROUP BY LOCAL_SHOP_CD, TO_DATE(SALE_DT)
        ORDER BY LOCAL_SHOP_CD, TO_DATE(SALE_DT)
      `,
      [brand, formatDateToYmd(startDate), date, formatDateToYmd(previousStartDate), formatDateToYmd(previousEndDate)]
    );

    const isTwRegion = region === 'TW';
    const period = isTwRegion ? getPeriodFromDateString(date) : '';
    const applyExchangeRate = (amount: number) => {
      if (!isTwRegion) return amount;
      return convertTwdToHkd(amount, period) || 0;
    };

    const salesMap = new Map<string, number>();
    rows.forEach((row: any) => {
      const shopCd = String(row.SHOP_CD || row.shop_cd || '');
      const rawSaleDate = row.SALE_DT;
      const parsedDate = rawSaleDate instanceof Date ? rawSaleDate : new Date(rawSaleDate);
      if (!shopCd || Number.isNaN(parsedDate.getTime())) return;
      salesMap.set(`${shopCd}:${formatDateToYmd(parsedDate)}`, applyExchangeRate(parseFloat(row.SALES_AMT || 0)));
    });

    const sumBetween = (shopCd: string, from: Date, to: Date) => {
      let sum = 0;
      for (let current = new Date(from); current <= to; current = addDays(current, 1)) {
        sum += salesMap.get(`${shopCd}:${formatDateToYmd(current)}`) || 0;
      }
      return sum;
    };

    const eligibleCodes = shopCodes.filter((shopCd) => {
      const currentSales = sumBetween(shopCd, startDate, asofDate);
      const previousSales = sumBetween(shopCd, previousStartDate, previousEndDate);
      return currentSales > 0 && previousSales > 0;
    });

    let cumulativeCurrentSales = 0;
    let cumulativeLySales = 0;
    const trendDays = Math.floor((asofDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    const trendRows = Array.from({ length: trendDays }, (_, index) => {
      const currentDate = addDays(startDate, index);
      const currentDateKey = formatDateToYmd(currentDate);
      const comparableDateKey = formatDateToYmd(shiftYears(currentDate, -1));
      const currentSales = eligibleCodes.reduce((sum, shopCd) => sum + (salesMap.get(`${shopCd}:${currentDateKey}`) || 0), 0);
      const previousSales = eligibleCodes.reduce((sum, shopCd) => sum + (salesMap.get(`${shopCd}:${comparableDateKey}`) || 0), 0);

      cumulativeCurrentSales += currentSales;
      cumulativeLySales += previousSales;

      return {
        date: currentDateKey,
        label: `${currentDate.getMonth() + 1}/${currentDate.getDate()}`,
        hkmcYoy: null,
        twYoy: null,
        yoy: cumulativeLySales > 0 ? (cumulativeCurrentSales / cumulativeLySales) * 100 : null,
        sales_act: cumulativeCurrentSales,
        sales_act_ly: cumulativeLySales,
        daily_sales: currentSales,
        daily_sales_ly: previousSales,
      };
    });

    const payload = { rows: trendRows, eligibleCount: eligibleCodes.length };
    const latestStableDate = formatDateYYYYMMDD(getYesterday());
    const ttlSeconds = date >= latestStableDate ? 60 * 60 : 60 * 60 * 24 * 14;

    try {
      await setSnapshot('SECTION1', resource, region, brand, date, payload, ttlSeconds);
    } catch (cacheError: any) {
      console.error('[same-store-yoy-trend] cache save failed:', cacheError.message);
    }

    return NextResponse.json(payload);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'failed to load same-store trend' }, { status: 500 });
  }
}
