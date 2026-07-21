import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

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
        builder: (ctx) => _UpdateDialog(
          latestVersion: latestVersion,
          currentVersion: currentVersion,
          releaseNotes: releaseNotes,
          forceUpdate: forceUpdate,
          apkUrl: apkUrl,
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

class _UpdateDialog extends StatefulWidget {
  const _UpdateDialog({
    required this.latestVersion,
    required this.currentVersion,
    required this.apkUrl,
    this.releaseNotes,
    this.forceUpdate = false,
  });

  final String latestVersion;
  final String currentVersion;
  final String apkUrl;
  final String? releaseNotes;
  final bool forceUpdate;

  @override
  State<_UpdateDialog> createState() => _UpdateDialogState();
}

class _UpdateDialogState extends State<_UpdateDialog> {
  bool _downloading = false;
  double _progress = 0;
  String? _error;

  Future<void> _downloadAndInstall() async {
    setState(() {
      _downloading = true;
      _progress = 0;
      _error = null;
    });

    try {
      final dir = await getTemporaryDirectory();
      final filePath = '${dir.path}/ridera_${widget.latestVersion}.apk';

      await Dio().download(
        widget.apkUrl,
        filePath,
        onReceiveProgress: (received, total) {
          if (total > 0) {
            setState(() => _progress = received / total);
          }
        },
      );

      final file = File(filePath);
      if (!await file.exists() || await file.length() < 1000000) {
        setState(() {
          _downloading = false;
          _error = 'Descarga incompleta. Intenta de nuevo.';
        });
        return;
      }

      final result = await OpenFilex.open(filePath, type: 'application/vnd.android.package-archive');

      if (result.type != ResultType.done) {
        setState(() {
          _downloading = false;
          _error = 'No se pudo abrir el instalador. Revisa los permisos.';
        });
      }
    } catch (e) {
      setState(() {
        _downloading = false;
        _error = 'Error al descargar: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
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
            'Versión ${widget.latestVersion} disponible (tienes ${widget.currentVersion})',
            style: const TextStyle(color: Colors.white70, fontSize: 14),
          ),
          if (widget.releaseNotes != null && widget.releaseNotes!.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(widget.releaseNotes!,
                style: const TextStyle(color: Colors.white54, fontSize: 13)),
          ],
          if (_downloading) ...[
            const SizedBox(height: 16),
            LinearProgressIndicator(
              value: _progress > 0 ? _progress : null,
              color: const Color(0xFFE85D20),
              backgroundColor: Colors.white12,
            ),
            const SizedBox(height: 8),
            Text(
              _progress > 0
                  ? 'Descargando… ${(_progress * 100).toInt()}%'
                  : 'Iniciando descarga…',
              style: const TextStyle(color: Colors.white54, fontSize: 12),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: Colors.redAccent, fontSize: 12)),
          ],
        ],
      ),
      actions: [
        if (!widget.forceUpdate && !_downloading)
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Después',
                style: TextStyle(color: Colors.white54)),
          ),
        if (!_downloading)
          FilledButton(
            onPressed: _downloadAndInstall,
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFFE85D20),
            ),
            child: Text(_error != null ? 'Reintentar' : 'Actualizar'),
          ),
      ],
    );
  }
}
