import 'package:url_launcher/url_launcher.dart';

class SafetyService {
  static String buildMessage({required String riderName, required double lat, required double lon}) {
    final loc = 'https://maps.google.com/?q=$lat,$lon';
    return '🚨 SOS RIDERA: $riderName puede haber tenido una caída en la rodada. '
        'Última ubicación: $loc';
  }

  static Future<bool> openSmsToContact({
    required String contactPhone,
    required String riderName,
    required double lat,
    required double lon,
  }) async {
    if (contactPhone.trim().isEmpty) return false;
    final body = Uri.encodeComponent(buildMessage(riderName: riderName, lat: lat, lon: lon));
    final uri = Uri.parse('sms:${contactPhone.trim()}?body=$body');
    if (await canLaunchUrl(uri)) {
      return launchUrl(uri);
    }
    return false;
  }
}
