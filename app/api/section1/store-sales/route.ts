import { NextRequest, NextResponse } from 'next/server';
import { executeSnowflakeQuery } from '@/lib/snowflake';
import { getStoreMaster, normalizeBrand } from '@/lib/store-utils';
import { loadWeightDataServer, calculateMonthEndProjection, calculateProjectedYoY } from '@/lib/weight-utils';
import targetData from '@/data/target.json';

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

    // Store master 로드
    const storeMaster = getStoreMaster();
    const countries = region === 'HKMC' ? ['HK', 'MC'] : ['TW'];
    
    // Section 1용 매장: Warehouse 제외
    const targetStores = storeMaster.filter(s => 
      countries.includes(s.country) && 
      normalizeBrand(s.brand) === brand &&
      s.channel !== 'Warehouse'
    );

    if (targetStores.length === 0) {
      return NextResponse.json({
        asof_date: date,
        region,
        brand,
        hk_normal: [],
        hk_outlet: [],
        hk_online: [],
        mc_subtotal: null,
        total_subtotal: null,
      });
    }

    const storeCodes = targetStores.map(s => `'${s.store_code}'`).join(',');

    // 월초, 작년 월초/기준일 계산
    const asofDate = new Date(date);
    const year = asofDate.getFullYear();
    const month = asofDate.getMonth() + 1;
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const pyYear = year - 1;
    const pyMonthStart = `${pyYear}-${String(month).padStart(2, '0')}-01`;
    const pyAsofDate = `${pyYear}-${String(month).padStart(2, '0')}-${String(asofDate.getDate()).padStart(2, '0')}`;

    // 목표값 데이터 로드 (period 기준)
    const periodKey = `${year}-${String(month).padStart(2, '0')}`;
    const targetsByStore = (targetData as any)[periodKey] || {};

    // 가중치 데이터 로드 (서버 사이드)
    const weightMap = await loadWeightDataServer();

    // DW_HMD_SALE_D에서 직접 집계
    const query = `
      WITH current_mtd AS (
        SELECT
          LOCAL_SHOP_CD AS shop_cd,
          SUM(ACT_SALE_AMT) AS mtd_act
        FROM SAP_FNF.DW_HMD_SALE_D
        WHERE SALE_DT BETWEEN ? AND ?
          AND LOCAL_SHOP_CD IN (${storeCodes})
          AND BRD_CD IN ('M', 'I', 'X')
        GROUP BY LOCAL_SHOP_CD
      ),
      prev_year_mtd AS (
        SELECT
          LOCAL_SHOP_CD AS shop_cd,
          SUM(ACT_SALE_AMT) AS mtd_act_py
        FROM SAP_FNF.DW_HMD_SALE_D
        WHERE SALE_DT BETWEEN ? AND ?
          AND LOCAL_SHOP_CD IN (${storeCodes})
          AND BRD_CD IN ('M', 'I', 'X')
        GROUP BY LOCAL_SHOP_CD
      )
      SELECT
        COALESCE(c.shop_cd, p.shop_cd) AS shop_cd,
        COALESCE(c.mtd_act, 0) AS mtd_act,
        COALESCE(p.mtd_act_py, 0) AS mtd_act_py
      FROM current_mtd c
      FULL OUTER JOIN prev_year_mtd p ON c.shop_cd = p.shop_cd
      ORDER BY shop_cd
    `;

    const rows = await executeSnowflakeQuery(query, [
      monthStart, date,      // current MTD
      pyMonthStart, pyAsofDate  // previous year MTD
    ]);

    console.log('📊 Section1 Query Result:', {
      region,
      brand,
      date,
      monthStart,
      pyMonthStart,
      pyAsofDate,
      targetStoresCount: targetStores.length,
      rowsCount: rows.length,
      sampleRow: rows[0],
      allRows: rows.slice(0, 5), // 처음 5개 행 표시
      totalMtdAct: rows.reduce((sum, r) => sum + parseFloat(r.MTD_ACT || 0), 0),
      totalMtdActPy: rows.reduce((sum, r) => sum + parseFloat(r.MTD_ACT_PY || 0), 0),
    });

    // Store master 맵 생성
    const storeMap = new Map(targetStores.map(s => [s.store_code, s]));

    // 데이터 가공
    const hk_normal: any[] = [];
    const hk_outlet: any[] = [];
    const hk_online: any[] = [];
    const mc_normal: any[] = [];
    const mc_outlet: any[] = [];
    const mc_online: any[] = [];

    rows.forEach((row: any) => {
      const storeInfo = storeMap.get(row.SHOP_CD); // 대문자로 변경
      if (!storeInfo) return; // 매장 정보 없으면 스킵

      const mtd_act = parseFloat(row.MTD_ACT || 0); // 대문자로 변경
      const mtd_act_py = parseFloat(row.MTD_ACT_PY || 0); // 대문자로 변경
      const yoy = mtd_act_py > 0 ? (mtd_act / mtd_act_py) * 100 : 0; // 비율로 변경
      
      // 목표값 가져오기
      const targetInfo = targetsByStore[row.SHOP_CD];
      const target_mth = targetInfo ? targetInfo.target_mth : 0;
      const progress = target_mth > 0 ? (mtd_act / target_mth) * 100 : 0;

      // 월말환산 계산
      const monthEndProjection = calculateMonthEndProjection(mtd_act, date, weightMap);
      
      // 환산 YoY 계산
      const projectedYoY = calculateProjectedYoY(mtd_act, mtd_act_py, date, weightMap);

      const record = {
        shop_cd: row.SHOP_CD, // 대문자로 변경
        shop_name: storeInfo.store_name || row.SHOP_CD, // 매장명 사용
        country: storeInfo.country,
        channel: storeInfo.channel,
        target_mth, // 목표값 적용
        mtd_act,
        progress, // 목표 대비 달성률
        mtd_act_py,
        yoy,
        monthEndProjection, // 월말환산
        projectedYoY, // 환산 YoY
        forecast: null, // TODO: 예측값
      };

      if (storeInfo.country === 'HK') {
        if (storeInfo.channel === '정상') hk_normal.push(record);
        else if (storeInfo.channel === '아울렛') hk_outlet.push(record);
        else if (storeInfo.channel === '온라인') hk_online.push(record);
      } else if (storeInfo.country === 'MC') {
        if (storeInfo.channel === '정상') mc_normal.push(record);
        else if (storeInfo.channel === '아울렛') mc_outlet.push(record);
        else if (storeInfo.channel === '온라인') mc_online.push(record);
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

    // 채널별 합계 계산 함수
    const calculateSubtotal = (stores: any[], name: string, country: string, channel: string) => {
      if (stores.length === 0) return null;
      const target_mth = stores.reduce((sum, s) => sum + s.target_mth, 0);
      const mtd_act = stores.reduce((sum, s) => sum + s.mtd_act, 0);
      const mtd_act_py = stores.reduce((sum, s) => sum + s.mtd_act_py, 0);
      const progress = target_mth > 0 ? (mtd_act / target_mth) * 100 : 0;
      
      // 합계의 월말환산 계산
      const monthEndProjection = calculateMonthEndProjection(mtd_act, date, weightMap);
      
      // 합계의 환산 YoY 계산
      const projectedYoY = calculateProjectedYoY(mtd_act, mtd_act_py, date, weightMap);
      
      return {
        shop_cd: `${country}_${channel}_TOTAL`,
        shop_name: name,
        country,
        channel: '합계',
        target_mth,
        mtd_act,
        progress,
        mtd_act_py,
        yoy: mtd_act_py > 0 ? (mtd_act / mtd_act_py) * 100 : 0,
        monthEndProjection,
        projectedYoY,
        forecast: null,
      };
    };

    // HK 채널별 합계
    const hk_normal_subtotal = calculateSubtotal(hk_normal, 'HK 정상 합계', 'HK', '정상');
    const hk_outlet_subtotal = calculateSubtotal(hk_outlet, 'HK 아울렛 합계', 'HK', '아울렛');
    const hk_online_subtotal = calculateSubtotal(hk_online, 'HK 온라인 합계', 'HK', '온라인');

    // MC 채널별 합계
    const mc_normal_subtotal = calculateSubtotal(mc_normal, 'MC 정상 합계', 'MC', '정상');
    const mc_outlet_subtotal = calculateSubtotal(mc_outlet, 'MC 아울렛 합계', 'MC', '아울렛');
    const mc_online_subtotal = calculateSubtotal(mc_online, 'MC 온라인 합계', 'MC', '온라인');

    // MC 전체 합계
    const mc_all_stores = [...mc_normal, ...mc_outlet, ...mc_online];
    const mc_subtotal = calculateSubtotal(mc_all_stores, 'MC 전체', 'MC', '전체');

    // HKMC 전체 합계
    const all_stores = [...hk_normal, ...hk_outlet, ...hk_online, ...mc_normal, ...mc_outlet, ...mc_online];
    const total_subtotal = calculateSubtotal(all_stores, 'HKMC 전체', 'HKMC', '전체');

    const response = {
      asof_date: date,
      region,
      brand,
      hk_normal,
      hk_normal_subtotal,
      hk_outlet,
      hk_outlet_subtotal,
      hk_online,
      hk_online_subtotal,
      mc_normal,
      mc_normal_subtotal,
      mc_outlet,
      mc_outlet_subtotal,
      mc_online,
      mc_online_subtotal,
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
