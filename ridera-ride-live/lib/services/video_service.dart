import 'dart:convert';
import 'package:http/http.dart' as http;

import '../video_config.dart';

const _shotstackUrl = 'https://api.shotstack.io/edit/stage/render';

class VideoService {
  /// Genera un video highlight estilo Relive.
  /// Retorna el render ID para consultar el estado.
  Future<String> requestRender({
    required String rideName,
    required String elapsed,
    required String distanceKm,
    required String maxSpeedKmh,
    required List<Map<String, dynamic>> photos, // [{url, lat, lon}]
    required List<Map<String, double>> routePoints, // [{lat, lon}]
  }) async {
    // Simplificar ruta a max 30 puntos para mantener URLs cortas
    final route = _simplify(routePoints, 30);
    final clips = <Map<String, dynamic>>[];

    double t = 0;

    // ── 1. Intro: nombre de la rodada ──────────────────────────────────
    clips.add({
      'asset': {
        'type': 'html',
        'html': '<p>${_esc(rideName)}</p>',
        'css': 'p { font-family: Arial Black, sans-serif; font-size: 72px; color: #E85D20; text-align: center; font-weight: 900; text-shadow: 0 0 30px rgba(232,93,32,0.7); }',
        'width': 1080,
        'height': 300,
      },
      'start': t,
      'length': 3,
      'position': 'center',
      'transition': {'in': 'fade', 'out': 'fade'},
    });
    clips.add({
      'asset': {
        'type': 'html',
        'html': '<p>🏍 RIDERA AVENTURA</p>',
        'css': 'p { font-family: Arial, sans-serif; font-size: 28px; color: #ffffff; text-align: center; letter-spacing: 8px; font-weight: 300; }',
        'width': 1080,
        'height': 100,
      },
      'start': t,
      'length': 3,
      'position': 'bottom',
      'offset': {'y': 0.15},
      'transition': {'in': 'fade', 'out': 'fade'},
    });
    t += 3;

    // ── 2. Por cada foto: mapa de ubicación → foto ─────────────────────
    final photoList = photos.take(8).toList();
    for (final photo in photoList) {
      final url = photo['url'] as String?;
      final lat = (photo['lat'] as num?)?.toDouble();
      final lon = (photo['lon'] as num?)?.toDouble();
      if (url == null) continue;

      // Si la foto tiene coordenadas, mostrar mapa de dónde fue tomada
      if (lat != null && lon != null && route.isNotEmpty) {
        final mapUrl = _buildPhotoMapUrl(lat, lon, route);
        clips.add({
          'asset': {'type': 'image', 'src': mapUrl},
          'start': t,
          'length': 2.5,
          'effect': 'zoomIn',
          'transition': {'in': 'fade', 'out': 'fade'},
        });
        t += 2.5;
      }

      // Foto
      clips.add({
        'asset': {'type': 'image', 'src': url},
        'start': t,
        'length': 3,
        'effect': 'slideLeft',
        'transition': {'in': 'fade', 'out': 'fade'},
      });
      t += 3;
    }

    // ── 3. Vista general de la ruta con estadísticas ───────────────────
    if (route.isNotEmpty) {
      final overviewUrl = _buildOverviewMapUrl(route);
      clips.add({
        'asset': {'type': 'image', 'src': overviewUrl},
        'start': t,
        'length': 4,
        'effect': 'zoomIn',
        'transition': {'in': 'fade', 'out': 'fade'},
      });
      clips.add({
        'asset': {
          'type': 'html',
          'html': '<div><span>📍 $distanceKm km</span> &nbsp; <span>⏱ $elapsed</span> &nbsp; <span>⚡ $maxSpeedKmh km/h</span></div>',
          'css': 'div { font-family: Arial, sans-serif; font-size: 32px; color: #ffffff; background: rgba(0,0,0,0.6); padding: 16px 28px; border-radius: 40px; font-weight: 700; }',
          'width': 900,
          'height': 80,
        },
        'start': t,
        'length': 4,
        'position': 'bottom',
        'offset': {'y': 0.1},
        'transition': {'in': 'slideUp', 'out': 'fade'},
      });
      t += 4;
    }

    // ── 4. Cierre ──────────────────────────────────────────────────────
    clips.add({
      'asset': {
        'type': 'html',
        'html': '<p>🏍 RIDERA AVENTURA</p>',
        'css': 'p { font-family: Arial Black, sans-serif; font-size: 48px; color: #E85D20; text-align: center; font-weight: 900; letter-spacing: 6px; }',
        'width': 1080,
        'height': 200,
      },
      'start': t,
      'length': 3,
      'position': 'center',
      'transition': {'in': 'fade'},
    });

    final body = {
      'timeline': {
        'background': '#0e0e0e',
        'tracks': [
          {'clips': clips},
        ],
      },
      'output': {
        'format': 'mp4',
        'size': {'width': 1080, 'height': 1080},
        'fps': 25,
      },
    };

    final res = await http.post(
      Uri.parse(_shotstackUrl),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': kShotstackKey,
      },
      body: jsonEncode(body),
    );

    if (res.statusCode != 201 && res.statusCode != 200) {
      throw Exception('Shotstack error ${res.statusCode}: ${res.body}');
    }

    final data = jsonDecode(res.body);
    return data['response']['id'] as String;
  }

  /// Consulta el estado del render. Retorna url cuando está listo, null si sigue procesando.
  Future<String?> checkRender(String renderId) async {
    final res = await http.get(
      Uri.parse('https://api.shotstack.io/edit/stage/render/$renderId'),
      headers: {'x-api-key': kShotstackKey},
    );
    if (res.statusCode != 200) return null;
    final data = jsonDecode(res.body);
    final status = data['response']['status'] as String?;
    if (status == 'done') {
      return data['response']['url'] as String?;
    }
    if (status == 'failed') throw Exception('Render failed');
    return null; // still processing
  }

  /// Mapa centrado en la ubicación de una foto con el trazado y un pin de cámara.
  String _buildPhotoMapUrl(double lat, double lon, List<Map<String, double>> route) {
    final coords = route.map((p) => '[${p['lon']},${p['lat']}]').join(',');
    final path = 'path-4+E85D20-0.9([$coords])';
    final pin = 'pin-s-camera+ffffff($lon,$lat)';
    return 'https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/'
        '$path,$pin/$lon,$lat,14,0/800x800?access_token=$kMapboxToken';
  }

  /// Mapa con vista general de toda la ruta.
  String _buildOverviewMapUrl(List<Map<String, double>> route) {
    final coords = route.map((p) => '[${p['lon']},${p['lat']}]').join(',');
    final path = 'path-4+E85D20-0.8([$coords])';
    final lat = route.map((p) => p['lat']!).reduce((a, b) => a + b) / route.length;
    final lon = route.map((p) => p['lon']!).reduce((a, b) => a + b) / route.length;
    return 'https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/'
        '$path/$lon,$lat,13,0/1080x1080?access_token=$kMapboxToken';
  }

  /// Reduce la lista de puntos a max [maxPts] puntos conservando inicio y fin.
  List<Map<String, double>> _simplify(List<Map<String, double>> pts, int maxPts) {
    if (pts.length <= maxPts) return pts;
    final result = <Map<String, double>>[];
    final step = (pts.length - 1) / (maxPts - 1);
    for (int i = 0; i < maxPts; i++) {
      result.add(pts[(i * step).round()]);
    }
    return result;
  }

  String _esc(String s) => s
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
}
