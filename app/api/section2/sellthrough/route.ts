import { NextRequest, NextResponse } from 'next/server';
import { executeSnowflakeQuery } from '@/lib/snowflake';

export const dynamic = 'force-dynamic';

/**
 * GET /api/section2/sellthrough
 * 
 * Query Parameters:
 * - region: 'HKMC' or 'TW'
 * - brand: 'M' or 'X'
 * - date: 'YYYY-MM-DD' (asof_date)
 * 
 * Response:
 * - header: { sesn, overall_sellthrough }
 * - top10: 판매율 TOP 10 (inbound > 0만)
 * - bad10: 판매율 BAD 10 (inbound > 0만)
 * - no_inbound: 입고 없는 품번 리스트 (inbound = 0, sales > 0)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const region = searchParams.get('region') || 'HKMC';
    const brand = searchParams.get('brand') || 'M';
    const date = searchParams.get('date') || '';

    if (!date) {
      return NextResponse.json(
        { error: 'Missing required parameter: date' },
        { status: 400 }
      );
    }

    // 전체 데이터 조회
    const query = `
      SELECT 
        sesn,
        prdt_cd,
        category,
        inbound_tag,
        sales_tag,
        sellthrough
      FROM FNF.SAP_FNF.DASH_SEASON_SELLTHROUGH
      WHERE asof_date = ?
        AND region = ?
        AND brand = ?
      ORDER BY sellthrough DESC
    `;

    const rows = await executeSnowflakeQuery(query, [date, region, brand]);

    if (rows.length === 0) {
      return NextResponse.json({
        asof_date: date,
        region,
        brand,
        header: { sesn: 'N/A', overall_sellthrough: 0 },
        top10: [],
        bad10: [],
        no_inbound: [],
      });
    }

    // 시즌 코드 (첫 번째 row에서 추출)
    const sesn = rows[0].sesn;

    // inbound > 0 데이터만 필터
    const validRows = rows.filter((r: any) => parseFloat(r.inbound_tag || 0) > 0);

    // Overall sell-through 계산
    const totalInbound = validRows.reduce((sum: number, r: any) => sum + parseFloat(r.inbound_tag || 0), 0);
    const totalSales = validRows.reduce((sum: number, r: any) => sum + parseFloat(r.sales_tag || 0), 0);
    const overall_sellthrough = totalInbound > 0 ? (totalSales / totalInbound) * 100 : 0;

    // TOP 10 (sellthrough 높은 순)
    const top10 = validRows
      .sort((a: any, b: any) => parseFloat(b.sellthrough || 0) - parseFloat(a.sellthrough || 0))
      .slice(0, 10)
      .map((r: any) => ({
        prdt_cd: r.prdt_cd,
        category: r.category,
        inbound_tag: parseFloat(r.inbound_tag || 0),
        sales_tag: parseFloat(r.sales_tag || 0),
        sellthrough: parseFloat(r.sellthrough || 0) * 100, // 퍼센트로 변환
      }));

    // BAD 10 (sellthrough 낮은 순)
    const bad10 = validRows
      .sort((a: any, b: any) => parseFloat(a.sellthrough || 0) - parseFloat(b.sellthrough || 0))
      .slice(0, 10)
      .map((r: any) => ({
        prdt_cd: r.prdt_cd,
        category: r.category,
        inbound_tag: parseFloat(r.inbound_tag || 0),
        sales_tag: parseFloat(r.sales_tag || 0),
        sellthrough: parseFloat(r.sellthrough || 0) * 100,
      }));

    // No Inbound (inbound = 0, sales > 0)
    const no_inbound = rows
      .filter((r: any) => parseFloat(r.inbound_tag || 0) === 0 && parseFloat(r.sales_tag || 0) > 0)
      .slice(0, 10)
      .map((r: any) => ({
        prdt_cd: r.prdt_cd,
        category: r.category,
        sales_tag: parseFloat(r.sales_tag || 0),
      }));

    const response = {
      asof_date: date,
      region,
      brand,
      header: {
        sesn,
        overall_sellthrough: Math.round(overall_sellthrough * 100) / 100,
      },
      top10,
      bad10,
      no_inbound,
    };

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('Error in /api/section2/sellthrough:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sell-through data', message: error.message },
      { status: 500 }
    );
  }
}
