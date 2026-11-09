// The shared clock ramps from rest, cruises, then settles to rest.
// Normalize the distance so steady and smooth playback take the same time.
const ramp = 0.22;
const rampDistance = ramp / 2;
const totalDistance = 1 - ramp;

export function smoothProgress(progress: number): number {
  if (progress > 0.5) return 1 - smoothProgress(1 - progress);
  const distance = progress < ramp ? progress ** 2 / (2 * ramp) : progress - rampDistance;
  return distance / totalDistance;
}

export function smoothClock(progress: number): number {
  if (progress > 0.5) return 1 - smoothClock(1 - progress);
  const distance = progress * totalDistance;
  // Invert the ramp to resume or switch modes from the current cue position.
  return distance < rampDistance ? Math.sqrt(2 * ramp * distance) : distance + rampDistance;
}
