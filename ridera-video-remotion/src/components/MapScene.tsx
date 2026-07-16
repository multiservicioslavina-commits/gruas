import { useCurrentFrame, useVideoConfig, Img } from "remotion";
import {
  buildCumDist,
  pointAlong,
  bearingAlong,
  lerpBearing,
  easeInOut,
  haversine,
} from "../lib/geo";
import type { RideData, Municipality } from "../lib/types";

const T_INTRO = 5.0;
const T_ROUTE = 40.0;
const T_STATS = 10.0;
const T_OUTRO = 5.0;
const STAMP_SHOW = 2.8;

// How often the static map image updates (every N frames).
// Lower = smoother camera but more API calls. 4 = 6fps camera movement.
const MAP_UPDATE_EVERY = 4;

// Camera distance behind rider (meters)
const CAM_BACK_M = 350;

// Zoom level for the satellite image (15 = ~2km viewport)
const ZOOM = 15;

// Pixel dimensions of the video frame
const W = 1080;
const H = 1080;

// Webmercator helpers for projecting lat/lon onto the static image
function lngToMerc(lng: number): number {
  return (lng + 180) / 360;
}
function latToMerc(lat: number): number {
  const s = Math.sin((lat * Math.PI) / 180);
  return (1 - Math.log((1 + s) / (1 - s)) / (2 * Math.PI)) / 2;
}

function mercToPixel(
  lng: number,
  lat: number,
  centerLng: number,
  centerLat: number,
  zoom: number,
  imgW: number,
  imgH: number,
): [number, number] {
  const scale = Math.pow(2, zoom) * 256;
  const cx = lngToMerc(centerLng) * scale;
  const cy = latToMerc(centerLat) * scale;
  const px = (lngToMerc(lng) * scale - cx) + imgW / 2;
  const py = (latToMerc(lat) * scale - cy) + imgH / 2;
  return [px, py];
}

interface Stamp {
  nombre: string;
  departamento: string;
  t: number;
}

