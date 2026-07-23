export interface Print {
  scryfall_id: string;
  set: string;
  set_name: string;
  collector_number: string;
  rarity: string | null;
  released_at: string | null;
  image_small: string | null;
  image_normal: string | null;
  image_art_crop: string | null;
  image_png: string | null;
  image_back_small: string | null;
  image_back_normal: string | null;
  art_uri: string | null;
}

export interface CardFace {
  name: string;
  mana_cost: string;
  type_line: string;
  oracle_text: string;
  colors: string[];
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
}

export interface UbCard {
  oracle_id: string;
  name: string;
  oracle_text: string;
  mana_cost: string;
  type_line: string;
  colors: string[];
  color_identity: string[];
  cmc: number;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  keywords: string[];
  layout: string | null;
  rarity: string | null;
  released_at: string | null;
  ub_franchises: string[];
  official_uw_image: string | null;
  art_uri: string | null;
  prints: Print[];
  faces: CardFace[];
  reskin_count?: number;
}

export interface SearchResult {
  cards: UbCard[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
  warnings: string[];
}

export type ArtSource = "original" | "token" | "unset" | "alchemy";
export type ReskinStyle = "name-bottom" | "nickname-bar" | "code";

export interface Reskin {
  _id: string;
  oracle_id: string;
  designer_name: string;
  reskin_name: string;
  image_url: string;
  art_credit: string;
  style: ReskinStyle | string;
  art_source?: ArtSource | string;
  tags?: string[];
  is_recommended: boolean;
  face: number;
}

export interface SuggestResultItem {
  oracle_id: string;
  name: string;
  score: number;
  why: string[];
  art_uri: string | null;
  type_line: string;
}

export interface SuggestResponse {
  results: SuggestResultItem[];
  inferred_facets: { colors: string[]; roles: string[] };
}
