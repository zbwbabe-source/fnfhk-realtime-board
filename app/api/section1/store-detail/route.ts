import { NextRequest, NextResponse } from 'next/server';
import { fetchSection1StoreDetail } from '@/lib/section1/store-detail';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const region = searchParams.get('region') || 'HKMC';
    const brand = searchParams.get('brand') || 'M';
    const date = searchParams.get('date') || '';
    const shopCd = searchParams.get('shop_cd') || '';
    const mode = searchParams.get('mode') === 'ytd' ? 'ytd' : 'mtd';

    if (!date || !date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return NextResponse.json({ error: 'Missing or invalid required parameter: date' }, { status: 400 });
    }

    if (!shopCd) {
      return NextResponse.json({ error: 'Missing required parameter: shop_cd' }, { status: 400 });
    }

    const payload = await fetchSection1StoreDetail({
      region,
      brand,
      date,
      shopCd,
      mode,
    });

    return NextResponse.json(payload);
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Failed to fetch store detail data',
        message: error.message,
      },
      { status: 500 }
    );
  }
}
