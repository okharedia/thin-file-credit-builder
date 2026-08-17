export function scoreBand(score: number): "LOW" | "MEDIUM" | "HIGH" {
  if (score < 50) {
    return "LOW";
  }

  return score < 75 ? "MEDIUM" : "HIGH";
}
