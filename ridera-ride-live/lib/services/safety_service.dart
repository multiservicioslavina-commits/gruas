import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:url_launcher/url_launcher.dart';

class SafetyService {
  static const _channel = MethodChannel('com.ridera.ridelive/gps');

  static String buildMessage({
    required String riderName,
    required double lat,
    required double lon,
  }) {
    final loc = 'https://maps.google.com/?q=$lat,$lon';
    return '🚨 SOS RIDERA: $riderName puede haber tenido una caída en la rodada. '
        'Última ubicación: $loc';
  }

  /// Solicita el permiso SEND_SMS (peligroso en Android).
  static Future<bool> ensureSmsPermission() async {
    final status = await Permission.sms.status;
    if (status.isGranted) return true;
    final asked = await Permission.sms.request();
    return asked.isGranted;
  }

  /// Envía SMS AUTOMÁTICAMENTE (sin abrir app de mensajes) usando SmsManager nativo.
  /// Si el nativo falla, cae al modo abierto con el usuario tocando "Enviar".
  static Future<bool> sendSosAuto({
    required String contactPhone,
    required String riderName,
    required double lat,
    required double lon,
  }) async {
    if (contactPhone.trim().isEmpty) return false;
    final msg = buildMessage(riderName: riderName, lat: lat, lon: lon);

    // Intentar nativo primero
    final ok = await ensureSmsPermission();
    if (ok) {
      try {
        final sent = await _channel.invokeMethod<bool>('sendSms', {
          'phone': contactPhone.trim(),
          'message': msg,
        });
        if (sent == true) return true;
      } catch (_) {}
    }

    // Fallback: abrir app de SMS
    return openSmsToContact(
      contactPhone: contactPhone,
      riderName: riderName,
      lat: lat,
      lon: lon,
    );
  }

  static Future<bool> openSmsToContact({
    required String contactPhone,
    required String riderName,
    required double lat,
    required double lon,
  }) async {
    if (contactPhone.trim().isEmpty) return false;
    final body = Uri.encodeComponent(
        buildMessage(riderName: riderName, lat: lat, lon: lon));
    final uri = Uri.parse('sms:${contactPhone.trim()}?body=$body');
    if (await canLaunchUrl(uri)) {
      return launchUrl(uri);
    }
    return false;
  }
}
