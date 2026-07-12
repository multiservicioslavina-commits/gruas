import 'dart:convert';
import 'package:http/http.dart' as http;

import '../video_config.dart';

class VideoService {
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
        .timeout(const Duration(seconds: 45));

    if (res.statusCode != 200 && res.statusCode != 202) {
      throw Exception('Backend ${res.statusCode}: ${res.body}');
    }

    final data = jsonDecode(res.body) as Map<String, dynamic>;

    final directUrl = data['url'] as String?;
    if (directUrl != null && directUrl.isNotEmpty) return directUrl;

    final jobId = data['jobId'] as String?;
    if (jobId == null || jobId.isEmpty) {
      throw Exception('Backend no devolvió jobId');
    }

    return jobId;
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
