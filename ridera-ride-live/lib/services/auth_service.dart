import 'package:supabase_flutter/supabase_flutter.dart';

class AuthService {
  SupabaseClient get _sb => Supabase.instance.client;

  User? get user => _sb.auth.currentUser;
  String? get uid => _sb.auth.currentUser?.id;
  bool get isSignedIn =>
      _sb.auth.currentUser != null &&
      _sb.auth.currentUser!.isAnonymous != true;

  Future<void> signUp({
    required String email,
    required String password,
    required Map<String, dynamic> profile,
  }) async {
    final res = await _sb.auth.signUp(email: email, password: password);
    final userId = res.user?.id;
    if (userId == null) throw 'No se pudo crear la cuenta';
    await _sb.from('riders').upsert({
      'id': userId,
      'correo': email,
      ...profile,
    });
  }

  Future<void> signIn({required String email, required String password}) async {
    await _sb.auth.signInWithPassword(email: email, password: password);
  }

  Future<void> resetPassword(String email) async {
    await _sb.auth.resetPasswordForEmail(email);
  }

  Future<Map<String, dynamic>?> getProfile() async {
    final id = uid;
    if (id == null) return null;
    final res = await _sb.from('riders').select().eq('id', id).maybeSingle();
    return res;
  }

  Future<void> updateProfile(Map<String, dynamic> data) async {
    final id = uid;
    if (id == null) return;
    await _sb.from('riders').update(data).eq('id', id);
  }

  Future<void> signOut() => _sb.auth.signOut();

  // Legacy — usado internamente para rodadas anónimas antes del registro
  Future<String> ensureSignedIn() async {
    if (_sb.auth.currentUser == null) {
      await _sb.auth.signInAnonymously();
    }
    return _sb.auth.currentUser!.id;
  }

  Future<void> setDisplayName(String name) async {
    await _sb.auth.updateUser(UserAttributes(data: {'name': name}));
  }
}
