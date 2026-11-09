// Ramp the shared clock for the first and last 12% of the cue.
// Normalize the distance so steady and smooth playback take the same time.
const ramp = 0.12;
const startSpeed = 0.35;
const acceleration = (1 - startSpeed) / ramp;
const rampDistance = ramp * (startSpeed + 1) / 2;
const totalDistance = 1 - 2 * (ramp - rampDistance);

export function smoothProgress(progress: number): number {
  if (progress > 0.5) return 1 - smoothProgress(1 - progress);
  const distance = progress < ramp
    ? progress * (startSpeed + acceleration * progress / 2)
    : rampDistance + progress - ramp;
  return distance / totalDistance;
}

export function smoothClock(progress: number): number {
  if (progress > 0.5) return 1 - smoothClock(1 - progress);
  const distance = progress * totalDistance;
  if (distance >= rampDistance) return ramp + distance - rampDistance;
  // Invert the ramp to resume or switch modes from the current cue position.
  return 2 * distance / (startSpeed + Math.sqrt(startSpeed ** 2 + 2 * acceleration * distance));
}
