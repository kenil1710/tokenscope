/**
 * Shapes returned by TokenScope's view methods.
 *
 * Unlike some GenLayer contracts, TokenScope's views return real objects rather
 * than JSON strings — `genlayer-js` hands back a parsed structure directly, so
 * nothing here needs `JSON.parse`. These types describe what the contract
 * actually returns; `lib/contract.ts` narrows the `found: false` variants away
 * before the UI sees them.
 */

export type ChainName = "ethereum" | "base" | "arbitrum" | "polygon";

export type RugLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type Badge =
  | "VERIFIED_SAFE"
  | "MODERATE_RISK"
  | "HIGH_RISK"
  | "RUG_WARNING"
  | "UNSCORED";

export type Confidence = "LOW" | "MEDIUM" | "HIGH";

export type Trend = "IMPROVING" | "STABLE" | "DEGRADING" | "NEW";

/** The five weighted dimensions, in the order the contract declares them. */
export const DIMENSIONS = [
  "distribution",
  "activity",
  "verification",
  "maturity",
  "liquidity",
] as const;

export type Dimension = (typeof DIMENSIONS)[number];

/** One stored risk record, as `get_risk` / `get_risk_by_id` return it. */
export type RiskRecord = {
  found: true;
  score_id: number;
  chain: ChainName;
  token_address: string;
  symbol: string;
  name: string;
  explorer_url: string;
  distribution_score: number;
  activity_score: number;
  verification_score: number;
  maturity_score: number;
  liquidity_score: number;
  overall_score: number;
  rug_level: RugLevel;
  rug_flags: string[];
  badge: Badge;
  confidence: Confidence;
  content_hash: string;
  sources_ok: string;
  scored_at: number;
  age_seconds: number;
  scorer: string;
  seq: number;
  rubric_version: string;
};

export type NotFound = {
  found: false;
  chain?: string;
  token_address?: string;
  badge?: "UNSCORED";
  score_id?: number;
  reason?: string;
};

export type RiskHistory = {
  found: boolean;
  chain: ChainName;
  token_address: string;
  symbol: string;
  update_count: number;
  capacity: number;
  best_overall: number;
  worst_overall: number;
  returned: number;
  scores: RiskRecord[];
};

export type RiskTrend = {
  found: boolean;
  chain: ChainName;
  token_address: string;
  symbol?: string;
  trend: Trend;
  latest_overall?: number;
  previous_overall?: number;
  delta?: number;
  window_delta?: number;
  samples?: number;
  rug_level?: RugLevel;
};

export type RugReport = {
  found: boolean;
  chain: ChainName;
  token_address: string;
  symbol?: string;
  rug_level: RugLevel | "UNKNOWN";
  rug_flags: string[];
  checks?: {
    is_mintable: boolean;
    is_pausable: boolean;
    has_blacklist: boolean;
    is_proxy: boolean;
    explorer_scam_flag: boolean;
    is_verified: boolean;
    owner_privilege_level: number;
  };
  mitigations?: {
    no_owner_surface: boolean;
    top_holder_is_contract: boolean;
    age_bucket: number;
  };
  abi_available?: boolean;
  badge?: Badge;
  scored_at?: number;
};

export type BadgeReport = {
  found: boolean;
  chain: ChainName;
  token_address: string;
  symbol?: string;
  badge: Badge;
  overall_score?: number;
  rug_level?: RugLevel;
  rug_flags?: string[];
  confidence?: Confidence;
  scored_at?: number;
};

export type BoardRow = {
  rank: number;
  token_address: string;
  symbol: string;
  overall_score: number;
  rug_level: RugLevel;
  badge: Badge;
  score_id: number;
  scored_at: number;
};

export type Leaderboard = {
  chain: ChainName;
  returned: number;
  tracked: number;
  board_size: number;
  tokens: BoardRow[];
};

export type DimensionComparison = {
  dimension: Dimension;
  a: number;
  b: number;
  delta: number;
  winner: "a" | "b" | "tie";
};

export type Comparison = {
  found: true;
  chain: ChainName;
  safer: "a" | "b" | "tie";
  reason: string;
  a: RiskRecord;
  b: RiskRecord;
  dimensions: DimensionComparison[];
  overall_delta: number;
};

export type ComparisonMissing = {
  found: false;
  chain: ChainName;
  unscored: string[];
  hint: string;
};

export type Verification = {
  found: boolean;
  valid?: boolean;
  score_id: number;
  chain?: ChainName;
  token_address?: string;
  symbol?: string;
  failed?: string[];
  recomputed?: Record<string, number | string | string[]>;
  content_hash?: string;
  rubric_version?: string;
  reason?: string;
};

export type Evidence = {
  found: boolean;
  score_id: number;
  chain?: ChainName;
  token_address?: string;
  symbol?: string;
  evidence?: Record<string, number>;
  ranges?: Record<string, number>;
  content_hash?: string;
  sources_ok?: string;
  scored_at?: number;
  rubric_version?: string;
};

export type ChainStat = {
  chain: ChainName;
  tokens_tracked: number;
  board_size: number;
};

export type Stats = {
  tokens_tracked: number;
  chains: ChainStat[];
  total_requests: number;
  total_scored: number;
  total_fees_wei: number | string;
  refunds_owed_wei: number | string;
  avg_overall: number;
  avg_distribution: number;
  avg_activity: number;
  avg_verification: number;
  avg_maturity: number;
  avg_liquidity: number;
  rug_levels: Record<RugLevel, number>;
  rubric_version: string;
};

export type Config = {
  fee_wei: number | string;
  max_fee_wei: number | string;
  paused: boolean;
  owner: string;
  rubric_version: string;
  quantization_step: number;
  chains: { chain: ChainName; api: string }[];
  dimensions: Dimension[];
  weights: Record<Dimension, number>;
  confidence_rule: string;
  rug_levels: RugLevel[];
  badges: Badge[];
  rate_limit_seconds: number;
  token_cooldown_seconds: number;
  history_cap: number;
  max_tokens: number;
  leaderboard_size: number;
  model_influence_points: string;
  feature_ranges: [string, number][];
};

/** What `request_risk` returns — it never throws once value is attached. */
export type ScanResult =
  | ({ status: "OK"; refund_wei: number | string } & RiskRecord)
  | { status: "REJECTED"; reason: string; refund_wei: number | string; hint: string };

export type TrackedTokens = { count: number; keys: string[] };