export const MapScene: React.FC<{ data: RideData }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const coords: [number, number][] = data.routePoints.map((p) => [p.lon, p.lat]);
  const cumDist = buildCumDist(coords);
  const totalDist = cumDist[cumDist.length - 1];
  const totalKm = totalDist / 1000;

  // ── Stamps ────────────────────────────────────────────────────────────────
  function invEaseInOut(f: number) {
    return f < 0.5 ? Math.sqrt(f / 2) : 1 - Math.sqrt((1 - f) / 2);
  }

  const stamps: Stamp[] = (data.municipios || [])
    .map((mu: Municipality) => {
      let best = Infinity, bestDist = 0;
      for (let i = 0; i < coords.length; i++) {
        const d = haversine(coords[i], [mu.lon, mu.lat]);
        if (d < best) { best = d; bestDist = cumDist[i]; }
      }
      const f = totalDist > 0 ? bestDist / totalDist : 0;
      return { nombre: mu.nombre, departamento: mu.departamento ?? "Antioquia", offRoute: best, t: T_INTRO + invEaseInOut(f) * T_ROUTE };
    })
    .filter((s) => s.offRoute <= 3000)
    .sort((a, b) => a.t - b.t)
    .map((s, i, arr) => {
      if (i > 0 && s.t < arr[i - 1].t + STAMP_SHOW + 0.4) {
        s.t = arr[i - 1].t + STAMP_SHOW + 0.4;
      }
      return s;
    });

  // ── Camera position (snapped every MAP_UPDATE_EVERY frames) ───────────────
  const snapFrame = Math.floor(frame / MAP_UPDATE_EVERY) * MAP_UPDATE_EVERY;
  const snapT = snapFrame / fps;
  const snapRouteT = snapT - T_INTRO;
  const snapP = Math.max(0, Math.min(1, snapRouteT / T_ROUTE));
  const snapEased = easeInOut(snapP);
  const snapDist = snapEased * totalDist;

  const camDist = Math.max(0, snapDist - CAM_BACK_M);
  const cam = pointAlong(coords, cumDist, totalDist, camDist);
  const bearing = bearingAlong(coords, cumDist, totalDist, snapDist);

  // During intro/outro, show full route overview
  const isRoute = t >= T_INTRO && t < T_INTRO + T_ROUTE;
  const centerLng = isRoute ? cam[0] : (coords[0][0] + coords[coords.length - 1][0]) / 2;
  const centerLat = isRoute ? cam[1] : (coords[0][1] + coords[coords.length - 1][1]) / 2;
  const mapZoom = isRoute ? ZOOM : 13;
  const mapBearing = isRoute ? Math.round(bearing) : 0;

  const mapUrl =
    `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/` +
    `${centerLng.toFixed(6)},${centerLat.toFixed(6)},${mapZoom},${mapBearing},30/` +
    `${W}x${H}@2x?access_token=${data.mapboxToken}`;

  // ── Current rider position (for SVG overlay) ─────────────────────────────
  const routeP = isRoute
    ? easeInOut(Math.max(0, Math.min(1, (t - T_INTRO) / T_ROUTE)))
    : 0;
  const riderDist = routeP * totalDist;
  const rider = pointAlong(coords, cumDist, totalDist, riderDist);
  const currentKm = (totalKm * routeP).toFixed(1);

  // Project route points onto image
  const imgW = W * 2; // @2x
  const imgH = H * 2;
  const toXY = (lng: number, lat: number): [number, number] =>
    mercToPixel(lng, lat, centerLng, centerLat, mapZoom, imgW, imgH);

  // Build SVG path for full route
  const routePathD = coords.map((c, i) => {
    const [x, y] = toXY(c[0], c[1]);
    return `${i === 0 ? "M" : "L"}${(x / 2).toFixed(1)},${(y / 2).toFixed(1)}`;
  }).join(" ");

  // Build SVG path for traveled portion
  let cutIdx = 0;
  for (let i = 0; i < cumDist.length; i++) {
    if (cumDist[i] <= riderDist) cutIdx = i;
    else break;
  }
  const liveCoords = [...coords.slice(0, cutIdx + 1), rider];
  const livePathD = liveCoords.map((c, i) => {
    const [x, y] = toXY(c[0], c[1]);
    return `${i === 0 ? "M" : "L"}${(x / 2).toFixed(1)},${(y / 2).toFixed(1)}`;
  }).join(" ");

  const [riderX, riderY] = toXY(rider[0], rider[1]).map(v => v / 2) as [number, number];
  const [startX, startY] = toXY(coords[0][0], coords[0][1]).map(v => v / 2) as [number, number];
  const [endX, endY] = toXY(coords[coords.length - 1][0], coords[coords.length - 1][1]).map(v => v / 2) as [number, number];

  // ── Overlays ──────────────────────────────────────────────────────────────
  const isIntro = t < T_INTRO;
  const isStats = t >= T_INTRO + T_ROUTE && t < T_INTRO + T_ROUTE + T_STATS;
  const isOutro = t >= T_INTRO + T_ROUTE + T_STATS;

  const activeStamp = isRoute
    ? stamps.find((s) => t >= s.t && t < s.t + STAMP_SHOW)
    : null;

  const stampOpacity = activeStamp
    ? (() => {
        const sp = (t - activeStamp.t) / STAMP_SHOW;
        if (sp < 0.15) return sp / 0.15;
        if (sp > 0.85) return (1 - sp) / 0.15;
        return 1;
      })()
    : 0;

  const introOpacity = isIntro
    ? t < T_INTRO - 0.5 ? 1 : Math.max(0, (T_INTRO - t) / 0.5)
    : 0;

  return (
    <div style={{ width: W, height: H, background: "#000", position: "relative", overflow: "hidden", fontFamily: "'Arial Black', Arial, sans-serif" }}>

      {/* Satellite map */}
      <Img
        src={mapUrl}
        style={{ position: "absolute", inset: 0, width: W, height: H, objectFit: "cover" }}
      />

      {/* Route SVG overlay */}
      <svg
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
      >
        {/* Ghost full route */}
        <path d={routePathD} fill="none" stroke="#fff" strokeWidth={3} strokeOpacity={0.2} strokeLinecap="round" strokeLinejoin="round" />

        {/* Live route glow */}
        {isRoute && (
          <path d={livePathD} fill="none" stroke="#E85D20" strokeWidth={18} strokeOpacity={0.25} strokeLinecap="round" strokeLinejoin="round" />
        )}

        {/* Live route */}
        {isRoute && (
          <path d={livePathD} fill="none" stroke="#FF6B1A" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
        )}

        {/* Start dot */}
        <circle cx={startX} cy={startY} r={7} fill="#1DA84C" stroke="#fff" strokeWidth={2} />

        {/* End dot */}
        <circle cx={endX} cy={endY} r={7} fill="#C0272D" stroke="#fff" strokeWidth={2} />

        {/* Rider dot */}
        {isRoute && (
          <>
            <circle cx={riderX} cy={riderY} r={18} fill="#E85D20" fillOpacity={0.3} />
            <circle cx={riderX} cy={riderY} r={8} fill="#FF6B1A" stroke="#fff" strokeWidth={3} />
          </>
        )}
      </svg>

      {/* Vignette */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.55) 100%)" }} />

      {/* ── INTRO ── */}
      {isIntro && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: introOpacity }}>
          <div style={{ fontSize: 96, fontWeight: 900, color: "#E85D20", letterSpacing: 8, textShadow: "0 0 80px rgba(232,93,32,0.9)" }}>RIDERA</div>
          <div style={{ fontSize: 24, letterSpacing: 18, color: "#fff", fontWeight: 300, marginTop: 8 }}>AVENTURA</div>
          <div style={{ width: 90, height: 4, background: "#E85D20", margin: "24px auto" }} />
          <div style={{ fontSize: 34, fontWeight: 700, color: "#fff", letterSpacing: 2, textAlign: "center", maxWidth: 900, lineHeight: 1.3 }}>{data.rideName}</div>
        </div>
      )}

      {/* ── HUD top ── */}
      {isRoute && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 100%)", padding: "30px 40px 40px" }}>
          <div style={{ fontSize: 14, color: "#E85D20", letterSpacing: 8, fontWeight: 700, marginBottom: 6 }}>🏍 RIDERA AVENTURA</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", letterSpacing: 4, textTransform: "uppercase", textShadow: "0 2px 12px rgba(0,0,0,0.9)" }}>{data.rideName}</div>
        </div>
      )}

      {/* ── HUD bottom ── */}
      {isRoute && (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)", padding: "40px 40px 30px", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 64, fontWeight: 900, color: "#E85D20", textShadow: "0 0 30px rgba(232,93,32,0.7)", lineHeight: 1 }}>{currentKm}</div>
            <div style={{ fontSize: 13, color: "#ccc", letterSpacing: 4, marginTop: -2 }}>KM RECORRIDOS</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 38, fontWeight: 700, color: "#fff", lineHeight: 1 }}>{data.maxSpeedKmh}</div>
            <div style={{ fontSize: 13, color: "#aaa", letterSpacing: 4 }}>KM/H MÁXIMA</div>
          </div>
        </div>
      )}

      {/* ── Stamp ── */}
      {activeStamp && stampOpacity > 0 && (
        <div style={{ position: "absolute", top: 200, left: 36, background: "rgba(10,8,6,0.82)", border: "3px dashed #E8B84B", borderRadius: 14, padding: "14px 22px", transform: `rotate(-4deg) scale(${0.5 + stampOpacity * 0.6})`, opacity: stampOpacity, boxShadow: "0 0 40px rgba(232,184,75,0.35), 0 8px 30px rgba(0,0,0,0.6)" }}>
          <div style={{ fontSize: 11, letterSpacing: 5, color: "#E8B84B", fontWeight: 700 }}>🏍 SELLO PASAPORTE RIDERA</div>
          <div style={{ fontSize: 30, fontWeight: 900, color: "#fff", letterSpacing: 2, textTransform: "uppercase", margin: "2px 0" }}>{activeStamp.nombre}</div>
          <div style={{ fontSize: 14, color: "#E8B84B", fontWeight: 700, letterSpacing: 2 }}>{activeStamp.departamento} · +10 PTS</div>
        </div>
      )}

      {/* ── STATS ── */}
      {isStats && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 15, letterSpacing: 10, color: "#E85D20", fontWeight: 700, marginBottom: 36 }}>RESUMEN DE LA RODADA</div>
          <div style={{ display: "flex", gap: 24 }}>
            <StatBox value={`${data.distanceKm}`} label="Distancia" unit="km" />
            <StatBox value={data.elapsed} label="Tiempo" />
            <StatBox value={`${data.maxSpeedKmh}`} label="Vel. Máx" unit="km/h" />
          </div>
        </div>
      )}

      {/* ── OUTRO ── */}
      {isOutro && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 76, fontWeight: 900, color: "#E85D20", letterSpacing: 7, textShadow: "0 0 60px rgba(232,93,32,0.8)" }}>RIDERA</div>
          <div style={{ width: 70, height: 4, background: "#E85D20", margin: "20px auto" }} />
          <div style={{ fontSize: 20, letterSpacing: 14, color: "#fff", marginTop: 12 }}>AVENTURA</div>
          <div style={{ fontSize: 14, color: "#888", letterSpacing: 5, marginTop: 16 }}>GRACIAS POR RODAR</div>
        </div>
      )}
    </div>
  );
};

const StatBox: React.FC<{ value: string; label: string; unit?: string }> = ({ value, label, unit }) => (
  <div style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(232,93,32,0.5)", borderRadius: 20, padding: "26px 40px", textAlign: "center", minWidth: 180 }}>
    <div style={{ fontSize: 52, fontWeight: 900, color: "#E85D20" }}>{value}</div>
    {unit && <div style={{ fontSize: 16, color: "#ccc", marginTop: -4 }}>{unit}</div>}
    <div style={{ fontSize: 12, letterSpacing: 5, color: "#aaa", textTransform: "uppercase", marginTop: 6 }}>{label}</div>
  </div>
);
