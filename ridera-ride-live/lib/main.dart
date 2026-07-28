import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map_tile_caching/flutter_map_tile_caching.dart';
import 'package:just_audio_background/just_audio_background.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'services/notification_service.dart';
import 'supabase_config.dart';
import 'theme.dart';
import 'screens/login_screen.dart';
import 'screens/ride_home_screen.dart';
import 'screens/splash_screen.dart';

Future<void> main() async {
  // Captura global de errores del framework Flutter — evita que la app se cierre
  // por excepciones no manejadas (por ejemplo pérdida de red por modo avión).
  FlutterError.onError = (details) {
    debugPrint('FlutterError capturado: ${details.exception}');
  };

  // runZonedGuarded atrapa errores asíncronos no manejados (WebSocket cae, etc)
  runZonedGuarded(() async {
    WidgetsFlutterBinding.ensureInitialized();

    try {
      await JustAudioBackground.init(
        androidNotificationChannelId: 'com.ridera.ridelive.audio',
        androidNotificationChannelName: 'Música',
        androidNotificationIcon: 'mipmap/ic_launcher',
        androidNotificationOngoing: true,
        androidStopForegroundOnPause: true,
      );
    } catch (e) {
      debugPrint('JustAudioBackground init falló: $e');
    }

    try {
      await FMTCObjectBoxBackend().initialise();
      await const FMTCStore('mapStore').manage.create();
    } catch (e) {
      debugPrint('FMTC init falló: $e');
    }

    try {
      await Supabase.initialize(
        url: kSupabaseUrl,
        anonKey: kSupabaseAnonKey,
      );
    } catch (e) {
      debugPrint('Supabase init falló: $e');
    }

    // Inicializar OneSignal (push notifications) — no bloquea si falla.
    try {
      await NotificationService.initialize();
      final currentUser = Supabase.instance.client.auth.currentUser;
      if (currentUser != null && currentUser.isAnonymous != true) {
        await NotificationService.linkToUser(currentUser.id);
      }
      Supabase.instance.client.auth.onAuthStateChange.listen((change) async {
        try {
          final u = change.session?.user;
          if (u != null && u.isAnonymous != true) {
            await NotificationService.linkToUser(u.id);
          } else if (change.event == AuthChangeEvent.signedOut) {
            await NotificationService.unlinkFromUser();
          }
        } catch (_) {}
      }, onError: (_) {});
    } catch (e) {
      debugPrint('OneSignal init falló: $e');
    }

    runApp(const RideraApp());
  }, (error, stack) {
    debugPrint('Zone capturó: $error');
  });
}

final navigatorKey = GlobalKey<NavigatorState>();

class RideraApp extends StatelessWidget {
  const RideraApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: navigatorKey,
      title: 'RIDERA AVENTURA',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: RColors.asphalt,
        colorScheme: const ColorScheme.dark(
          primary: RColors.brand,
          secondary: RColors.brand,
        ),
      ),
      home: const SplashScreen(),
    );
  }
}
