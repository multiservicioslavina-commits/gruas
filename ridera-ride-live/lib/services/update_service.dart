import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

class UpdateService {
  static Future<void> checkForUpdate(BuildContext context) async {
    try {
      final info = await PackageInfo.fromPlatform();
      final currentVersion = info.version;

      final row = await Supabase.instance.client
          .from('app_version')
          .select()
          .eq('id', 1)
          .single();

      final uid = Supabase.instance.client.auth.currentUser?.id;
      if (uid != null) {
        await Supabase.instance.client
            .from('riders')
            .update({'app_version': currentVersion})
            .eq('id', uid);
      }

      final latestVersion = row['version'] as String;
      final apkUrl = row['apk_url'] as String?;
      final releaseNotes = row['release_notes'] as String?;
      final forceUpdate = row['force_update'] as bool? ?? false;

      if (apkUrl == null || apkUrl.isEmpty) return;
      if (!_isNewer(latestVersion, currentVersion)) return;
      if (!context.mounted) return;

      showDialog(
        context: context,
        barrierDismissible: !forceUpdate,
        builder: (ctx) => AlertDialog(
          backgroundColor: const Color(0xFF1a1a1a),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: const Row(
            children: [
              Icon(Icons.system_update, color: Color(0xFFE85D20)),
              SizedBox(width: 10),
              Text('Nueva versión', style: TextStyle(color: Colors.white)),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Versión $latestVersion disponible (tienes $currentVersion)',
                style: const TextStyle(color: Colors.white70, fontSize: 14),
              ),
              if (releaseNotes != null && releaseNotes.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(releaseNotes,
                    style: const TextStyle(color: Colors.white54, fontSize: 13)),
              ],
            ],
          ),
          actions: [
            if (!forceUpdate)
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Después',
                    style: TextStyle(color: Colors.white54)),
              ),
            FilledButton(
              onPressed: () {
                launchUrl(Uri.parse(apkUrl),
                    mode: LaunchMode.externalApplication);
                if (!forceUpdate) Navigator.pop(ctx);
              },
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFFE85D20),
              ),
              child: const Text('Actualizar'),
            ),
          ],
        ),
      );
    } catch (_) {}
  }

  static bool _isNewer(String latest, String current) {
    final l = latest.split('.').map(int.tryParse).toList();
    final c = current.split('.').map(int.tryParse).toList();
    for (var i = 0; i < 3; i++) {
      final lv = i < l.length ? (l[i] ?? 0) : 0;
      final cv = i < c.length ? (c[i] ?? 0) : 0;
      if (lv > cv) return true;
      if (lv < cv) return false;
    }
    return false;
  }
}
