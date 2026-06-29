import 'package:flutter/material.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'supabase_config.dart';
import 'services/auth_service.dart';
import 'screens/ride_home_screen.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  FlutterForegroundTask.init(
    androidNotificationOptions: AndroidNotificationOptions(
      channelId: 'ridera_ride_v3',
      channelName: 'RIDERA Rodada Activa',
      channelDescription: 'Comparte tu ubicacion con el convoy',
      channelImportance: NotificationChannelImportance.HIGH,
      priority: NotificationPriority.HIGH,
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
