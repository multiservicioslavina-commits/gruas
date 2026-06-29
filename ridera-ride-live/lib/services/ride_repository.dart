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
        .map((rows) => rows.map((r) => Rider.fromSupabase(r)).toList());
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
  }) async {
    final code = _generateCode();
    await _sb.from('rides').insert({
      'id': code,
      'nombre': name,
      'lider_id': leaderUid,
      'estado': 'activa',
    });
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
    await _sb.from('members').upsert({
      'ride_id': rideId,
      'uid': uid,
      'rol': 'rider',
      'nombre': name,
    });
  }

  Future<void> approve(String rideId, String uid) async {
    await _sb
        .from('members')
        .update({'rol': 'rider'})
        .eq('ride_id', rideId)
        .eq('uid', uid);
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
