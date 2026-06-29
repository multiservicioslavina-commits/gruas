import 'package:shared_preferences/shared_preferences.dart';

class SessionService {
  static const _kCode = 'ride_code';
  static const _kLeader = 'ride_leader';
  static const _kName = 'ride_name';

  Future<void> save({
    required String joinCode,
    required bool isLeader,
    required String name,
  }) async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_kCode, joinCode);
    await p.setBool(_kLeader, isLeader);
    await p.setString(_kName, name);
  }

  Future<Map<String, dynamic>?> load() async {
    final p = await SharedPreferences.getInstance();
    final code = p.getString(_kCode);
    if (code == null) return null;
    return {
      'code': code,
      'isLeader': p.getBool(_kLeader) ?? false,
      'name': p.getString(_kName) ?? '',
    };
  }

  Future<void> clear() async {
    final p = await SharedPreferences.getInstance();
    await p.remove(_kCode);
    await p.remove(_kLeader);
    await p.remove(_kName);
  }
}
