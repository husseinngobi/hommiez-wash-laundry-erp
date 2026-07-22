export enum PriceCategory {
  GENTS = 'gents',
  LADIES = 'ladies',
  GENERAL = 'general',
  HOME_SERVICES = 'home_services',
  KIDS = 'kids',
}

export enum PriceUnit {
  PIECE = 'piece',
  KG = 'kg',
}

export interface PriceItem {
  id: number;
  item_id: string; // e.g., "g1", "l1"
  name: string;
  category: PriceCategory;
  subcategory?: string;
  unit: PriceUnit;
  price: number; // washing price in UGX
  ironing_price: number; // ironing price in UGX
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PriceItemCreateDTO {
  item_id: string;
  name: string;
  category: PriceCategory;
  subcategory?: string;
  unit?: PriceUnit;
  price: number;
  ironing_price: number;
}

export interface PriceItemUpdateDTO {
  name?: string;
  category?: PriceCategory;
  subcategory?: string;
  unit?: PriceUnit;
  price?: number;
  ironing_price?: number;
  is_active?: boolean;
}
