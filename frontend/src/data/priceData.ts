// Price catalog data for Hommiez Wash Laundry and Dry Cleaners
// All prices in Ugandan Shillings (UGX)

export interface PriceItem {
  id: string;
  name: string;
  price: number;
  category: 'gents' | 'ladies' | 'general' | 'kids';
  subcategory?: string;
  ironingPrice: number;
}

export const priceCategories = {
  gents: { label: 'Gents', icon: '🧥', color: 'primary' },
  ladies: { label: 'Ladies', icon: '👗', color: 'secondary' },
  general: { label: 'General', icon: '🧺', color: 'accent' },
  kids: { label: 'Kids', icon: '👶', color: 'success' },
} as const;

export const priceItems: PriceItem[] = [
  // GENTS
  { id: 'g1', name: "Men's 2pc Suit", price: 15000, category: 'gents', ironingPrice: 7500 },
  { id: 'g2', name: "Men's 3pc Suit", price: 17000, category: 'gents', ironingPrice: 8500 },
  { id: 'g3', name: "Trousers", price: 7000, category: 'gents', ironingPrice: 3500 },
  { id: 'g4', name: "Jeans", price: 8000, category: 'gents', ironingPrice: 4000 },
  { id: 'g5', name: "Trouser Linen", price: 10000, category: 'gents', ironingPrice: 5000 },
  { id: 'g6', name: "Coats", price: 11000, category: 'gents', ironingPrice: 5500 },
  { id: 'g7', name: "Coat Linen", price: 13000, category: 'gents', ironingPrice: 6500 },
  { id: 'g8', name: "Kanzu", price: 10000, category: 'gents', ironingPrice: 5000 },
  { id: 'g9', name: "Kaunda Suit", price: 15000, category: 'gents', ironingPrice: 7500 },
  { id: 'g10', name: "Tracksuit", price: 11000, category: 'gents', ironingPrice: 5500 },
  { id: 'g11', name: "Coloured Shirts", price: 8000, category: 'gents', ironingPrice: 4000 },
  { id: 'g12', name: "White Shirts", price: 7000, category: 'gents', ironingPrice: 3500 },
  { id: 'g13', name: "Shirt Linen", price: 9000, category: 'gents', ironingPrice: 4500 },
  { id: 'g14', name: "T-shirt", price: 6000, category: 'gents', ironingPrice: 3000 },
  { id: 'g15', name: "Under Shirt", price: 5000, category: 'gents', ironingPrice: 2500 },
  { id: 'g16', name: "Tie", price: 4000, category: 'gents', ironingPrice: 2000 },
  { id: 'g17', name: "Shorts", price: 6000, category: 'gents', ironingPrice: 3000 },
  { id: 'g18', name: "Jacket", price: 10000, category: 'gents', ironingPrice: 5000 },
  { id: 'g19', name: "Nigerian Wear", price: 20000, category: 'gents', ironingPrice: 10000 },
  { id: 'g20', name: "Kitenge", price: 8000, category: 'gents', ironingPrice: 4000 },
  { id: 'g21', name: "Under Short", price: 5000, category: 'gents', ironingPrice: 2500 },
  { id: 'g22', name: "Waistcoat", price: 8000, category: 'gents', ironingPrice: 4000 },
  { id: 'g23', name: "Jumper/Sweater", price: 8000, category: 'gents', ironingPrice: 4000 },
  { id: 'g24', name: "Hat", price: 3000, category: 'gents', ironingPrice: 1500 },
  { id: 'g25', name: "Winter Coat", price: 6000, category: 'gents', ironingPrice: 3000 },

  // LADIES
  { id: 'l1', name: "Women's Suit", price: 15000, category: 'ladies', ironingPrice: 7500 },
  { id: 'l2', name: "Casual Wear", price: 10000, category: 'ladies', ironingPrice: 5000 },
  { id: 'l3', name: "Dress Long", price: 15000, category: 'ladies', ironingPrice: 7500 },
  { id: 'l4', name: "Dress Short", price: 10000, category: 'ladies', ironingPrice: 5000 },
  { id: 'l5', name: "Changing Gown (Beaded)", price: 30000, category: 'ladies', ironingPrice: 15000 },
  { id: 'l6', name: "Skirt (Pleated)", price: 6000, category: 'ladies', ironingPrice: 3000 },
  { id: 'l7', name: "Skirt (Straight)", price: 7000, category: 'ladies', ironingPrice: 3500 },
  { id: 'l8', name: "Blouse (Ordinary)", price: 5000, category: 'ladies', ironingPrice: 2500 },
  { id: 'l9', name: "Blouse (Silk)", price: 7000, category: 'ladies', ironingPrice: 3500 },
  { id: 'l10', name: "Dress Shirt", price: 10000, category: 'ladies', ironingPrice: 5000 },
  { id: 'l11', name: "Sweater/Cardigan", price: 8000, category: 'ladies', ironingPrice: 4000 },
  { id: 'l12', name: "Kitenge/Ankara", price: 10000, category: 'ladies', ironingPrice: 5000 },
  { id: 'l13', name: "Skambo/Hybrids", price: 8000, category: 'ladies', ironingPrice: 4000 },
  { id: 'l14', name: "Corset/Heavies", price: 15000, category: 'ladies', ironingPrice: 7500 },
  { id: 'l15', name: "Gown Silk", price: 15000, category: 'ladies', ironingPrice: 7500 },
  { id: 'l16', name: "Gown (Beaded)", price: 18000, category: 'ladies', ironingPrice: 9000 },
  { id: 'l17', name: "Cocktail Dress Long", price: 15000, category: 'ladies', ironingPrice: 7500 },
  { id: 'l18', name: "Cocktail Dress Short", price: 10000, category: 'ladies', ironingPrice: 5000 },
  { id: 'l19', name: "Indian Wear", price: 20000, category: 'ladies', ironingPrice: 10000 },
  { id: 'l20', name: "Bridal Gown (Small)", price: 50000, category: 'ladies', ironingPrice: 25000 },
  { id: 'l21', name: "Bridal Gown (Medium)", price: 80000, category: 'ladies', ironingPrice: 40000 },
  { id: 'l22', name: "Bridal Gown (Full)", price: 120000, category: 'ladies', ironingPrice: 60000 },
  { id: 'l23', name: "Bridal Gown (Standard)", price: 100000, category: 'ladies', ironingPrice: 50000 },
  { id: 'l24', name: "Women Vest", price: 6000, category: 'ladies', ironingPrice: 3000 },
  { id: 'l25', name: "Bra/Underwear", price: 10000, category: 'ladies', ironingPrice: 5000 },
  { id: 'l26', name: "Handbag", price: 7000, category: 'ladies', ironingPrice: 0 },

  // GENERAL (Household)
  { id: 'h1', name: "Bed Cover (Big)", price: 25000, category: 'general', subcategory: 'Bedding', ironingPrice: 12500 },
  { id: 'h2', name: "Bed Cover/Duvet (Medium)", price: 20000, category: 'general', subcategory: 'Bedding', ironingPrice: 10000 },
  { id: 'h3', name: "Bed Cover/Duvet (Small)", price: 15000, category: 'general', subcategory: 'Bedding', ironingPrice: 7500 },
  { id: 'h4', name: "Blanket (Big)", price: 40000, category: 'general', subcategory: 'Bedding', ironingPrice: 20000 },
  { id: 'h5', name: "Blanket (Medium)", price: 35000, category: 'general', subcategory: 'Bedding', ironingPrice: 17500 },
  { id: 'h6', name: "Blanket (Small)", price: 30000, category: 'general', subcategory: 'Bedding', ironingPrice: 15000 },
  { id: 'h7', name: "Bed Sheet (Pair)", price: 10000, category: 'general', subcategory: 'Bedding', ironingPrice: 5000 },
  { id: 'h8', name: "Bed Sheet (Pair, King Size)", price: 15000, category: 'general', subcategory: 'Bedding', ironingPrice: 7500 },
  { id: 'h9', name: "Bath Towel (Small)", price: 7000, category: 'general', subcategory: 'Bathroom', ironingPrice: 3500 },
  { id: 'h10', name: "Bath Towel (Big)", price: 10000, category: 'general', subcategory: 'Bathroom', ironingPrice: 5000 },
  { id: 'h11', name: "Bath Robe", price: 14000, category: 'general', subcategory: 'Bathroom', ironingPrice: 7000 },
  { id: 'h12', name: "Carpet (Small)", price: 40000, category: 'general', subcategory: 'Floor', ironingPrice: 0 },
  { id: 'h13', name: "Carpet (Medium)", price: 60000, category: 'general', subcategory: 'Floor', ironingPrice: 0 },
  { id: 'h14', name: "Carpet (Big)", price: 80000, category: 'general', subcategory: 'Floor', ironingPrice: 0 },
  { id: 'h15', name: "Carpet (Large)", price: 100000, category: 'general', subcategory: 'Floor', ironingPrice: 0 },
  { id: 'h16', name: "Carpet (Wall-to-Wall)", price: 150000, category: 'general', subcategory: 'Floor', ironingPrice: 0 },
  { id: 'h17', name: "Curtain (Heavy)", price: 15000, category: 'general', subcategory: 'Window', ironingPrice: 7500 },
  { id: 'h18', name: "Curtain (Light)", price: 12000, category: 'general', subcategory: 'Window', ironingPrice: 6000 },
  { id: 'h19', name: "Curtain Nets (Heavy)", price: 18000, category: 'general', subcategory: 'Window', ironingPrice: 9000 },
  { id: 'h20', name: "Curtain Nets (Light)", price: 10000, category: 'general', subcategory: 'Window', ironingPrice: 5000 },
  { id: 'h21', name: "Pillow", price: 8000, category: 'general', subcategory: 'Bedding', ironingPrice: 4000 },
  { id: 'h22', name: "Rug", price: 10000, category: 'general', subcategory: 'Floor', ironingPrice: 0 },
  { id: 'h23', name: "Mosquito Net", price: 10000, category: 'general', subcategory: 'Bedding', ironingPrice: 5000 },
  { id: 'h24', name: "Pillow Cover (Pair)", price: 5000, category: 'general', subcategory: 'Bedding', ironingPrice: 2500 },
  { id: 'h25', name: "Graduation Gown", price: 15000, category: 'general', subcategory: 'Special', ironingPrice: 7500 },
  { id: 'h26', name: "Temperature Jacket", price: 8000, category: 'general', subcategory: 'Outerwear', ironingPrice: 4000 },
  { id: 'h27', name: "Apron (Full)", price: 7000, category: 'general', subcategory: 'Special', ironingPrice: 3500 },

  // HOME SERVICES
  { id: 's1', name: "Duvet/Bedcover Washing", price: 100000, category: 'home_services', ironingPrice: 0 },
  { id: 's2', name: "Curtain Steaming", price: 50000, category: 'home_services', ironingPrice: 0 },
  { id: 's3', name: "Upholstery & Carpet", price: 0, category: 'home_services', ironingPrice: 0 },
  { id: 's4', name: "Sofa Shampooing", price: 0, category: 'home_services', ironingPrice: 0 },
  { id: 's5', name: "Mattress Shampooing", price: 0, category: 'home_services', ironingPrice: 0 },

  // KIDS
  { id: 'k1', name: "Kids Suit", price: 10000, category: 'kids', ironingPrice: 5000 },
  { id: 'k2', name: "Dress", price: 7000, category: 'kids', ironingPrice: 3500 },
  { id: 'k3', name: "Jeans", price: 4000, category: 'kids', ironingPrice: 2000 },
  { id: 'k4', name: "Trouser", price: 4000, category: 'kids', ironingPrice: 2000 },
  { id: 'k5', name: "Top", price: 3000, category: 'kids', ironingPrice: 1500 },
  { id: 'k6', name: "Sweater", price: 5000, category: 'kids', ironingPrice: 2500 },
];

export const formatUGX = (amount: number): string => {
  if (amount === undefined || amount === null) return 'UGX 0';
  if (amount === 0) return 'On Request';
  return `UGX ${amount.toLocaleString('en-UG')}`;
};

export const getItemsByCategory = (category: keyof typeof priceCategories) => {
  return priceItems.filter(item => item.category === category);
};
