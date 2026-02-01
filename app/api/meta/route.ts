import { NextResponse } from 'next/server';
import { getAvailableDates } from '@/lib/date-utils';
import { getAvailableBrands, getAvailableRegions } from '@/lib/store-utils';

/**
 * GET /api/meta
 * 
 * 대시보드 메타 정보 제공
 * - available_dates: 선택 가능한 날짜 목록 (최근 370일, 어제까지)
 * - brands: 선택 가능한 브랜드 ['M', 'X']
 * - regions: 선택 가능한 리전 ['HKMC', 'TW']
 */
export async function GET() {
  try {
    const meta = {
      available_dates: getAvailableDates(),
      brands: getAvailableBrands(),
      regions: getAvailableRegions(),
      brand_labels: {
        M: 'MLB',
        X: 'Discovery',
      },
      region_labels: {
        HKMC: 'HKMC',
        TW: 'TW (Coming Soon)',
      },
    };

    return NextResponse.json(meta);
  } catch (error: any) {
    console.error('Error in /api/meta:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metadata', message: error.message },
      { status: 500 }
    );
  }
}
