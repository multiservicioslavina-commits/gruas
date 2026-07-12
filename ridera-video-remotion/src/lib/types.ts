export interface RoutePoint {
  lat: number;
  lon: number;
}

export interface Municipality {
  nombre: string;
  departamento: string;
  lat: number;
  lon: number;
}

export interface RideData {
  rideId: string;
  rideName: string;
  elapsed: string;
  distanceKm: string;
  maxSpeedKmh: string;
  routePoints: RoutePoint[];
  municipios: Municipality[];
  mapboxToken: string;
}
