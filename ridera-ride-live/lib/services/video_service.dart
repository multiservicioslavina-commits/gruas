import 'dart:convert';
import 'package:http/http.dart' as http;

import '../video_config.dart';

const _shotstackUrl = 'https://api.shotstack.io/edit/stage/render';

class VideoService {
  /// Genera un video highlight de la rodada.
  /// Retorna el render ID para consultar el estado.
  Future<String> requestRender({
    required String rideName,
    required String elapsed,
    required String distanceKm,
    required String maxSpeedKmh,
    required List<String> photoUrls,
    required List<Map<String, double>> routePoints, // [{lat, lon}]
  }) async {
    final clips = <Map<String, dynamic>>[];

    // ── 1. Intro: nombre de la rodada ──────────────────────────────────
    clips.add({
      'asset': {
        'type': 'html',
        'html': '<p>${_esc(rideName)}</p>',
        'css':
            'p { font-family: Arial Black, sans-serif; font-size: 72px; color: #E85D20; text-align: center; font-weight: 900; text-shadow: 0 0 30px rgba(232,93,32,0.7); }',
        'width': 1080,
        'height': 300,
      },
      'start': 0,
      'length': 3,
      'position': 'center',
      'transition': {'in': 'fadeIn', 'out': 'fadeOut'},
    });

    // ── 2. Logo RIDERA ─────────────────────────────────────────────────
    clips.add({
      'asset': {
        'type': 'html',
        'html': '<p>🏍 RIDERA RIDE LIVE</p>',
        'css':
            'p { font-family: Arial, sans-serif; font-size: 28px; color: #ffffff; text-align: center; letter-spacing: 8px; font-weight: 300; }',
        'width': 1080,
        'height': 100,
      },
      'start': 0,
      'length': 3,
      'position': 'bottomCenter',
      'offset': {'y': 0.15},
      'transition': {'in': 'fadeIn', 'out': 'fadeOut'},
    });

    // ── 3. Mapa estático con trazado (Mapbox Static API) ───────────────
    if (routePoints.isNotEmpty) {
      final mapUrl = _buildMapUrl(routePoints);
      clips.add({
        'asset': {'type': 'image', 'src': mapUrl},
        'start': 3,
        'length': 4,
        'effect': 'zoomIn',
        'transition': {'in': 'fadeIn', 'out': 'fadeOut'},
      });
      // Overlay de datos sobre el mapa
      clips.add({
        'asset': {
          'type': 'html',
          'html':
              '<div><span>📍 $distanceKm km</span> &nbsp; <span>⏱ $elapsed</span> &nbsp; <span>⚡ $maxSpeedKmh km/h</span></div>',
          'css':
              'div { font-family: Arial, sans-serif; font-size: 32px; color: #ffffff; background: rgba(0,0,0,0.6); padding: 16px 28px; border-radius: 40px; font-weight: 700; }',
          'width': 900,
          'height': 80,
        },
        'start': 3,
        'length': 4,
        'position': 'bottomCenter',
        'offset': {'y': 0.1},
        'transition': {'in': 'slideInBottom', 'out': 'fadeOut'},
      });
    }

    // ── 4. Fotos de la rodada ──────────────────────────────────────────
    double t = routePoints.isNotEmpty ? 7 : 3;
    for (final url in photoUrls.take(10)) {
      clips.add({
        'asset': {'type': 'image', 'src': url},
        'start': t,
        'length': 3,
        'effect': 'slideLeft',
        'transition': {'in': 'fadeIn', 'out': 'fadeOut'},
      });
      t += 3;
    }

    // ── 5. Cierre ──────────────────────────────────────────────────────
    clips.add({
      'asset': {
        'type': 'html',
        'html': '<p>🏍 RIDERA RIDE LIVE</p>',
        'css':
            'p { font-family: Arial Black, sans-serif; font-size: 48px; color: #E85D20; text-align: center; font-weight: 900; letter-spacing: 6px; }',
        'width': 1080,
        'height': 200,
      },
      'start': t,
      'length': 3,
      'position': 'center',
      'transition': {'in': 'fadeIn'},
    });

    final totalLength = t + 3;

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

  String _buildMapUrl(List<Map<String, double>> points) {
    // Polyline codificada para Mapbox Static API
    final coords = points
        .map((p) => '[${p['lon']},${p['lat']}]')
        .join(',');
    final path = 'path-4+E85D20-0.8([$coords])';
    // Centro aproximado
    final lat = points.map((p) => p['lat']!).reduce((a, b) => a + b) / points.length;
    final lon = points.map((p) => p['lon']!).reduce((a, b) => a + b) / points.length;
    return 'https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/'
        '$path/$lon,$lat,13,0/1080x1080?access_token=$kMapboxToken';
  }

  String _esc(String s) => s
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');

  // Calcula duración total del video en segundos
  double totalDuration(int photoCount, bool hasRoute) {
    double t = hasRoute ? 7 : 3;
    t += photoCount.clamp(0, 10) * 3.0;
    t += 3;
    return t;
  }
}
