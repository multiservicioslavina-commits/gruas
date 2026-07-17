import 'dart:convert';
import 'package:http/http.dart' as http;

import '../video_config.dart';

class VideoService {
  static const _pollInterval = Duration(seconds: 5);
  static const _maxWait = Duration(minutes: 45);

  Future<String> renderVideo({
    required String rideId,
    required String rideName,
    required String elapsed,
    required String distanceKm,
    required String maxSpeedKmh,
    required List<Map<String, dynamic>> photos,
    required List<Map<String, double>> routePoints,
    List<Map<String, dynamic>>? municipios,
    String? rideStartedAt,
    List<Map<String, dynamic>>? groupRiders,
    void Function(int progress)? onProgress,
  }) async {
    final body = {
      'rideId': rideId,
      'rideName': rideName,
      'elapsed': elapsed,
      'distanceKm': distanceKm,
      'maxSpeedKmh': maxSpeedKmh,
      'routePoints': _simplify(routePoints, 300)
          .map((p) => {
                'lat': p['lat'],
                'lon': p['lon'],
                if (p.containsKey('speed_kmh')) 'speed_kmh': p['speed_kmh'],
              })
          .toList(),
      'photos': photos
          .map((p) => {
                'url': p['url'],
                if (p['lat'] != null) 'lat': p['lat'],
                if (p['lon'] != null) 'lon': p['lon'],
              })
          .toList(),
      'municipios': municipios ?? [],
      if (rideStartedAt != null) 'rideStartedAt': rideStartedAt,
      if (groupRiders != null && groupRiders.isNotEmpty) 'groupRiders': groupRiders,
    };

    final res = await http
        .post(
          Uri.parse('$kVideoBackendUrl/render'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode(body),
        )
        .timeout(const Duration(seconds: 30));

    if (res.statusCode != 200 && res.statusCode != 202) {
      throw Exception('Backend ${res.statusCode}: ${res.body}');
    }

    final data = jsonDecode(res.body) as Map<String, dynamic>;

    if (data.containsKey('error')) {
      throw Exception(data['error']);
    }

    final jobId = data['jobId'] as String?;
    if (jobId == null || jobId.isEmpty) {
      throw Exception('Backend no devolvió jobId');
    }

    onProgress?.call(0);

    final deadline = DateTime.now().add(_maxWait);
    int consecutiveErrors = 0;

    while (DateTime.now().isBefore(deadline)) {
      await Future.delayed(_pollInterval);

      final http.Response st;
      try {
        st = await http
            .get(Uri.parse('$kVideoBackendUrl/status/$jobId'))
            .timeout(const Duration(seconds: 20));
      } catch (_) {
        consecutiveErrors++;
        if (consecutiveErrors >= 5) {
          throw Exception('No se pudo consultar el estado del video');
        }
        continue;
      }

      if (st.statusCode != 200) {
        consecutiveErrors++;
        if (consecutiveErrors >= 5) {
          throw Exception('Error del servidor (${st.statusCode})');
        }
        continue;
      }

      consecutiveErrors = 0;

      final s = jsonDecode(st.body) as Map<String, dynamic>;
      final state = s['state'] as String?;
      final progress = (s['progress'] as num?)?.toInt() ?? 0;

      onProgress?.call(progress);

      if (state == 'done') {
        final url = s['url'] as String?;
        if (url == null || url.isEmpty) {
          throw Exception('Render completado pero sin URL');
        }
        return url;
      }

      if (state == 'error') {
        throw Exception('Render falló: ${s['error'] ?? 'desconocido'}');
      }
    }

    throw Exception('El video tardó más de ${_maxWait.inMinutes} minutos');
  }

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
