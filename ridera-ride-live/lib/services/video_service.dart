import 'dart:convert';
import 'package:http/http.dart' as http;

import '../video_config.dart';

const _shotstackUrl = 'https://api.shotstack.io/edit/stage/render';

class VideoService {
  /// Genera un video highlight estilo Relive con línea de ruta animada.
  /// Retorna el render ID para consultar el estado.
  Future<String> requestRender({
    required String rideName,
    required String elapsed,
    required String distanceKm,
    required String maxSpeedKmh,
    required List<Map<String, dynamic>> photos, // [{url, lat, lon}]
    required List<Map<String, double>> routePoints, // [{lat, lon}]
  }) async {
    // Simplificar ruta a max 40 puntos (equilibrio entre suavidad de línea y peso de URL)
    final route = _simplify(routePoints, 40);
    final clips = <Map<String, dynamic>>[];

    double t = 0;

    // ── 1. Intro: nombre de la rodada (2.5s) ───────────────────────────
    clips.add({
      'asset': {
        'type': 'html',
        'html': '<p>${_esc(rideName)}</p>',
        'css': 'p { font-family: Arial Black, sans-serif; font-size: 68px; color: #E85D20; text-align: center; font-weight: 900; text-shadow: 0 0 30px rgba(232,93,32,0.7); }',
        'width': 1080,
        'height': 300,
      },
      'start': t,
      'length': 2.5,
      'position': 'center',
      'transition': {'in': 'fade', 'out': 'fade'},
    });
    clips.add({
      'asset': {
        'type': 'html',
        'html': '<p>🏍 RIDERA AVENTURA</p>',
        'css': 'p { font-family: Arial, sans-serif; font-size: 26px; color: #ffffff; text-align: center; letter-spacing: 8px; font-weight: 300; }',
        'width': 1080,
        'height': 100,
      },
      'start': t,
      'length': 2.5,
      'position': 'bottom',
      'offset': {'y': 0.18},
      'transition': {'in': 'fade', 'out': 'fade'},
    });
    t += 2.5;

    // ── 2. Animación de la ruta creciendo (10s tipo Relive) ────────────
    if (route.length >= 2) {
      const routeAnimSec = 10.0; // duración total de la animación de línea
      const frames = 20;         // 20 frames = 0.5s cada uno
      final frameDur = routeAnimSec / frames;

      for (int i = 1; i <= frames; i++) {
        // Fracción del recorrido a mostrar en este frame (0.05, 0.10, ... 1.0)
        final progress = i / frames;
        final ptsCount = (route.length * progress).ceil().clamp(2, route.length);
        final partial = route.sublist(0, ptsCount);

        final url = _buildAnimatedFrameUrl(partial, route);
        clips.add({
          'asset': {'type': 'image', 'src': url},
          'start': t,
          'length': frameDur,
          // Sin transiciones entre frames — corte seco para simular animación fluida
        });
        t += frameDur;
      }

      // Overlay con "km" acumulados creciendo al final del trazado
      clips.add({
        'asset': {
          'type': 'html',
          'html': '<div>📍 $distanceKm km recorridos</div>',
          'css': 'div { font-family: Arial, sans-serif; font-size: 30px; color: #ffffff; background: rgba(232,93,32,0.85); padding: 14px 26px; border-radius: 40px; font-weight: 800; text-align: center; }',
          'width': 900,
          'height': 70,
        },
        'start': t - 2.5,
        'length': 2.5,
        'position': 'bottom',
        'offset': {'y': 0.12},
        'transition': {'in': 'slideUp', 'out': 'fade'},
      });
    }

    // ── 3. Fotos con contexto de dónde fueron tomadas ──────────────────
    final photoList = photos.take(6).toList(); // máx 6 fotos para no exceder 60s
    for (int idx = 0; idx < photoList.length; idx++) {
      final photo = photoList[idx];
      final url = photo['url'] as String?;
      final lat = (photo['lat'] as num?)?.toDouble();
      final lon = (photo['lon'] as num?)?.toDouble();
      if (url == null) continue;

      // Foto principal (3s con zoom lento)
      clips.add({
        'asset': {'type': 'image', 'src': url},
        'start': t,
        'length': 3.5,
        'effect': 'zoomIn',
        'transition': {'in': 'fade', 'out': 'fade'},
      });

      // Etiqueta pequeña con número de foto sobre la esquina
      if (lat != null && lon != null) {
        clips.add({
          'asset': {
            'type': 'html',
            'html': '<div>📷 Foto ${idx + 1} de ${photoList.length}</div>',
            'css': 'div { font-family: Arial, sans-serif; font-size: 22px; color: #ffffff; background: rgba(0,0,0,0.6); padding: 8px 16px; border-radius: 20px; font-weight: 600; }',
            'width': 400,
            'height': 44,
          },
          'start': t,
          'length': 3.5,
          'position': 'topLeft',
          'offset': {'x': 0.05, 'y': -0.05},
          'transition': {'in': 'fade', 'out': 'fade'},
        });
      }
      t += 3.5;
    }

    // ── 4. Cierre con estadísticas (4s) ────────────────────────────────
    if (route.isNotEmpty) {
      final overviewUrl = _buildOverviewMapUrl(route);
      clips.add({
        'asset': {'type': 'image', 'src': overviewUrl},
        'start': t,
        'length': 4,
        'effect': 'zoomOut',
        'transition': {'in': 'fade', 'out': 'fade'},
      });
      clips.add({
        'asset': {
          'type': 'html',
          'html': '<div><span>📍 $distanceKm km</span> &nbsp;·&nbsp; <span>⏱ $elapsed</span> &nbsp;·&nbsp; <span>⚡ $maxSpeedKmh km/h</span></div>',
          'css': 'div { font-family: Arial, sans-serif; font-size: 30px; color: #ffffff; background: rgba(0,0,0,0.7); padding: 16px 28px; border-radius: 40px; font-weight: 700; text-align: center; }',
          'width': 1000,
          'height': 80,
        },
        'start': t,
        'length': 4,
        'position': 'bottom',
        'offset': {'y': 0.15},
        'transition': {'in': 'slideUp', 'out': 'fade'},
      });
      t += 4;
    }

    // ── 5. Logo final RIDERA AVENTURA (2.5s) ───────────────────────────
    clips.add({
      'asset': {
        'type': 'html',
        'html': '<p>🏍 RIDERA AVENTURA</p>',
        'css': 'p { font-family: Arial Black, sans-serif; font-size: 46px; color: #E85D20; text-align: center; font-weight: 900; letter-spacing: 6px; text-shadow: 0 0 20px rgba(232,93,32,0.5); }',
        'width': 1080,
        'height': 200,
      },
      'start': t,
      'length': 2.5,
      'position': 'center',
      'transition': {'in': 'fade', 'out': 'fade'},
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

  /// Frame de la animación: dibuja el trazado completo tenue + parte recorrida brillante.
  /// La cámara sigue el punto final del segmento actual (dando sensación de avance).
  String _buildAnimatedFrameUrl(
      List<Map<String, double>> partial, List<Map<String, double>> full) {
    final fullCoords = full.map((p) => '[${p['lon']},${p['lat']}]').join(',');
    final partialCoords = partial.map((p) => '[${p['lon']},${p['lat']}]').join(',');

    // GeoJSON con dos features: ruta completa tenue + parte recorrida brillante + pin en el frente
    final head = partial.last;
    final geojson = '{"type":"FeatureCollection","features":['
        // Ruta completa (tenue, gris)
        '{"type":"Feature","properties":{"stroke":"#666666","stroke-width":3,"stroke-opacity":0.4},'
        '"geometry":{"type":"LineString","coordinates":[$fullCoords]}},'
        // Ruta recorrida (naranja, brillante)
        '{"type":"Feature","properties":{"stroke":"#E85D20","stroke-width":5,"stroke-opacity":1},'
        '"geometry":{"type":"LineString","coordinates":[$partialCoords]}},'
        // Pin en la posición actual (moto)
        '{"type":"Feature","properties":{"marker-color":"#E85D20","marker-size":"medium","marker-symbol":"marker"},'
        '"geometry":{"type":"Point","coordinates":[${head['lon']},${head['lat']}]}}'
        ']}';
    final encoded = Uri.encodeComponent(geojson);

    // Auto centra en toda la ruta completa (no salta cámara entre frames)
    return 'https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/'
        'geojson($encoded)/auto/1080x1080?access_token=$kMapboxToken&padding=80';
  }

  /// Mapa con vista general de toda la ruta — auto ajusta cámara al trazado.
  String _buildOverviewMapUrl(List<Map<String, double>> route) {
    final routeCoords = route.map((p) => '[${p['lon']},${p['lat']}]').join(',');
    final geojson =
        '{"type":"Feature","properties":{"stroke":"#E85D20","stroke-width":5,"stroke-opacity":0.9},'
        '"geometry":{"type":"LineString","coordinates":[$routeCoords]}}';
    final encoded = Uri.encodeComponent(geojson);
    return 'https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/'
        'geojson($encoded)/auto/1080x1080?access_token=$kMapboxToken&padding=60';
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
