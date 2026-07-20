import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:onesignal_flutter/onesignal_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../main.dart' show navigatorKey;
import '../notif_config.dart';
import '../screens/ride_map_screen.dart';

class NotificationService {
  static bool _initialized = false;

  static Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;

    OneSignal.Debug.setLogLevel(kDebugMode ? OSLogLevel.info : OSLogLevel.error);
    OneSignal.initialize(kOneSignalAppId);

    await OneSignal.Notifications.requestPermission(true);

    OneSignal.Notifications.addClickListener((event) {
      final data = event.notification.additionalData;
      if (data != null) _handleNotificationTap(data);
    });
  }

  static Future<void> linkToUser(String supabaseUid) async {
    if (!_initialized) return;
    try {
      OneSignal.login(supabaseUid);
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
    final nav = navigatorKey.currentState;
    if (nav == null) return;

    final type = data['type'] as String?;
    final rideId = data['ride_id'] as String?;
    if (rideId == null) return;

    switch (type) {
      case 'sos':
      case 'ride_start':
      case 'new_member':
        nav.push(MaterialPageRoute(
          builder: (_) => RideMapScreen(
            rideId: rideId,
            isLider: false,
            rideName: data['ride_name'] as String? ?? 'Rodada',
          ),
        ));
      default:
        debugPrint('Notification type desconocido: $type');
    }
  }
}
