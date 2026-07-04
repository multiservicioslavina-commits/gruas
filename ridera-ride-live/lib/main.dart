import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'services/notification_service.dart';
import 'supabase_config.dart';
import 'theme.dart';
import 'screens/login_screen.dart';
import 'screens/ride_home_screen.dart';
import 'screens/splash_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Supabase.initialize(
    url: kSupabaseUrl,
    anonKey: kSupabaseAnonKey,
  );

  // Inicializar OneSignal (push notifications).
  // Al iniciar sesión el usuario, se hace linkToUser(uid).
  await NotificationService.initialize();
  final currentUser = Supabase.instance.client.auth.currentUser;
  if (currentUser != null && currentUser.isAnonymous != true) {
    await NotificationService.linkToUser(currentUser.id);
  }
  // Vincular / desvincular en cada cambio de sesión.
  Supabase.instance.client.auth.onAuthStateChange.listen((change) async {
    final u = change.session?.user;
    if (u != null && u.isAnonymous != true) {
      await NotificationService.linkToUser(u.id);
    } else if (change.event == AuthChangeEvent.signedOut) {
      await NotificationService.unlinkFromUser();
    }
  });

  runApp(const RideraApp());
}

class RideraApp extends StatelessWidget {
  const RideraApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
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

class _AuthGate extends StatefulWidget {
  const _AuthGate();
  @override
  State<_AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<_AuthGate> {
  @override
  void initState() {
    super.initState();
    Supabase.instance.client.auth.onAuthStateChange.listen((_) {
      if (mounted) setState(() {});
    });
  }

  @override
  Widget build(BuildContext context) {
    final user = Supabase.instance.client.auth.currentUser;
    final isRealUser = user != null && user.isAnonymous != true;
    return isRealUser ? const RideHomeScreen() : const LoginScreen();
  }
}
