import 'dart:convert';
import 'package:http/http.dart' as http;

import '../video_config.dart';

/// Cliente del backend propio de renderizado (Mapbox GL 3D + Puppeteer).
/// El endpoint es síncrono: envía la ruta y espera hasta que el video esté listo.
class VideoService {
  /// Solicita el renderizado del video de la rodada.
  /// Retorna la URL pública del mp4 en Supabase Storage.
  Future<String> renderVideo({
    required String rideId,
    required String rideName,
    required String elapsed,
    required String distanceKm,
    required String maxSpeedKmh,
    required List<Map<String, dynamic>> photos,
    required List<Map<String, double>> routePoints,
  }) async {
    final body = {
      'rideId': rideId,
      'rideName': rideName,
      'elapsed': elapsed,
      'distanceKm': distanceKm,
      'maxSpeedKmh': maxSpeedKmh,
      'routePoints': _simplify(routePoints, 200)
          .map((p) => {'lat': p['lat'], 'lon': p['lon']})
          .toList(),
      'photos': photos
          .take(6)
          .map((p) => {
                'url': p['url'],
                'lat': p['lat'],
                'lon': p['lon'],
              })
          .toList(),
    };

    // El backend renderiza + sube en un solo request (~30-60s).
    final res = await http
        .post(
          Uri.parse('$kVideoBackendUrl/render'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode(body),
        )
        .timeout(const Duration(minutes: 8));

    if (res.statusCode != 200) {
      throw Exception('Backend ${res.statusCode}: ${res.body}');
    }

    final data = jsonDecode(res.body) as Map<String, dynamic>;
    final url = data['url'] as String?;
    if (url == null || url.isEmpty) {
      throw Exception('Backend no devolvió URL');
    }
    return url;
  }

  /// Reduce puntos a `maxPts` conservando primero, último y muestreo uniforme.
  List<Map<String, double>> _simplify(
      List<Map<String, double>> pts, int maxPts) {
    if (pts.length <= maxPts) return pts;
    final result = <Map<String, double>>[];
    final step = (pts.length - 1) / (maxPts - 1);
    for (int i = 0; i < maxPts; i++) {
      result.add(pts[(i * step).round()]);
    }
    return result;
  }
}
