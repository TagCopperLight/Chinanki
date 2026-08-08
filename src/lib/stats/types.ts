export interface HeatmapDay {
  /** YYYY-MM-DD study-day key. */
  date: string;
  count: number;
  /** 0 = no reviews, 1–4 = quartile buckets used for colour intensity. */
  level: 0 | 1 | 2 | 3 | 4;
}

export interface ForecastDay {
  date: string;
  dueCount: number;
  cumulative: number;
}

export interface RetentionSummary {
  reviewed: number;
  correct: number;
  rate: number;
}

export interface CardBreakdown {
  new: number;
  learning: number;
  young: number;
  mature: number;
  suspended: number;
}
