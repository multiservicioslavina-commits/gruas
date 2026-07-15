import 'dart:convert';
import 'package:http/http.dart' as http;

import '../video_config.dart';

class VideoService {
  static const _pollInterval = Duration(seconds: 5);
  static const _maxWait = Duration(minutes: 10);

  Future<String> renderVideo({
    required String rideId,
    required String rideName,
    required String elapsed,
    required String distanceKm,
    required String maxSpeedKmh,
    required List<Map<String, dynamic>> photos,
    required List<Map<String, double>> routePoints,
    List<Map<String, dynamic>>? municipios,
    void Function(int progress)? onProgress,
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
      'municipios': municipios ?? [],
    };

    final res = await http
        .post(
          Uri.parse(kVideoBackendUrl),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode(body),
        )
        .timeout(const Duration(seconds: 60));

    if (res.statusCode != 200 && res.statusCode != 202) {
      throw Exception('Backend ${res.statusCode}: ${res.body}');
    }

    final data = jsonDecode(res.body) as Map<String, dynamic>;

    if (data.containsKey('error')) {
      throw Exception(data['error']);
    }

    final renderId = data['renderId'] as String?;
    final bucketName = data['bucketName'] as String? ?? '';

    if (renderId == null || renderId.isEmpty) {
      final directUrl = data['url'] as String?;
      if (directUrl != null && directUrl.isNotEmpty) return directUrl;
      throw Exception('Backend no devolvió renderId ni url');
    }

    onProgress?.call(0);

    final deadline = DateTime.now().add(_maxWait);
    int consecutiveErrors = 0;
    while (DateTime.now().isBefore(deadline)) {
      await Future.delayed(_pollInterval);

      final http.Response st;
      try {
        final statusUrl = '$kVideoBackendUrl?renderId=$renderId&bucketName=$bucketName';
        st = await http
            .get(Uri.parse(statusUrl))
            .timeout(const Duration(seconds: 20));
      } catch (_) {
        consecutiveErrors++;
        if (consecutiveErrors >= 5) {
          throw Exception('No se pudo consultar el estado del video después de $consecutiveErrors intentos');
        }
        continue;
      }

      if (st.statusCode != 200) {
        consecutiveErrors++;
        if (consecutiveErrors >= 5) {
          throw Exception('Error del servidor (${st.statusCode}) al consultar estado del video');
        }
        continue;
      }

      consecutiveErrors = 0;

      final s = jsonDecode(st.body) as Map<String, dynamic>;
      final status = s['status'] as String?;
      final progress = s['progress'] as int? ?? 0;

      onProgress?.call(progress);

      if (status == 'done') {
        final url = s['url'] as String?;
        if (url == null || url.isEmpty) {
          throw Exception('Render completado pero sin URL');
        }
        return url;
      }

      if (status == 'error') {
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
