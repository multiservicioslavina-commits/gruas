import 'package:supabase_flutter/supabase_flutter.dart';

/// Cliente Dart de la Edge Function `send-push`.
/// La app llama esto para disparar notifs (ej: SOS enviado, alguien se une).
class PushDispatcher {
  static Future<bool> sendToRide({
    required String rideId,
    required String title,
    required String body,
    Map<String, dynamic>? data,
  }) => _invoke({
        'ride_id': rideId,
        'title': title,
        'body': body,
        if (data != null) 'data': data,
      });

  static Future<bool> sendToUsers({
    required List<String> uids,
    required String title,
    required String body,
    Map<String, dynamic>? data,
  }) => _invoke({
        'to_uids': uids,
        'title': title,
        'body': body,
        if (data != null) 'data': data,
      });

  static Future<bool> _invoke(Map<String, dynamic> body) async {
    try {
      final res = await Supabase.instance.client.functions.invoke(
        'send-push',
        body: body,
      );
      return res.status == 200;
    } catch (_) {
      return false;
    }
  }
}
