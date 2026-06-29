import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'supabase_config.dart';
import 'screens/ride_home_screen.dart';
import 'screens/auth_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Supabase.initialize(
    url: kSupabaseUrl,
    anonKey: kSupabaseAnonKey,
  );

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
        scaffoldBackgroundColor: const Color(0xFF0e0e0e),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFFE85D20),
          secondary: Color(0xFFE85D20),
        ),
      ),
      home: Supabase.instance.client.auth.currentUser != null
          ? const RideHomeScreen()
          : const AuthScreen(),
    );
  }
}
