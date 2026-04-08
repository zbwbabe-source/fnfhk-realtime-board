import { NextRequest, NextResponse } from 'next/server';
import { executeSnowflakeQuery } from '@/lib/snowflake';
import { getAllStoresByRegionBrand, normalizeBrand } from '@/lib/store-utils';

export const dynamic = 'force-dynamic';

type InventorySeasonRow = {
  STOCK_DT_USED: string;
  SESN: string;
  STOCK_QTY: number;
  TAG_STOCK_AMT: number;
  COST_STOCK_AMT: number;
  SKU_COUNT: number;
  STORE_COUNT: number;
};

function formatNumber(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const region = (searchParams.get('region') || 'HKMC').trim().toUpperCase();
    const brand = normalizeBrand((searchParams.get('brand') || 'M').trim().toUpperCase());
    const date = (searchParams.get('date') || '').trim();

    if (!['HKMC', 'TW'].includes(region)) {
      return NextResponse.json({ error: 'Invalid region. Expected HKMC or TW.' }, { status: 400 });
    }

    if (!['M', 'X'].includes(brand)) {
      return NextResponse.json({ error: 'Invalid brand. Expected M or X.' }, { status: 400 });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date format. Expected YYYY-MM-DD.' }, { status: 400 });
    }

    const storeCodes = getAllStoresByRegionBrand(region, brand);
    if (storeCodes.length === 0) {
      return NextResponse.json({
        asOfDate: date,
        region,
        brand,
        stockDateUsed: null,
        currencyCode: region === 'TW' ? 'TWD' : 'HKD',
        rows: [],
      });
    }

    const escapedStoreCodes = storeCodes.map((code) => `'${code.replace(/'/g, "''")}'`).join(',');

    const sql = `
      WITH stock_base_dt AS (
        SELECT
          COALESCE(
            MAX(CASE WHEN STOCK_DT = DATEADD(day, 1, TO_DATE(?)) THEN STOCK_DT END),
            MAX(CASE WHEN STOCK_DT <= DATEADD(day, 1, TO_DATE(?)) THEN STOCK_DT END)
          ) AS stock_dt
        FROM SAP_FNF.DW_HMD_STOCK_SNAP_D
        WHERE (CASE WHEN BRD_CD IN ('M', 'I') THEN 'M' ELSE BRD_CD END) = ?
          AND LOCAL_SHOP_CD IN (${escapedStoreCodes})
      )
      SELECT
        TO_CHAR(d.stock_dt, 'YYYY-MM-DD') AS stock_dt_used,
        UPPER(TRIM(s.SESN)) AS sesn,
        COALESCE(SUM(s.STOCK_QTY), 0) AS stock_qty,
        COALESCE(SUM(s.TAG_STOCK_AMT), 0) AS tag_stock_amt,
        COALESCE(SUM(s.COST_STOCK_AMT), 0) AS cost_stock_amt,
        COUNT(DISTINCT s.PRDT_CD) AS sku_count,
        COUNT(DISTINCT s.LOCAL_SHOP_CD) AS store_count
      FROM SAP_FNF.DW_HMD_STOCK_SNAP_D s
      JOIN stock_base_dt d
        ON s.STOCK_DT = d.stock_dt
      WHERE (CASE WHEN s.BRD_CD IN ('M', 'I') THEN 'M' ELSE s.BRD_CD END) = ?
        AND s.LOCAL_SHOP_CD IN (${escapedStoreCodes})
        AND TRIM(COALESCE(s.SESN, '')) <> ''
      GROUP BY d.stock_dt, UPPER(TRIM(s.SESN))
      HAVING
        COALESCE(SUM(s.STOCK_QTY), 0) <> 0
        OR COALESCE(SUM(s.TAG_STOCK_AMT), 0) <> 0
        OR COALESCE(SUM(s.COST_STOCK_AMT), 0) <> 0
      ORDER BY
        TRY_TO_NUMBER(LEFT(UPPER(TRIM(s.SESN)), 2)) DESC NULLS LAST,
        CASE RIGHT(UPPER(TRIM(s.SESN)), 1)
          WHEN 'N' THEN 1
          WHEN 'F' THEN 2
          WHEN 'S' THEN 3
          ELSE 9
        END,
        UPPER(TRIM(s.SESN))
    `;

    const rows = await executeSnowflakeQuery<InventorySeasonRow>(sql, [date, date, brand, brand]);
    const normalizedRows = rows.map((row) => ({
      season: String(row.SESN || '').trim().toUpperCase(),
      stock_qty: formatNumber(row.STOCK_QTY),
      tag_stock_amt: formatNumber(row.TAG_STOCK_AMT),
      cost_stock_amt: formatNumber(row.COST_STOCK_AMT),
      sku_count: formatNumber(row.SKU_COUNT),
      store_count: formatNumber(row.STORE_COUNT),
    }));

    return NextResponse.json({
      asOfDate: date,
      region,
      brand,
      stockDateUsed: rows[0]?.STOCK_DT_USED || null,
      currencyCode: region === 'TW' ? 'TWD' : 'HKD',
      rows: normalizedRows,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Failed to export inventory by season',
        message: error.message,
      },
      { status: 500 }
    );
  }
}
