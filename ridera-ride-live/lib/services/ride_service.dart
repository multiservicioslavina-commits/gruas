import 'dart:math';
import 'package:supabase_flutter/supabase_flutter.dart';

class RideService {
  RideService({SupabaseClient? client})
      : _sb = client ?? Supabase.instance.client;

  final SupabaseClient _sb;

  String get _uid => _sb.auth.currentUser!.id;

  String _generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    final rng = Random.secure();
    return List.generate(6, (_) => chars[rng.nextInt(chars.length)]).join();
  }

  Future<Map<String, dynamic>> createRide(String nombre) async {
    final code = _generateCode();
    final ride = {
      'id': code,
      'nombre': nombre,
      'lider_id': _uid,
      'estado': 'activa',
    };

    await _sb.from('rides').insert(ride);

    await _sb.from('members').insert({
      'ride_id': code,
      'uid': _uid,
      'rol': 'lider',
      'nombre': nombre,
    });

    return ride;
  }

  Future<Map<String, dynamic>> joinRide(String code) async {
    final ride = await _sb
        .from('rides')
        .select()
        .eq('id', code.toUpperCase().trim())
        .eq('estado', 'activa')
        .single();

    // Get rider name: try riders table first, fallback to auth metadata
    String nombre = '';
    try {
      final rider = await _sb
          .from('riders')
          .select('nombre')
          .eq('id', _uid)
          .single();
      nombre = rider['nombre'] ?? '';
    } catch (_) {
      nombre = _sb.auth.currentUser?.userMetadata?['name'] ?? 'Piloto';
    }

    // Si ya estuvo como rider/lider (salió por error), lo devolvemos con el
    // mismo rol y limpiamos finished_at para no perder ruta ni fotos.
    final existing = await _sb
        .from('members')
        .select('rol')
        .eq('ride_id', ride['id'])
        .eq('uid', _uid)
        .maybeSingle();

    if (existing != null && existing['rol'] != 'pendiente') {
      await _sb
          .from('members')
          .update({'finished_at': null, 'nombre': nombre})
          .eq('ride_id', ride['id'])
          .eq('uid', _uid);
    } else {
      await _sb.from('members').upsert(
        {
          'ride_id': ride['id'],
          'uid': _uid,
          'rol': 'rider',
          'nombre': nombre,
          'finished_at': null,
        },
        onConflict: 'ride_id,uid',
      );
    }

    return ride;
  }

  /// Sale de la rodada pero conserva la fila del member para el historial personal.
  Future<void> leaveRide(String rideId) async {
    await _sb
        .from('members')
        .update({'finished_at': DateTime.now().toUtc().toIso8601String()})
        .eq('ride_id', rideId)
        .eq('uid', _uid);
  }

  Future<void> endRide(String rideId) async {
    await _sb
        .from('rides')
        .update({'estado': 'finalizada'})
        .eq('id', rideId)
        .eq('lider_id', _uid);
    // Marca la rodada como finalizada también en members del líder
    await _sb
        .from('members')
        .update({'finished_at': DateTime.now().toUtc().toIso8601String()})
        .eq('ride_id', rideId)
        .eq('uid', _uid);
  }

  /// Guarda el resumen calculado (distancia, tiempo, vel máx) en members.
  Future<void> saveRideSummary({
    required String rideId,
    required double distanceKm,
    required int durationSeconds,
    required double maxSpeedKmh,
  }) async {
    await _sb.from('members').update({
      'distance_km': distanceKm,
      'duration_seconds': durationSeconds,
      'max_speed_kmh': maxSpeedKmh,
      'finished_at': DateTime.now().toUtc().toIso8601String(),
    }).eq('ride_id', rideId).eq('uid', _uid);
  }

  /// Guarda la URL del video generado en el resumen de esta rodada.
  Future<void> saveRideVideo(String rideId, String videoUrl) async {
    await _sb
        .from('members')
        .update({'video_url': videoUrl})
        .eq('ride_id', rideId)
        .eq('uid', _uid);
  }

  /// Devuelve el historial de rodadas del usuario actual (más recientes primero).
  /// Incluye datos de la tabla rides (nombre, fecha) y del resumen personal.
  Future<List<Map<String, dynamic>>> getMyHistory() async {
    final data = await _sb
        .from('members')
        .select('ride_id, rol, distance_km, duration_seconds, max_speed_kmh, '
            'video_url, finished_at, joined_at, notes, hidden, '
            'rides(id, nombre, created_at, estado)')
        .eq('uid', _uid)
        .not('finished_at', 'is', null)
        .eq('hidden', false)
        .order('finished_at', ascending: false);
    return List<Map<String, dynamic>>.from(data);
  }

  /// Oculta una rodada del historial personal (soft delete).
  Future<void> hideRideFromHistory(String rideId) async {
    await _sb
        .from('members')
        .update({'hidden': true})
        .eq('ride_id', rideId)
        .eq('uid', _uid);
  }

  /// Guarda o actualiza la nota personal del piloto para una rodada.
  Future<void> saveRideNote(String rideId, String note) async {
    await _sb
        .from('members')
        .update({'notes': note.trim().isEmpty ? null : note.trim()})
        .eq('ride_id', rideId)
        .eq('uid', _uid);
  }

  /// Fotos de una rodada para el diario personal.
  Future<List<String>> getRidePhotoUrls(String rideId) async {
    final data = await _sb
        .from('ride_photos')
        .select('url')
        .eq('ride_id', rideId)
        .eq('uid', _uid)
        .order('created_at')
        .limit(6);
    return List<Map<String, dynamic>>.from(data)
        .map((p) => p['url'] as String)
        .toList();
  }

  Future<List<Map<String, dynamic>>> getMembers(String rideId) async {
    final data = await _sb
        .from('members')
        .select()
        .eq('ride_id', rideId);
    return List<Map<String, dynamic>>.from(data);
  }

  RealtimeChannel subscribeMembersRealtime(
    String rideId,
    void Function(Map<String, dynamic> payload) onUpdate,
  ) {
    return _sb
        .channel('ride_$rideId')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'members',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'ride_id',
            value: rideId,
          ),
          // Blindado: si el callback lanza excepción no queremos que crashee la app
          callback: (payload) {
            try {
              onUpdate(payload.newRecord);
            } catch (_) {}
          },
        )
        .subscribe(
          (status, error) {
            // Loggear pero NO crashear ante desconexiones (modo avión, red débil)
            if (error != null) {
              // ignore: avoid_print
              print('Realtime status $status error: $error');
            }
          },
        );
  }
}
