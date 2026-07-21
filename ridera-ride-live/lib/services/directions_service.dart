import 'dart:convert';
import 'package:http/http.dart' as http;

const _userAgent = 'RideraApp/1.0 (multiservicioslavina@gmail.com)';

class DirectionsService {
  Future<List<GeocodeResult>> geocode(String query,
      {LatLng? proximity, int limit = 5, String country = 'co'}) async {
    if (query.trim().length < 2) return [];
    final q = Uri.encodeComponent(query.trim());
    final prox = proximity ?? const LatLng(6.25, -75.57);
    final url = 'https://nominatim.openstreetmap.org/search'
        '?q=$q&format=json&limit=$limit&countrycodes=$country'
        '&accept-language=es'
        '&viewbox=${prox.lon - 1},${prox.lat + 1},${prox.lon + 1},${prox.lat - 1}'
        '&bounded=0';
    final res = await http.get(Uri.parse(url), headers: {'User-Agent': _userAgent})
        .timeout(const Duration(seconds: 8));
    if (res.statusCode != 200) return [];
    final data = jsonDecode(res.body) as List;
    return data.map<GeocodeResult>((f) {
      return GeocodeResult(
        placeName: (f['display_name'] as String?) ?? '',
        name: (f['name'] as String?) ?? (f['display_name'] as String?) ?? '',
        lat: double.tryParse(f['lat']?.toString() ?? '') ?? 0,
        lon: double.tryParse(f['lon']?.toString() ?? '') ?? 0,
      );
    }).toList();
  }

  Future<GeocodeResult?> reverseGeocode(double lat, double lon) async {
    final url = 'https://nominatim.openstreetmap.org/reverse'
        '?lat=$lat&lon=$lon&format=json&accept-language=es';
    final res = await http.get(Uri.parse(url), headers: {'User-Agent': _userAgent})
        .timeout(const Duration(seconds: 8));
    if (res.statusCode != 200) return null;
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    if (data['error'] != null) return null;
    return GeocodeResult(
      placeName: (data['display_name'] as String?) ?? '',
      name: (data['name'] as String?) ?? (data['display_name'] as String?) ?? '',
      lat: lat,
      lon: lon,
    );
  }

  Future<DirectionsRoute?> route(List<LatLng> waypoints) async {
    if (waypoints.length < 2) return null;
    final coords = waypoints.map((p) => '${p.lon},${p.lat}').join(';');
    final url = 'https://router.project-osrm.org/route/v1/driving/'
        '$coords?overview=full&geometries=geojson&steps=true';
    final res = await http.get(Uri.parse(url)).timeout(const Duration(seconds: 12));
    if (res.statusCode != 200) return null;
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    if (data['code'] != 'Ok') return null;
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
          instruction: (m['name'] as String?) ?? '',
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

  Map<String, dynamic> toGeoJsonLineString() => {
        'type': 'LineString',
        'coordinates': polyline.map((p) => [p.lon, p.lat]).toList(),
      };

  List<Map<String, dynamic>> stepsAsJson() =>
      steps.map((s) => s.toJson()).toList();
}

class RouteStep {
  final String instruction;
  final String type;
  final String modifier;
  final double distanceM;
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
