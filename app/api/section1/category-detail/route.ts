import { NextRequest, NextResponse } from 'next/server';
import { fetchSection1CategoryDetail, type Section1CategoryDetailKey } from '@/lib/section1/category-detail';

export const dynamic = 'force-dynamic';

const VALID_CATEGORY_KEYS = new Set<Section1CategoryDetailKey>([
  'currentSeason',
  'nextSeason',
  'pastSeason',
  'hat',
  'shoes',
  'bag',
]);

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const region = searchParams.get('region') || 'HKMC';
    const brand = searchParams.get('brand') || 'M';
    const date = searchParams.get('date') || '';
    const mode = searchParams.get('mode') === 'ytd' ? 'ytd' : 'mtd';
    const categoryKey = searchParams.get('category_key') as Section1CategoryDetailKey | null;

    if (!date || !date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return NextResponse.json({ error: 'Missing or invalid required parameter: date' }, { status: 400 });
    }

    if (!categoryKey || !VALID_CATEGORY_KEYS.has(categoryKey)) {
      return NextResponse.json({ error: 'Missing or invalid required parameter: category_key' }, { status: 400 });
    }

    const payload = await fetchSection1CategoryDetail({
      region,
      brand,
      date,
      categoryKey,
      mode,
    });

    return NextResponse.json(payload);
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Failed to fetch section1 category detail data',
        message: error.message,
      },
      { status: 500 }
    );
  }
}
