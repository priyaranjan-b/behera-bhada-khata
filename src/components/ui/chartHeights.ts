/**
 * The Billing vs Received chart's height: shorter on phones, where the
 * Overview's cards stack (A26). One constant, read by the chart's CSS box and
 * by its skeleton, so the page doesn't jump when the chart streams in.
 */
export const TREND_CHART_HEIGHT = { xs: 180, sm: 260 } as const;
