import 'package:shared_preferences/shared_preferences.dart';

class SessionService {
  static const _kCode = 'ride_code';
  static const _kLeader = 'ride_leader';
  static const _kName = 'ride_name';
  static const _kRideId = 'ride_id';
  static const _kUid = 'ride_uid';

  Future<void> save({
    required String joinCode,
    required bool isLeader,
    required String name,
    String? rideId,
    String? uid,
  }) async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_kCode, joinCode);
    await p.setBool(_kLeader, isLeader);
    await p.setString(_kName, name);
    if (rideId != null) await p.setString(_kRideId, rideId);
    if (uid != null) await p.setString(_kUid, uid);
  }

  Future<Map<String, dynamic>?> load() async {
    final p = await SharedPreferences.getInstance();
    final code = p.getString(_kCode);
    if (code == null) return null;
    return {
      'code': code,
      'isLeader': p.getBool(_kLeader) ?? false,
      'name': p.getString(_kName) ?? '',
      'rideId': p.getString(_kRideId) ?? code,
      'uid': p.getString(_kUid) ?? '',
    };
  }

  Future<void> clear() async {
    final p = await SharedPreferences.getInstance();
    await p.remove(_kCode);
    await p.remove(_kLeader);
    await p.remove(_kName);
    await p.remove(_kRideId);
    await p.remove(_kUid);
  }
}
