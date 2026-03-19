export interface StoreRecord {
  store_code: string;
  brand: string;
  country: string;
  channel: string;
}

export interface StoreSalesRow {
  shop_cd: string;
  shop_name: string;
  country: string;
  channel: string;
  target_mth: number;
  mtd_act: number;
  actual_mtd?: number;
  mtd_act_py: number;
  yoy: number;
  progress: number;
  ytd_act?: number;
  actual_ytd?: number;
  forecast: number | null;
  forecast_source?: 'excel' | null;
  forecast_months?: Array<{
    month: string;
    amount: number;
  }>;
}

export interface ProductRow {
  prdt_cd: string;
  category: string;
  inbound_tag: number;
  sales_tag: number;
  sellthrough: number;
}

export interface NoInboundRow {
  prdt_cd: string;
  category: string;
  sales_tag: number;
}

export interface Section1Response {
  asof_date: string;
  base_month?: string;
  region: string;
  brand: string;
  forecast_source?: 'excel' | null;
  forecast_months?: Array<{
    month: string;
    amount: number;
  }>;
  hk_normal: StoreSalesRow[];
  hk_outlet: StoreSalesRow[];
  hk_online: StoreSalesRow[];
  mc_subtotal: StoreSalesRow | null;
  total_subtotal: StoreSalesRow | null;
}

export interface Section2Response {
  asof_date: string;
  region: string;
  brand: string;
  header: {
    sesn: string;
    overall_sellthrough: number;
  };
  top10: ProductRow[];
  bad10: ProductRow[];
  no_inbound: NoInboundRow[];
}

export interface MetaResponse {
  available_dates: string[];
  brands: string[];
  regions: string[];
  brand_labels: Record<string, string>;
  region_labels: Record<string, string>;
}
