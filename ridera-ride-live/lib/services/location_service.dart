import 'dart:async';
import 'package:supabase_flutter/supabase_flutter.dart';

class LocationService {
  Timer? _pushTimer;
  String? _rideId;
  String? _uid;

  Future<void> start({required String rideId, required String uid}) async {
    _rideId = rideId;
    _uid = uid;

    _pushTimer?.cancel();
    _pushTimer = Timer.periodic(const Duration(seconds: 5), (_) => _push());
    await _push();
  }

  Future<void> _push() async {
    if (_rideId == null || _uid == null) return;
    try {
      await Supabase.instance.client
          .from('members')
          .update({
            'last_seen': DateTime.now().toUtc().toIso8601String(),
          })
          .eq('ride_id', _rideId!)
          .eq('uid', _uid!);
    } catch (_) {}
  }

  Future<void> stop() async {
    _pushTimer?.cancel();
    _pushTimer = null;
  }
}
