import 'dart:convert';
import 'package:http/http.dart' as http;

import '../video_config.dart';

/// Cliente de Mapbox Directions + Geocoding.
/// Devuelve rutas óptimas para moto + instrucciones turn-by-turn.
class DirectionsService {
  /// Autocompletar direcciones. Retorna hasta [limit] resultados cercanos a [proximity].
  Future<List<GeocodeResult>> geocode(String query,
      {LatLng? proximity, int limit = 5, String country = 'co'}) async {
    if (query.trim().isEmpty) return [];
    final q = Uri.encodeComponent(query.trim());
    final prox = proximity != null ? '&proximity=${proximity.lon},${proximity.lat}' : '';
    final url = 'https://api.mapbox.com/geocoding/v5/mapbox.places/'
        '$q.json?access_token=$kMapboxToken&country=$country&limit=$limit&language=es$prox';
    final res = await http.get(Uri.parse(url)).timeout(const Duration(seconds: 8));
    if (res.statusCode != 200) return [];
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    final features = (data['features'] as List?) ?? [];
    return features.map<GeocodeResult>((f) {
      final coords = (f['center'] as List).cast<num>();
      return GeocodeResult(
        placeName: (f['place_name'] as String?) ?? '',
        name: (f['text'] as String?) ?? '',
        lat: coords[1].toDouble(),
        lon: coords[0].toDouble(),
      );
    }).toList();
  }

  /// Calcula la ruta óptima entre waypoints. Primero es origen, último es destino.
  /// Retorna null si no encuentra ruta.
  Future<DirectionsRoute?> route(List<LatLng> waypoints) async {
    if (waypoints.length < 2) return null;
    final coords = waypoints.map((p) => '${p.lon},${p.lat}').join(';');
    final url = 'https://api.mapbox.com/directions/v5/mapbox/driving-traffic/'
        '$coords?access_token=$kMapboxToken'
        '&geometries=geojson&overview=full&steps=true&language=es';
    final res = await http.get(Uri.parse(url)).timeout(const Duration(seconds: 12));
    if (res.statusCode != 200) return null;
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    final routes = (data['routes'] as List?) ?? [];
    if (routes.isEmpty) return null;
    final r = routes.first as Map<String, dynamic>;
    final geom = r['geometry'] as Map<String, dynamic>;
    final coordsList = (geom['coordinates'] as List).cast<List>();
    final polyline = coordsList
        .map((c) => LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()))
        .toList();

    final legs = (r['legs'] as List?) ?? [];
    final steps = <RouteStep>[];
    for (final leg in legs) {
      for (final s in (leg['steps'] as List)) {
        final m = s as Map<String, dynamic>;
        final maneuver = m['maneuver'] as Map<String, dynamic>? ?? {};
        final loc = (maneuver['location'] as List?)?.cast<num>() ?? [0, 0];
        steps.add(RouteStep(
          instruction: (maneuver['instruction'] as String?) ??
              (m['name'] as String?) ?? '',
          type: (maneuver['type'] as String?) ?? '',
          modifier: (maneuver['modifier'] as String?) ?? '',
          distanceM: ((m['distance'] as num?) ?? 0).toDouble(),
          durationS: ((m['duration'] as num?) ?? 0).toDouble(),
          lat: loc[1].toDouble(),
          lon: loc[0].toDouble(),
        ));
      }
    }

    return DirectionsRoute(
      polyline: polyline,
      steps: steps,
      distanceKm: ((r['distance'] as num) / 1000).toDouble(),
      durationMin: ((r['duration'] as num) / 60).round(),
    );
  }
}

class LatLng {
  final double lat;
  final double lon;
  const LatLng(this.lat, this.lon);
}

class GeocodeResult {
  final String placeName;
  final String name;
  final double lat;
  final double lon;
  const GeocodeResult({
    required this.placeName,
    required this.name,
    required this.lat,
    required this.lon,
  });
}

class DirectionsRoute {
  final List<LatLng> polyline;
  final List<RouteStep> steps;
  final double distanceKm;
  final int durationMin;

  const DirectionsRoute({
    required this.polyline,
    required this.steps,
    required this.distanceKm,
    required this.durationMin,
  });

  /// Serializar a JSON para guardar en Supabase.
  Map<String, dynamic> toGeoJsonLineString() => {
        'type': 'LineString',
        'coordinates': polyline.map((p) => [p.lon, p.lat]).toList(),
      };

  List<Map<String, dynamic>> stepsAsJson() =>
      steps.map((s) => s.toJson()).toList();
}

class RouteStep {
  final String instruction; // Ej: "Gira a la derecha en Calle 50"
  final String type;        // "turn", "arrive", "roundabout", etc.
  final String modifier;    // "left", "right", "straight", "slight right", etc.
  final double distanceM;   // Distancia desde el paso anterior
  final double durationS;
  final double lat;
  final double lon;

  const RouteStep({
    required this.instruction,
    required this.type,
    required this.modifier,
    required this.distanceM,
    required this.durationS,
    required this.lat,
    required this.lon,
  });

  Map<String, dynamic> toJson() => {
        'instruction': instruction,
        'type': type,
        'modifier': modifier,
        'distance_m': distanceM,
        'duration_s': durationS,
        'lat': lat,
        'lon': lon,
      };

  factory RouteStep.fromJson(Map<String, dynamic> j) => RouteStep(
        instruction: j['instruction'] as String? ?? '',
        type: j['type'] as String? ?? '',
        modifier: j['modifier'] as String? ?? '',
        distanceM: (j['distance_m'] as num?)?.toDouble() ?? 0,
        durationS: (j['duration_s'] as num?)?.toDouble() ?? 0,
        lat: (j['lat'] as num).toDouble(),
        lon: (j['lon'] as num).toDouble(),
      );
}
