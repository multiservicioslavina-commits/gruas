import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'supabase_config.dart';
import 'services/auth_service.dart';
import 'services/ride_repository.dart';
import 'services/safety_service.dart';
import 'ride_controller.dart';
import 'screens/ride_home_screen.dart';
import 'screens/pre_rodada_screen.dart';
import 'screens/leader_panel_screen.dart';
import 'screens/ride_map_screen.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize foreground task with valid notification config,
  // then stop any leftover service from a previous session.
  FlutterForegroundTask.init(
    androidNotificationOptions: AndroidNotificationOptions(
      channelId: 'ridera_ride_v2',
      channelName: 'Rodada RIDERA',
      channelDescription: 'Comparte tu ubicacion con el convoy',
      channelImportance: NotificationChannelImportance.DEFAULT,
      priority: NotificationPriority.DEFAULT,
    ),
    iosNotificationOptions: const IOSNotificationOptions(),
    foregroundTaskOptions: ForegroundTaskOptions(
      eventAction: ForegroundTaskEventAction.nothing(),
      autoRunOnBoot: false,
      allowWakeLock: false,
      allowWifiLock: false,
    ),
  );
  try {
    if (await FlutterForegroundTask.isRunningService) {
      await FlutterForegroundTask.stopService();
    }
  } catch (_) {}

  await Supabase.initialize(
    url: kSupabaseUrl,
    anonKey: kSupabaseAnonKey,
  );

  final auth = AuthService();
  await auth.ensureSignedIn();

  runApp(const RideraApp());
}

class RideraApp extends StatelessWidget {
  const RideraApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'RIDERA Ride Live',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: RColors.asphalt,
        colorScheme: const ColorScheme.dark(
          primary: RColors.brand,
          secondary: RColors.brand,
        ),
      ),
      home: const RideHomeScreen(),
    );
  }
}

class RideraHome extends StatefulWidget {
  final RideController controller;
  final RideRepository repo;
  final String rideId;
  final bool isLeader;
  final String joinCode;

  const RideraHome({
    super.key,
    required this.controller,
    required this.repo,
    required this.rideId,
    required this.isLeader,
    required this.joinCode,
  });

  @override
  State<RideraHome> createState() => _RideraHomeState();
}

class _RideraHomeState extends State<RideraHome> {
  bool _started = false;
  StreamSubscription<void>? _crashSub;

  @override
  void initState() {
    super.initState();
    _crashSub = widget.controller.crashSuspected.listen((_) => _onCrash());
  }

  @override
  void dispose() {
    _crashSub?.cancel();
    super.dispose();
  }

  Future<void> _onCrash() async {
    if (!mounted) return;
    final c = widget.controller;
    final confirm = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => AlertDialog(
        backgroundColor: RColors.asphalt3,
        title: const Row(children: [
          Icon(Icons.warning_amber, color: RColors.sos, size: 28),
          SizedBox(width: 8),
          Text('¿Caída detectada?', style: TextStyle(color: RColors.sos)),
        ]),
        content: const Text(
          'Se detectó un impacto fuerte. Si no cancelas en 15 segundos se enviará SOS automáticamente.',
          style: TextStyle(color: RColors.ink),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Estoy bien', style: TextStyle(color: RColors.ok)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('ENVIAR SOS', style: TextStyle(color: RColors.sos, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );

    if (confirm == true || confirm == null) {
      await c.confirmCrashSos();
      if (c.emergencyPhone.isNotEmpty) {
        SafetyService.openSmsToContact(
          contactPhone: c.emergencyPhone,
          riderName: c.rideName,
          lat: c.myLat,
          lon: c.myLon,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_started) {
      return Scaffold(
        backgroundColor: RColors.asphalt,
        body: PreRodadaScreen(
          controller: widget.controller,
          repo: widget.repo,
          rideId: widget.rideId,
          isLeader: widget.isLeader,
          joinCode: widget.joinCode,
          onStart: () => setState(() => _started = true),
        ),
      );
    }

    if (widget.isLeader) {
      return Scaffold(
        backgroundColor: RColors.asphalt,
        body: LeaderPanelScreen(controller: widget.controller),
        floatingActionButton: FloatingActionButton(
          onPressed: () {
            Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => RideMapScreen(
                rideId: widget.rideId,
                isLider: true,
              ),
            ));
          },
          backgroundColor: RColors.brand,
          child: const Icon(Icons.map, color: Colors.white),
        ),
      );
    }

    return RideMapScreen(
      rideId: widget.rideId,
      isLider: false,
    );
  }
}
