import 'package:supabase_flutter/supabase_flutter.dart';

class AuthService {
  SupabaseClient get _sb => Supabase.instance.client;

  User? get user => _sb.auth.currentUser;
  String? get uid => _sb.auth.currentUser?.id;
  bool get isSignedIn => _sb.auth.currentUser != null;

  Future<String> ensureSignedIn() async {
    if (_sb.auth.currentUser == null) {
      await _sb.auth.signInAnonymously();
    }
    return _sb.auth.currentUser!.id;
  }

  Future<void> setDisplayName(String name) async {
    await _sb.auth.updateUser(UserAttributes(data: {'name': name}));
  }

  Future<void> signOut() => _sb.auth.signOut();
}
