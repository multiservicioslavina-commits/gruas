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

    await _sb.from('members').upsert({
      'ride_id': ride['id'],
      'uid': _uid,
      'rol': 'rider',
      'nombre': nombre,
    });

    return ride;
  }

  Future<void> leaveRide(String rideId) async {
    await _sb
        .from('members')
        .delete()
        .eq('ride_id', rideId)
        .eq('uid', _uid);
  }

  Future<void> endRide(String rideId) async {
    await _sb
        .from('rides')
        .update({'estado': 'finalizada'})
        .eq('id', rideId)
        .eq('lider_id', _uid);
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
          callback: (payload) => onUpdate(payload.newRecord),
        )
        .subscribe();
  }
}
