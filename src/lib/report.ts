type AiMetrics = {
  progressive_motility_percent?: number;
  non_progressive_motility_percent?: number;
  immotile_percent?: number;
  total_motility_percent?: number;
  tracked_sperm_count?: number;
  average_velocity_um_s?: number | null;
  confidence?: number;
};

export function buildClinicalSummary(metrics: AiMetrics) {
  const progressive = metrics.progressive_motility_percent ?? 0;
  const total = metrics.total_motility_percent ?? progressive + (metrics.non_progressive_motility_percent ?? 0);

  let band = "Below WHO lower reference range";
  if (progressive >= 32 && total >= 40) band = "Within WHO lower reference range for motility";
  else if (total >= 40) band = "Total motility acceptable, progressive motility below reference";

  const recommendation =
    band === "Within WHO lower reference range for motility"
      ? "The motility profile is within the WHO lower reference range for the analyzed video. Review alongside concentration, morphology, abstinence period, collection timing, and a clinician's assessment."
      : "Repeat semen analysis under controlled collection conditions and review with a fertility specialist. Consider full laboratory semen analysis including concentration, morphology, volume, pH, vitality, and leukocyte count.";

  const report = [
    `AI-assisted motility analysis classified ${progressive.toFixed(1)}% as progressive motility, ${(metrics.non_progressive_motility_percent ?? 0).toFixed(1)}% as non-progressive motility, and ${(metrics.immotile_percent ?? 0).toFixed(1)}% as immotile.`,
    `Total motility is ${total.toFixed(1)}%. The interpretation is: ${band}.`,
    `Tracked sperm count: ${metrics.tracked_sperm_count ?? 0}. Average estimated velocity: ${metrics.average_velocity_um_s?.toFixed(1) ?? "not calibrated"} um/s.`,
    recommendation,
    "This AI-assisted result is a laboratory decision-support output, not a standalone diagnosis. Final interpretation should be signed off by qualified laboratory staff or a physician."
  ].join("\n\n");

  return { band, recommendation, report };
}
