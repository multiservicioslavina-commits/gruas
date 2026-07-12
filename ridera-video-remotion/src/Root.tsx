import { Composition } from "remotion";
import { MapScene } from "./components/MapScene";
import type { RideData } from "./lib/types";

const FPS = 24;
const T_INTRO = 3.0;
const T_ROUTE = 14.0;
const T_STATS = 4.5;
const T_OUTRO = 3.0;
const TOTAL_SECONDS = T_INTRO + T_ROUTE + T_STATS + T_OUTRO;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="RideVideo"
      component={MapScene as React.FC<Record<string, unknown>>}
      durationInFrames={Math.ceil(TOTAL_SECONDS * FPS)}
      fps={FPS}
      width={1080}
      height={1080}
      defaultProps={
        {
          data: {
            rideId: "DEMO",
            rideName: "RUTA DE PRUEBA",
            elapsed: "01:23:45",
            distanceKm: "42.5",
            maxSpeedKmh: "87",
            mapboxToken: process.env.MAPBOX_TOKEN || "",
            routePoints: [
              { lat: 6.2518, lon: -75.5636 },
              { lat: 6.261, lon: -75.551 },
              { lat: 6.275, lon: -75.545 },
              { lat: 6.29, lon: -75.535 },
              { lat: 6.31, lon: -75.52 },
            ],
            municipios: [
              {
                nombre: "Medellín",
                departamento: "Antioquia",
                lat: 6.2518,
                lon: -75.5636,
              },
              {
                nombre: "Bello",
                departamento: "Antioquia",
                lat: 6.3356,
                lon: -75.5593,
              },
            ],
          } satisfies RideData,
        } as Record<string, unknown>
      }
    />
  );
};
