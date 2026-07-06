import 'dart:convert';
import 'package:http/http.dart' as http;

import '../video_config.dart';

/// Cliente del backend propio de renderizado (Mapbox GL 3D + Puppeteer).
/// El backend es asíncrono: POST /render devuelve un jobId de inmediato
/// y aquí se consulta GET /status/:jobId hasta que el video esté listo.
/// El render frame a frame en 1080p tarda varios minutos.
class VideoService {
  static const _pollInterval = Duration(seconds: 10);
  static const _maxWait = Duration(minutes: 30);

  /// Solicita el renderizado del video de la rodada.
  /// Retorna la URL pública del mp4 en Supabase Storage.
  /// [onProgress] recibe el avance 0-100 si el backend lo reporta.
  Future<String> renderVideo({
    required String rideId,
    required String rideName,
    required String elapsed,
    required String distanceKm,
    required String maxSpeedKmh,
    required List<Map<String, dynamic>> photos,
    required List<Map<String, double>> routePoints,
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
      'photos': photos
          .take(6)
          .map((p) => {
                'url': p['url'],
                'lat': p['lat'],
                'lon': p['lon'],
              })
          .toList(),
    };

    // 1. Encolar el trabajo — responde de inmediato con jobId
    final res = await http
        .post(
          Uri.parse('$kVideoBackendUrl/render'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode(body),
        )
        .timeout(const Duration(seconds: 45));

    if (res.statusCode != 200 && res.statusCode != 202) {
      throw Exception('Backend ${res.statusCode}: ${res.body}');
    }

    final data = jsonDecode(res.body) as Map<String, dynamic>;

    // Compatibilidad: si el backend viejo devolviera la URL directa
    final directUrl = data['url'] as String?;
    if (directUrl != null && directUrl.isNotEmpty) return directUrl;

    final jobId = data['jobId'] as String?;
    if (jobId == null || jobId.isEmpty) {
      throw Exception('Backend no devolvió jobId');
    }

    // 2. Consultar el estado hasta que termine
    final deadline = DateTime.now().add(_maxWait);
    while (DateTime.now().isBefore(deadline)) {
      await Future.delayed(_pollInterval);

      final http.Response st;
      try {
        st = await http
            .get(Uri.parse('$kVideoBackendUrl/status/$jobId'))
            .timeout(const Duration(seconds: 20));
      } catch (_) {
        continue; // red intermitente: reintentar en el próximo ciclo
      }

      if (st.statusCode == 404) {
        throw Exception('El backend perdió el trabajo (reinicio del servidor)');
      }
      if (st.statusCode != 200) continue;

      final s = jsonDecode(st.body) as Map<String, dynamic>;
      final state = s['state'] as String?;
      final progress = s['progress'];
      if (progress is int && onProgress != null) onProgress(progress);

      if (state == 'done') {
        final url = s['url'] as String?;
        if (url == null || url.isEmpty) {
          throw Exception('Backend no devolvió URL');
        }
        return url;
      }
      if (state == 'error') {
        throw Exception('Render falló: ${s['error'] ?? 'desconocido'}');
      }
      // queued / rendering → seguir esperando
    }
    throw Exception('El video tardó más de ${_maxWait.inMinutes} minutos');
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
