const timestamps: number[] = [];
const LIMIT = 2;
const WINDOW_MS = 60_000;

export function checkFloodLimit(): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const recent = timestamps.filter((t) => now - t < WINDOW_MS);
  timestamps.length = 0;
  timestamps.push(...recent);

  if (recent.length >= LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  timestamps.push(now);
  return { allowed: true, remaining: LIMIT - recent.length - 1 };
}

export function resetFloodLimit(): void {
  timestamps.length = 0;
}
