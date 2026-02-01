import storeMasterData from '@/data/store_master.json';

export interface StoreRecord {
  store_code: string;
  store_name: string;
  brand: string;
  country: string;
  channel: string;
}

interface StoreMasterJSON {
  stores: Array<{
    store_code: string;
    store_name: string;
    brand: string;
    country: string;
    channel: string;
  }>;
}

// MAIN WAREHOUSE 매핑 (HKMC MVP 기준)
export const MAIN_WAREHOUSE_MAPPING: Record<string, Record<string, string[]>> = {
  HKMC: {
    M: ['WHM'], // MLB (includes MLB Kids)
    X: ['XHM'], // Discovery
  },
  TW: {
    M: ['WTM'], // TODO: TW 구현 시 사용
    X: ['DTM'], // TODO: TW 구현 시 사용
  },
};

export function getStoreMaster(): StoreRecord[] {
  const data = storeMasterData as unknown as StoreMasterJSON;
  return data.stores.map(s => ({
    store_code: s.store_code,
    store_name: s.store_name,
    brand: s.brand,
    country: s.country,
    channel: s.channel,
  }));
}

export function normalizeBrand(brandCode: string): string {
  // BRD_CD가 'M' 또는 'I'인 경우 'M'로 통일
  if (brandCode === 'M' || brandCode === 'I') {
    return 'M';
  }
  // BRD_CD가 'X'인 경우 'X' 유지
  if (brandCode === 'X') {
    return 'X';
  }
  return brandCode;
}

export function getStoresByRegionBrandChannel(
  region: string,
  brand: string,
  excludeWarehouses: boolean = true
): string[] {
  const stores = getStoreMaster();
  const countries = region === 'HKMC' ? ['HK', 'MC'] : ['TW'];
  
  return stores
    .filter((s) => {
      // 국가 필터
      if (!countries.includes(s.country)) return false;
      
      // 브랜드 필터 (normalize 후 비교)
      const normalizedBrand = normalizeBrand(s.brand);
      if (normalizedBrand !== brand) return false;
      
      // Warehouse 제외 옵션
      if (excludeWarehouses && s.channel === 'Warehouse') return false;
      
      return true;
    })
    .map((s) => s.store_code);
}

export function getWarehouseStores(region: string, brand: string): string[] {
  const warehouses = MAIN_WAREHOUSE_MAPPING[region]?.[brand] || [];
  return warehouses;
}

export function getStoreInfo(storeCode: string): StoreRecord | undefined {
  const stores = getStoreMaster();
  return stores.find((s) => s.store_code === storeCode);
}

export function getStoresByChannel(
  region: string,
  brand: string,
  channel: string
): string[] {
  const stores = getStoreMaster();
  const countries = region === 'HKMC' ? ['HK', 'MC'] : ['TW'];
  
  return stores
    .filter((s) => {
      if (!countries.includes(s.country)) return false;
      const normalizedBrand = normalizeBrand(s.brand);
      if (normalizedBrand !== brand) return false;
      if (s.channel !== channel) return false;
      return true;
    })
    .map((s) => s.store_code);
}

export function getAvailableBrands(): string[] {
  return ['M', 'X'];
}

export function getAvailableRegions(): string[] {
  return ['HKMC', 'TW'];
}
