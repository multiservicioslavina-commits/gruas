import { useRef, useEffect, useState, useCallback } from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  continueRender,
  delayRender,
} from "remotion";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  buildCumDist,
  pointAlong,
  bearingAlong,
  lerpBearing,
  lerp,
  easeInOut,
  haversine,
  destination,
} from "../lib/geo";
import type { RideData, Municipality } from "../lib/types";

interface Stamp {
  nombre: string;
  departamento: string;
  lat: number;
  lon: number;
  t: number;
  offRoute: number;
}

const T_INTRO = 5.0;
const T_ROUTE = 40.0;
const T_STATS = 10.0;
const T_OUTRO = 5.0;
const STAMP_SHOW = 2.8;

export const MapScene: React.FC<{ data: RideData }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [handle] = useState(() => delayRender("Loading map"));
  const readyRef = useRef(false);
  const bearingRef = useRef(0);
  const smCamPosRef = useRef<[number, number] | null>(null);
  const smCamAltRef = useRef<number | null>(null);

  const coords: [number, number][] = data.routePoints.map((p) => [
    p.lon,
    p.lat,
  ]);
  const cumDist = buildCumDist(coords);
  const totalDist = cumDist[cumDist.length - 1];
  const totalKm = totalDist / 1000;

  const CAM_BACK = Math.min(1200, Math.max(240, totalDist * 0.04));
  const CAM_HEIGHT = Math.min(850, Math.max(150, totalDist * 0.028));

  const bounds = coords.reduce(
    (b, c) => b.extend(c as [number, number]),
    new mapboxgl.LngLatBounds(coords[0], coords[0]),
  );
  const centerLng = (bounds.getWest() + bounds.getEast()) / 2;
  const centerLat = (bounds.getSouth() + bounds.getNorth()) / 2;

  // Stamps
  function invEaseInOut(f: number) {
    return f < 0.5 ? Math.sqrt(f / 2) : 1 - Math.sqrt((1 - f) / 2);
  }
  const stamps: Stamp[] = (data.municipios || [])
    .map((mu: Municipality) => {
      let best = Infinity,
        bestDist = 0;
      for (let i = 0; i < coords.length; i++) {
        const d = haversine(coords[i], [mu.lon, mu.lat]);
        if (d < best) {
          best = d;
          bestDist = cumDist[i];
        }
      }
      const f = totalDist > 0 ? bestDist / totalDist : 0;
      return {
        ...mu,
        offRoute: best,
        t: T_INTRO + invEaseInOut(f) * T_ROUTE,
      };
    })
    .filter((s: Stamp) => s.offRoute <= 3000)
    .sort((a: Stamp, b: Stamp) => a.t - b.t);

  for (let i = 1; i < stamps.length; i++) {
    if (stamps[i].t < stamps[i - 1].t + STAMP_SHOW + 0.4) {
      stamps[i].t = stamps[i - 1].t + STAMP_SHOW + 0.4;
    }
  }

  const totalSeconds = T_INTRO + T_ROUTE + T_STATS + T_OUTRO;

  const nearestMuni = useCallback(
    (pt: [number, number]) => {
      let best: Municipality | null = null,
        bd = Infinity;
      for (const mu of data.municipios || []) {
        const d = haversine(pt, [mu.lon, mu.lat]);
        if (d < bd) {
          bd = d;
          best = mu;
        }
      }
      return bd <= 12000 && best ? best.nombre : null;
    },
    [data.municipios],
  );

  const desdeName = nearestMuni(coords[0]);
  const hastaName = nearestMuni(coords[coords.length - 1]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    mapboxgl.accessToken = data.mapboxToken;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/standard-satellite",
      center: [centerLng, centerLat],
      zoom: 12,
      pitch: 60,
      bearing: 30,
      antialias: true,
      fadeDuration: 0,
      interactive: false,
      preserveDrawingBuffer: true,
    });

    map.on("load", () => {
      map.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      });
      map.setTerrain({ source: "mapbox-dem", exaggeration: 1.6 });

      try {
        map.setFog({
          range: [0.5, 10],
          color: "rgba(230, 200, 170, 0.75)",
          "high-color": "#3a5bbf",
          "horizon-blend": 0.08,
          "space-color": "#0b1026",
          "star-intensity": 0.2,
        });
      } catch {}

      map.addSource("route-full", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: {},
        },
      });
      map.addSource("route-live", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [coords[0], coords[0]],
          },
          properties: {},
        },
      });
      map.addSource("pin", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "Point", coordinates: coords[0] },
          properties: {},
        },
      });
      map.addSource("endpoints", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { kind: "start" },
              geometry: { type: "Point", coordinates: coords[0] },
            },
            {
              type: "Feature",
              properties: { kind: "end" },
              geometry: {
                type: "Point",
                coordinates: coords[coords.length - 1],
              },
            },
          ],
        },
      });

      map.addLayer({
        id: "route-full-layer",
        type: "line",
        source: "route-full",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": 4,
          "line-opacity": 0.18,
        },
      });
      map.addLayer({
        id: "route-live-glow",
        type: "line",
        source: "route-live",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#E85D20",
          "line-width": 24,
          "line-opacity": 0.28,
          "line-blur": 8,
        },
      });
      map.addLayer({
        id: "route-live-layer",
        type: "line",
        source: "route-live",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#FF6B1A",
          "line-width": 8,
          "line-opacity": 1,
        },
      });
      map.addLayer({
        id: "pin-halo",
        type: "circle",
        source: "pin",
        paint: {
          "circle-radius": 18,
          "circle-color": "#E85D20",
          "circle-opacity": 0.3,
          "circle-blur": 0.5,
        },
      });
      map.addLayer({
        id: "pin-layer",
        type: "circle",
        source: "pin",
        paint: {
          "circle-radius": 8,
          "circle-color": "#FF6B1A",
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 3,
        },
      });
      map.addLayer({
        id: "endpoint-layer",
        type: "circle",
        source: "endpoints",
        paint: {
          "circle-radius": 7,
          "circle-color": [
            "match",
            ["get", "kind"],
            "start",
            "#1DA84C",
            "end",
            "#C0272D",
            "#888",
          ],
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 2,
        },
      });

      bearingRef.current = bearingAlong(coords, cumDist, totalDist, 0);
      readyRef.current = true;
      mapRef.current = map;
      continueRender(handle);
    });

    return () => {
      map.remove();
    };
  }, []);

  // Update map each frame
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;

    if (t < T_INTRO || t >= T_INTRO + T_ROUTE) return;

    const routeT = t - T_INTRO;
    const p = Math.max(0, Math.min(1, routeT / T_ROUTE));
    const eased = easeInOut(p);
    const riderDist = eased * totalDist;
    const rider = pointAlong(coords, cumDist, totalDist, riderDist);

    // Update route line
    let cutIdx = 0;
    for (let i = 0; i < cumDist.length; i++) {
      if (cumDist[i] <= riderDist) cutIdx = i;
      else break;
    }
    const partial = [...coords.slice(0, cutIdx + 1), rider];
    (map.getSource("route-live") as mapboxgl.GeoJSONSource)?.setData({
      type: "Feature",
      geometry: { type: "LineString", coordinates: partial },
      properties: {},
    });
    (map.getSource("pin") as mapboxgl.GeoJSONSource)?.setData({
      type: "Feature",
      geometry: { type: "Point", coordinates: rider },
      properties: {},
    });

    // Chase cam — camera BEHIND rider, looking AHEAD
    const dirBearing = bearingAlong(coords, cumDist, totalDist, riderDist);
    const smoothBearing = lerpBearing(bearingRef.current, dirBearing, 0.1);
    bearingRef.current = smoothBearing;

    const camBehindDist = Math.max(0, riderDist - CAM_BACK);
    const camLngLat = pointAlong(coords, cumDist, totalDist, camBehindDist);

    const LOOK_AHEAD = CAM_BACK * 0.6;
    const lookDist = Math.min(riderDist + LOOK_AHEAD, totalDist);
    const lookPt = pointAlong(coords, cumDist, totalDist, lookDist);

    const openShot =
      p < 0.12 ? 1 - p / 0.12 : p > 0.88 ? (p - 0.88) / 0.12 : 0;
    const terrainElev = map.queryTerrainElevation(camLngLat) || 0;
    const targetAlt = terrainElev + CAM_HEIGHT * (1 + openShot * 1.6);

    if (!smCamPosRef.current) {
      smCamPosRef.current = camLngLat;
      smCamAltRef.current = targetAlt;
    }
    smCamPosRef.current = [
      lerp(smCamPosRef.current[0], camLngLat[0], 0.12),
      lerp(smCamPosRef.current[1], camLngLat[1], 0.12),
    ];
    smCamAltRef.current = lerp(smCamAltRef.current!, targetAlt, 0.08);

    const floorAlt =
      (map.queryTerrainElevation(smCamPosRef.current) || 0) + 120;
    const finalAlt = Math.max(smCamAltRef.current!, floorAlt);

    const camera = map.getFreeCameraOptions();
    camera.position = mapboxgl.MercatorCoordinate.fromLngLat(
      { lng: smCamPosRef.current[0], lat: smCamPosRef.current[1] },
      finalAlt,
    );
    camera.lookAtPoint({ lng: lookPt[0], lat: lookPt[1] });
    map.setFreeCameraOptions(camera);
  }, [frame]);

  // Compute current state for overlays
  const isIntro = t < T_INTRO;
  const isRoute = t >= T_INTRO && t < T_INTRO + T_ROUTE;
  const isStats =
    t >= T_INTRO + T_ROUTE && t < T_INTRO + T_ROUTE + T_STATS;
  const isOutro = t >= T_INTRO + T_ROUTE + T_STATS;

  const routeP = isRoute
    ? easeInOut(Math.max(0, Math.min(1, (t - T_INTRO) / T_ROUTE)))
    : 0;
  const currentKm = (totalKm * routeP).toFixed(1);

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

  const stampScale = activeStamp
    ? (() => {
        const sp = (t - activeStamp.t) / STAMP_SHOW;
        if (sp < 0.15) return 0.5 + sp / 0.15 * 0.6;
        return 1.1;
      })()
    : 0;

  return (
    <div
      style={{
        width: 1080,
        height: 1080,
        background: "#000",
        position: "relative",
        overflow: "hidden",
        fontFamily: "'Arial Black', Arial, sans-serif",
      }}
    >
      {/* Map */}
      <div
        ref={mapContainer}
        style={{ position: "absolute", inset: 0, width: 1080, height: 1080 }}
      />

      {/* Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* INTRO */}
      {isIntro && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            opacity: t < T_INTRO - 0.5 ? 1 : Math.max(0, (T_INTRO - t) / 0.5),
          }}
        >
          <div
            style={{
              fontSize: 96,
              fontWeight: 900,
              color: "#E85D20",
              letterSpacing: 8,
              textShadow: "0 0 80px rgba(232,93,32,0.9)",
            }}
          >
            RIDERA
          </div>
          <div
            style={{
              fontSize: 24,
              letterSpacing: 18,
              color: "#fff",
              fontWeight: 300,
              marginTop: 8,
            }}
          >
            AVENTURA
          </div>
          <div
            style={{
              width: 90,
              height: 4,
              background: "#E85D20",
              margin: "24px auto",
            }}
          />
          <div
            style={{
              fontSize: 34,
              fontWeight: 700,
              color: "#fff",
              letterSpacing: 2,
              textAlign: "center",
              maxWidth: 900,
              lineHeight: 1.3,
            }}
          >
            {data.rideName}
          </div>
          {(desdeName || hastaName) && (
            <div
              style={{
                fontSize: 17,
                color: "#E8B84B",
                letterSpacing: 3,
                fontWeight: 700,
                marginTop: 10,
              }}
            >
              {desdeName || "Salida"} → {hastaName || "Llegada"}
            </div>
          )}
        </div>
      )}

      {/* HUD top bar */}
      {isRoute && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 100%)",
            padding: "30px 40px 40px",
          }}
        >
          <div
            style={{
              fontSize: 14,
              color: "#E85D20",
              letterSpacing: 8,
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            🏍 RIDERA AVENTURA
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 900,
              color: "#fff",
              letterSpacing: 4,
              textTransform: "uppercase" as const,
              textShadow: "0 2px 12px rgba(0,0,0,0.9)",
            }}
          >
            {data.rideName}
          </div>
        </div>
      )}

      {/* HUD bottom bar */}
      {isRoute && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            background:
              "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)",
            padding: "40px 40px 30px",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 64,
                fontWeight: 900,
                color: "#E85D20",
                textShadow: "0 0 30px rgba(232,93,32,0.7)",
                lineHeight: 1,
              }}
            >
              {currentKm}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#ccc",
                letterSpacing: 4,
                marginTop: -2,
              }}
            >
              KM RECORRIDOS
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 38,
                fontWeight: 700,
                color: "#fff",
                lineHeight: 1,
              }}
            >
              {data.maxSpeedKmh}
            </div>
            <div
              style={{ fontSize: 13, color: "#aaa", letterSpacing: 4 }}
            >
              KM/H MÁXIMA
            </div>
          </div>
        </div>
      )}

      {/* Stamp */}
      {activeStamp && stampOpacity > 0 && (
        <div
          style={{
            position: "absolute",
            top: 200,
            left: 36,
            background: "rgba(10, 8, 6, 0.82)",
            border: "3px dashed #E8B84B",
            borderRadius: 14,
            padding: "14px 22px",
            transform: `rotate(-4deg) scale(${stampScale})`,
            opacity: stampOpacity,
            boxShadow:
              "0 0 40px rgba(232, 184, 75, 0.35), 0 8px 30px rgba(0,0,0,0.6)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: 5,
              color: "#E8B84B",
              fontWeight: 700,
            }}
          >
            🏍 SELLO PASAPORTE RIDERA
          </div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 900,
              color: "#fff",
              letterSpacing: 2,
              textTransform: "uppercase" as const,
              margin: "2px 0",
            }}
          >
            {activeStamp.nombre}
          </div>
          <div
            style={{
              fontSize: 14,
              color: "#E8B84B",
              fontWeight: 700,
              letterSpacing: 2,
            }}
          >
            {activeStamp.departamento} · +10 PTS
          </div>
        </div>
      )}

      {/* STATS */}
      {isStats && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 0,
          }}
        >
          <div
            style={{
              fontSize: 15,
              letterSpacing: 10,
              color: "#E85D20",
              fontWeight: 700,
              marginBottom: 36,
            }}
          >
            RESUMEN DE LA RODADA
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <StatBox value={`${data.distanceKm}`} label="Distancia" unit="km" />
            <StatBox value={data.elapsed} label="Tiempo" />
            <StatBox value={`${data.maxSpeedKmh}`} label="Vel. Máx" unit="km/h" />
          </div>
        </div>
      )}

      {/* OUTRO */}
      {isOutro && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: 76,
              fontWeight: 900,
              color: "#E85D20",
              letterSpacing: 7,
              textShadow: "0 0 60px rgba(232,93,32,0.8)",
            }}
          >
            RIDERA
          </div>
          <div
            style={{
              width: 70,
              height: 4,
              background: "#E85D20",
              margin: "20px auto",
            }}
          />
          <div
            style={{
              fontSize: 20,
              letterSpacing: 14,
              color: "#fff",
              marginTop: 12,
            }}
          >
            AVENTURA
          </div>
          <div
            style={{
              fontSize: 14,
              color: "#888",
              letterSpacing: 5,
              marginTop: 16,
            }}
          >
            GRACIAS POR RODAR
          </div>
        </div>
      )}
    </div>
  );
};

const StatBox: React.FC<{ value: string; label: string; unit?: string }> = ({
  value,
  label,
  unit,
}) => (
  <div
    style={{
      background: "rgba(255,255,255,0.07)",
      border: "1px solid rgba(232,93,32,0.5)",
      borderRadius: 20,
      padding: "26px 40px",
      textAlign: "center",
      minWidth: 180,
    }}
  >
    <div style={{ fontSize: 52, fontWeight: 900, color: "#E85D20" }}>
      {value}
    </div>
    {unit && (
      <div style={{ fontSize: 16, color: "#ccc", marginTop: -4 }}>{unit}</div>
    )}
    <div
      style={{
        fontSize: 12,
        letterSpacing: 5,
        color: "#aaa",
        textTransform: "uppercase" as const,
        marginTop: 6,
      }}
    >
      {label}
    </div>
  </div>
);
