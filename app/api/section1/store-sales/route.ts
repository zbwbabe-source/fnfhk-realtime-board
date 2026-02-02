import { NextRequest, NextResponse } from 'next/server';
import { executeSnowflakeQuery } from '@/lib/snowflake';
import { getStoreMaster, normalizeBrand } from '@/lib/store-utils';
import { loadWeightDataServer, calculateMonthEndProjection, calculateProjectedYoY } from '@/lib/weight-utils';
import targetData from '@/data/target.json';

export const dynamic = 'force-dynamic';

/**
 * 매장별 YTD 목표 계산 함수
 * ytd_target = Σ TARGET_AMT(1월~직전월) + TARGET_AMT(당월) * (당일/당월말일)
 */
function calculateYtdTargetForStore(
  shopCd: string, 
  year: number, 
  currentMonth: number, 
  currentDay: number, 
  targetData: any
): number {
  let ytdTarget = 0;
  
  // 1월부터 직전월까지의 목표 합산
  for (let m = 1; m < currentMonth; m++) {
    const periodKey = `${year}-${String(m).padStart(2, '0')}`;
    const periodData = targetData[periodKey] || {};
    const storeTarget = periodData[shopCd];
    if (storeTarget) {
      ytdTarget += storeTarget.target_mth || 0;
    }
  }
  
  // 당월 목표 비례 계산
  const currentPeriodKey = `${year}-${String(currentMonth).padStart(2, '0')}`;
  const currentPeriodData = targetData[currentPeriodKey] || {};
  const currentStoreTarget = currentPeriodData[shopCd];
  
  if (currentStoreTarget) {
    // 당월 말일 계산
    const daysInMonth = new Date(year, currentMonth, 0).getDate();
    const ratio = currentDay / daysInMonth;
    
    // 당월 목표 × 비율
    ytdTarget += (currentStoreTarget.target_mth || 0) * ratio;
  }
  
  return ytdTarget;
}

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

    // 날짜 계산
    const asofDate = new Date(date);
    const year = asofDate.getFullYear();
    const month = asofDate.getMonth() + 1;

    // 목표값 데이터 로드 (period 기준)
    const periodKey = `${year}-${String(month).padStart(2, '0')}`;
    const targetsByStore = (targetData as any)[periodKey] || {};

    // 가중치 데이터 로드 (서버 사이드)
    const weightMap = await loadWeightDataServer();

    // MTD + YTD 동시 조회 쿼리
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
          
          /* MTD ACT PY */
          SUM(
            CASE
              WHEN SALE_DT BETWEEN DATEADD(YEAR, -1, DATE_TRUNC('MONTH', TO_DATE(?))) AND DATEADD(YEAR, -1, TO_DATE(?))
              THEN ACT_SALE_AMT ELSE 0
            END
          ) AS mtd_act_py,
          
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
          ) AS ytd_act_py
          
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
        CASE
          WHEN mtd_act_py > 0
          THEN ((mtd_act - mtd_act_py) / mtd_act_py) * 100
          ELSE 0
        END AS yoy,
        ytd_act,
        ytd_act_py,
        CASE
          WHEN ytd_act_py > 0
          THEN ((ytd_act - ytd_act_py) / ytd_act_py) * 100
          ELSE 0
        END AS yoy_ytd
      FROM store_sales
      ORDER BY shop_cd
    `;

    const rows = await executeSnowflakeQuery(query, [
      date, date,           // MTD current
      date, date,           // MTD PY
      date, date,           // YTD current
      date, date,           // YTD PY
      brand,                // brand filter
      date, date            // date range filter
    ]);

    console.log('📊 Section1 Query Result:', {
      region,
      brand,
      date,
      targetStoresCount: targetStores.length,
      rowsCount: rows.length,
      sampleRow: rows[0],
      totalMtdAct: rows.reduce((sum, r) => sum + parseFloat(r.MTD_ACT || 0), 0),
      totalMtdActPy: rows.reduce((sum, r) => sum + parseFloat(r.MTD_ACT_PY || 0), 0),
      totalYtdAct: rows.reduce((sum, r) => sum + parseFloat(r.YTD_ACT || 0), 0),
      totalYtdActPy: rows.reduce((sum, r) => sum + parseFloat(r.YTD_ACT_PY || 0), 0),
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
      const storeInfo = storeMap.get(row.SHOP_CD);
      if (!storeInfo) return;

      // MTD 데이터
      const mtd_act = parseFloat(row.MTD_ACT || 0);
      const mtd_act_py = parseFloat(row.MTD_ACT_PY || 0);
      const yoy = parseFloat(row.YOY || 0);
      
      // YTD 데이터
      const ytd_act = parseFloat(row.YTD_ACT || 0);
      const ytd_act_py = parseFloat(row.YTD_ACT_PY || 0);
      const yoy_ytd = parseFloat(row.YOY_YTD || 0);
      
      // MTD 목표값 가져오기
      const targetInfo = targetsByStore[row.SHOP_CD];
      const target_mth = targetInfo ? targetInfo.target_mth : 0;
      const progress = target_mth > 0 ? (mtd_act / target_mth) * 100 : 0;

      // YTD 목표 계산 (매장별)
      const ytd_target = calculateYtdTargetForStore(row.SHOP_CD, year, month, asofDate.getDate(), targetData);
      const progress_ytd = ytd_target > 0 ? (ytd_act / ytd_target) * 100 : 0;

      // 월말환산 계산 (MTD 기준)
      const monthEndProjection = calculateMonthEndProjection(mtd_act, date, weightMap);
      
      // 환산 YoY 계산 (MTD 기준)
      const projectedYoY = calculateProjectedYoY(mtd_act, mtd_act_py, date, weightMap);

      const record = {
        shop_cd: row.SHOP_CD,
        shop_name: storeInfo.store_name || row.SHOP_CD,
        country: storeInfo.country,
        channel: storeInfo.channel,
        
        // MTD 데이터
        target_mth,
        mtd_act,
        progress,
        mtd_act_py,
        yoy,
        monthEndProjection,
        projectedYoY,
        
        // YTD 데이터
        ytd_target,
        ytd_act,
        progress_ytd,
        ytd_act_py,
        yoy_ytd,
        
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
      
      // MTD 합계
      const target_mth = stores.reduce((sum, s) => sum + s.target_mth, 0);
      const mtd_act = stores.reduce((sum, s) => sum + s.mtd_act, 0);
      const mtd_act_py = stores.reduce((sum, s) => sum + s.mtd_act_py, 0);
      const progress = target_mth > 0 ? (mtd_act / target_mth) * 100 : 0;
      const yoy = mtd_act_py > 0 ? (mtd_act / mtd_act_py) * 100 : 0;
      
      // YTD 합계
      const ytd_target = stores.reduce((sum, s) => sum + s.ytd_target, 0);
      const ytd_act = stores.reduce((sum, s) => sum + s.ytd_act, 0);
      const ytd_act_py = stores.reduce((sum, s) => sum + s.ytd_act_py, 0);
      const progress_ytd = ytd_target > 0 ? (ytd_act / ytd_target) * 100 : 0;
      const yoy_ytd = ytd_act_py > 0 ? (ytd_act / ytd_act_py) * 100 : 0;
      
      // 합계의 월말환산 계산
      const monthEndProjection = calculateMonthEndProjection(mtd_act, date, weightMap);
      
      // 합계의 환산 YoY 계산
      const projectedYoY = calculateProjectedYoY(mtd_act, mtd_act_py, date, weightMap);
      
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
        yoy,
        monthEndProjection,
        projectedYoY,
        
        // YTD
        ytd_target,
        ytd_act,
        progress_ytd,
        ytd_act_py,
        yoy_ytd,
        
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
