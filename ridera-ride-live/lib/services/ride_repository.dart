import 'dart:math';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/rider.dart';

class RideResult {
  final String id;
  final String name;
  final String joinCode;
  RideResult(this.id, this.name, this.joinCode);
}

class RideRepository {
  RideRepository({SupabaseClient? client})
      : _sb = client ?? Supabase.instance.client;

  final SupabaseClient _sb;

  Stream<List<Rider>> membersStream(String rideId) {
    return _sb
        .from('members')
        .stream(primaryKey: ['id'])
        .eq('ride_id', rideId)
        .map((rows) => rows
            .where((r) => r['rol'] != 'pendiente')
            .map((r) => Rider.fromSupabase(r))
            .toList());
  }

  Future<void> updateTelemetry({
    required String rideId,
    required String uid,
    required double lat,
    required double lon,
    required double speedKmh,
    int statusCode = 0,
  }) async {
    await _sb
        .from('members')
        .update({
          'lat': lat,
          'lon': lon,
          'speed_kmh': speedKmh,
          'status_code': statusCode,
          'last_seen': DateTime.now().toUtc().toIso8601String(),
        })
        .eq('ride_id', rideId)
        .eq('uid', uid);
  }

  Future<void> setStatus(
      String rideId, String uid, RiderStatus status) async {
    await _sb
        .from('members')
        .update({'status_code': status.code})
        .eq('ride_id', rideId)
        .eq('uid', uid);
  }

  Future<void> updateEmergencyContact(
    String rideId,
    String uid,
    String name,
    String phone,
  ) async {
    await _sb
        .from('members')
        .update({
          'emergency_name': name,
          'emergency_phone': phone,
        })
        .eq('ride_id', rideId)
        .eq('uid', uid);
  }

  Future<void> remove(String rideId, String uid) async {
    await _sb
        .from('members')
        .delete()
        .eq('ride_id', rideId)
        .eq('uid', uid);
  }

  String _generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    final rng = Random.secure();
    return List.generate(6, (_) => chars[rng.nextInt(chars.length)]).join();
  }

  Future<RideResult> createRide({
    required String name,
    required String leaderUid,
    required String leaderName,
    Map<String, dynamic>? plannedRouteGeoJson,
    List<Map<String, dynamic>>? plannedSteps,
    String? originName,
    String? destinationName,
    double? originLat,
    double? originLon,
    double? destinationLat,
    double? destinationLon,
    double? plannedDistanceKm,
    int? plannedDurationMin,
    String? driveFolderUrl,
  }) async {
    final code = _generateCode();
    final rideRow = <String, dynamic>{
      'id': code,
      'nombre': name,
      'lider_id': leaderUid,
      'estado': 'activa',
    };
    if (plannedRouteGeoJson != null) rideRow['planned_route'] = plannedRouteGeoJson;
    if (plannedSteps != null) rideRow['planned_steps'] = plannedSteps;
    if (originName != null) rideRow['origin_name'] = originName;
    if (destinationName != null) rideRow['destination_name'] = destinationName;
    if (originLat != null) rideRow['origin_lat'] = originLat;
    if (originLon != null) rideRow['origin_lon'] = originLon;
    if (destinationLat != null) rideRow['destination_lat'] = destinationLat;
    if (destinationLon != null) rideRow['destination_lon'] = destinationLon;
    if (plannedDistanceKm != null) rideRow['planned_distance_km'] = plannedDistanceKm;
    if (plannedDurationMin != null) rideRow['planned_duration_min'] = plannedDurationMin;
    if (driveFolderUrl != null && driveFolderUrl.isNotEmpty) {
      rideRow['drive_folder_url'] = driveFolderUrl;
    }

    await _sb.from('rides').insert(rideRow);
    await _sb.from('members').insert({
      'ride_id': code,
      'uid': leaderUid,
      'rol': 'lider',
      'nombre': leaderName,
    });
    return RideResult(code, name, code);
  }

  Future<RideResult?> findByCode(String code) async {
    try {
      final row = await _sb
          .from('rides')
          .select()
          .eq('id', code.toUpperCase().trim())
          .eq('estado', 'activa')
          .single();
      return RideResult(row['id'], row['nombre'] ?? '', row['id']);
    } catch (_) {
      return null;
    }
  }

  Future<void> requestJoin({
    required String rideId,
    required String uid,
    required String name,
  }) async {
    // Si ya existe como rider/lider (aunque haya salido), NO lo bajamos a
    // "pendiente" — solo limpiamos finished_at para que vuelva a la rodada.
    final existing = await _sb
        .from('members')
        .select('rol')
        .eq('ride_id', rideId)
        .eq('uid', uid)
        .maybeSingle();

    if (existing != null && existing['rol'] != 'pendiente') {
      // Rejoin: mantener rol, borrar marca de salida
      await _sb
          .from('members')
          .update({'finished_at': null, 'nombre': name})
          .eq('ride_id', rideId)
          .eq('uid', uid);
      return;
    }

    // Primera vez o antes rechazado → entra como pendiente
    await _sb.from('members').upsert(
      {
        'ride_id': rideId,
        'uid': uid,
        'rol': 'pendiente',
        'nombre': name,
        'finished_at': null,
      },
      onConflict: 'ride_id,uid',
    );

    // Notif push al líder: nueva solicitud
    try {
      final ride = await _sb
          .from('rides')
          .select('lider_id, nombre')
          .eq('id', rideId)
          .maybeSingle();
      if (ride != null) {
        await _sb.functions.invoke('send-push', body: {
          'to_uids': [ride['lider_id']],
          'title': 'Nueva solicitud en la rodada',
          'body': '$name quiere unirse a ${ride['nombre'] ?? "tu rodada"}.',
          'data': {'type': 'join_request', 'ride_id': rideId, 'uid': uid},
        });
      }
    } catch (_) {}
  }

  Future<void> approve(String rideId, String uid) async {
    await _sb
        .from('members')
        .update({'rol': 'rider'})
        .eq('ride_id', rideId)
        .eq('uid', uid);
    // Notif al piloto: fue aprobado
    try {
      final ride = await _sb
          .from('rides')
          .select('nombre')
          .eq('id', rideId)
          .maybeSingle();
      await _sb.functions.invoke('send-push', body: {
        'to_uids': [uid],
        'title': '✅ Estás en la rodada',
        'body': 'El líder te aprobó en ${ride?['nombre'] ?? "la rodada"}.',
        'data': {'type': 'approved', 'ride_id': rideId},
      });
    } catch (_) {}
  }

  Stream<List<Rider>> pendingStream(String rideId) {
    return _sb
        .from('members')
        .stream(primaryKey: ['id'])
        .eq('ride_id', rideId)
        .map((rows) => rows
            .where((r) => r['rol'] == 'pendiente')
            .map((r) => Rider.fromSupabase(r))
            .toList());
  }
}
