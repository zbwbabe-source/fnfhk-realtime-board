import { NextRequest, NextResponse } from 'next/server';
import { executeSnowflakeQuery } from '@/lib/snowflake';
import { getStoreMaster } from '@/lib/store-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/section1/store-sales
 * 
 * Query Parameters:
 * - region: 'HKMC' or 'TW'
 * - brand: 'M' or 'X'
 * - date: 'YYYY-MM-DD' (asof_date)
 * 
 * Response:
 * - hk_normal: HK 정상 매장 리스트
 * - hk_outlet: HK 아울렛 매장 리스트
 * - hk_online: HK 온라인 채널 리스트
 * - mc_subtotal: MC 전체 합계 (1 row)
 * - total_subtotal: HKMC 전체 합계 (1 row)
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

    // Snowflake에서 DASH_STORE_MTD_SALES 조회
    const query = `
      SELECT 
        shop_cd,
        country,
        channel,
        target_mth,
        mtd_act,
        mtd_act_py,
        yoy
      FROM FNF.SAP_FNF.DASH_STORE_MTD_SALES
      WHERE asof_date = ?
        AND region = ?
        AND brand = ?
      ORDER BY country, channel, shop_cd
    `;

    const rows = await executeSnowflakeQuery(query, [date, region, brand]);

    // Store master 로드
    const storeMaster = getStoreMaster();
    const storeMap = new Map(storeMaster.map(s => [s.store_code, s]));

    // 데이터 가공
    const hk_normal: any[] = [];
    const hk_outlet: any[] = [];
    const hk_online: any[] = [];
    const mc_stores: any[] = [];

    rows.forEach((row: any) => {
      const storeInfo = storeMap.get(row.shop_cd);
      const record = {
        shop_cd: row.shop_cd,
        shop_name: storeInfo ? `${row.shop_cd}` : row.shop_cd,
        country: row.country,
        channel: row.channel,
        target_mth: parseFloat(row.target_mth || 0),
        mtd_act: parseFloat(row.mtd_act || 0),
        mtd_act_py: parseFloat(row.mtd_act_py || 0),
        yoy: parseFloat(row.yoy || 0),
        progress: 0, // TODO: 목표 대비 달성률 (목표값 추후 연동)
        forecast: null, // TODO: 예측값 (추후 구현)
      };

      if (row.country === 'HK') {
        if (row.channel === '정상') hk_normal.push(record);
        else if (row.channel === '아울렛') hk_outlet.push(record);
        else if (row.channel === '온라인') hk_online.push(record);
      } else if (row.country === 'MC') {
        mc_stores.push(record);
      }
    });

    // MC 소계 (전체 합산)
    const mc_subtotal = mc_stores.length > 0 ? {
      shop_cd: 'MC_TOTAL',
      shop_name: 'MC 소계',
      country: 'MC',
      channel: '합계',
      target_mth: mc_stores.reduce((sum, s) => sum + s.target_mth, 0),
      mtd_act: mc_stores.reduce((sum, s) => sum + s.mtd_act, 0),
      mtd_act_py: mc_stores.reduce((sum, s) => sum + s.mtd_act_py, 0),
      yoy: 0, // 재계산
      progress: 0,
      forecast: null,
    } : null;

    if (mc_subtotal && mc_subtotal.mtd_act_py > 0) {
      mc_subtotal.yoy = ((mc_subtotal.mtd_act - mc_subtotal.mtd_act_py) / mc_subtotal.mtd_act_py) * 100;
    }

    // 전체 소계 (HK + MC)
    const all_stores = [...hk_normal, ...hk_outlet, ...hk_online, ...mc_stores];
    const total_subtotal = all_stores.length > 0 ? {
      shop_cd: 'HKMC_TOTAL',
      shop_name: 'HKMC 전체',
      country: 'HKMC',
      channel: '합계',
      target_mth: all_stores.reduce((sum, s) => sum + s.target_mth, 0),
      mtd_act: all_stores.reduce((sum, s) => sum + s.mtd_act, 0),
      mtd_act_py: all_stores.reduce((sum, s) => sum + s.mtd_act_py, 0),
      yoy: 0,
      progress: 0,
      forecast: null,
    } : null;

    if (total_subtotal && total_subtotal.mtd_act_py > 0) {
      total_subtotal.yoy = ((total_subtotal.mtd_act - total_subtotal.mtd_act_py) / total_subtotal.mtd_act_py) * 100;
    }

    const response = {
      asof_date: date,
      region,
      brand,
      hk_normal,
      hk_outlet,
      hk_online,
      mc_subtotal,
      total_subtotal,
    };

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('Error in /api/section1/store-sales:', error);
    return NextResponse.json(
      { error: 'Failed to fetch store sales data', message: error.message },
      { status: 500 }
    );
  }
}
