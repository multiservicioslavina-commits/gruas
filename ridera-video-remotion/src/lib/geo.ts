const R_EARTH = 6371000;
function rad(d: number): number { return (d * Math.PI) / 180; }
function deg(r: number): number { return (r * 180) / Math.PI; }

export function haversine(a: [number, number], b: [number, number]): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(s));
}

export function destination(
  origin: [number, number],
  bearingDeg: number,
  distM: number,
): [number, number] {
  const br = rad(bearingDeg);
  const lat1 = rad(origin[1]),
    lng1 = rad(origin[0]);
  const dr = distM / R_EARTH;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(dr) +
      Math.cos(lat1) * Math.sin(dr) * Math.cos(br),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(br) * Math.sin(dr) * Math.cos(lat1),
      Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2),
    );
  return [deg(lng2), deg(lat2)];
}

export function buildCumDist(coords: [number, number][]): number[] {
  const cumDist = [0];
  for (let i = 1; i < coords.length; i++) {
    cumDist.push(cumDist[i - 1] + haversine(coords[i - 1], coords[i]));
  }
  return cumDist;
}

export function pointAlong(
  coords: [number, number][],
  cumDist: number[],
  totalDist: number,
  dist: number,
): [number, number] {
  dist = Math.max(0, Math.min(totalDist, dist));
  let lo = 0,
    hi = cumDist.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumDist[mid] < dist) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(1, lo);
  const seg = cumDist[i] - cumDist[i - 1] || 1;
  const f = (dist - cumDist[i - 1]) / seg;
  const a = coords[i - 1],
    b = coords[i];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

export function bearingAlong(
  coords: [number, number][],
  cumDist: number[],
  totalDist: number,
  dist: number,
): number {
  const a = pointAlong(coords, cumDist, totalDist, Math.max(0, dist - 40));
  const b = pointAlong(
    coords,
    cumDist,
    totalDist,
    Math.min(totalDist, dist + 40),
  );
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x =
    Math.cos(rad(a[1])) * Math.sin(rad(b[1])) -
    Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return deg(Math.atan2(y, x));
}

export function lerpBearing(a: number, b: number, t: number): number {
  const d = (((b - a) % 360) + 540) % 360 - 180;
  return a + d * t;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
