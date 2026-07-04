import 'package:flutter/foundation.dart';
import 'package:onesignal_flutter/onesignal_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../notif_config.dart';

/// Wrapper de OneSignal para RIDERA AVENTURA.
///
/// Uso:
///   await NotificationService.initialize();
///   await NotificationService.linkToUser(uid);
class NotificationService {
  static bool _initialized = false;

  /// Inicializa OneSignal. Llamar una sola vez en `main()`.
  static Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;

    OneSignal.Debug.setLogLevel(kDebugMode ? OSLogLevel.info : OSLogLevel.error);
    OneSignal.initialize(kOneSignalAppId);

    // Solicitar permiso de push (Android 13+ requiere permiso explícito)
    await OneSignal.Notifications.requestPermission(true);

    // Cuando el usuario toca una notificación, la ruteamos.
    OneSignal.Notifications.addClickListener((event) {
      final data = event.notification.additionalData;
      if (data != null) _handleNotificationTap(data);
    });
  }

  /// Vincula el player_id de OneSignal con el uid de Supabase para poder
  /// enviarle push targeted a este usuario.
  static Future<void> linkToUser(String supabaseUid) async {
    if (!_initialized) return;
    try {
      OneSignal.login(supabaseUid);
      // Guardar en Supabase el player_id (OneSignal subscription id)
      final subscriptionId = OneSignal.User.pushSubscription.id;
      if (subscriptionId != null && subscriptionId.isNotEmpty) {
        await _saveTokenToSupabase(supabaseUid, subscriptionId);
      }
      OneSignal.User.pushSubscription.addObserver((state) async {
        final id = state.current.id;
        if (id != null && id.isNotEmpty) {
          await _saveTokenToSupabase(supabaseUid, id);
        }
      });
    } catch (_) {}
  }

  /// Desvincula (típicamente al cerrar sesión).
  static Future<void> unlinkFromUser() async {
    if (!_initialized) return;
    try {
      OneSignal.logout();
    } catch (_) {}
  }

  static Future<void> _saveTokenToSupabase(String uid, String token) async {
    try {
      await Supabase.instance.client.from('rider_push_tokens').upsert(
        {
          'uid': uid,
          'onesignal_id': token,
          'updated_at': DateTime.now().toUtc().toIso8601String(),
        },
        onConflict: 'uid',
      );
    } catch (_) {}
  }

  static void _handleNotificationTap(Map<String, dynamic> data) {
    // Placeholder — cuando tengamos rutas nombradas, navegar según data['type']:
    // - 'sos': abrir mapa de la rodada con rideId=data['ride_id']
    // - 'ride_start': abrir la rodada
    // - 'new_member': mostrar quien se unió
    debugPrint('Notification tapped: $data');
  }
}
