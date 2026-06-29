import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/rider.dart';

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
}
