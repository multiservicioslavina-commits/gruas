import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'supabase_config.dart';
import 'services/auth_service.dart';
import 'services/ride_repository.dart';
import 'ride_controller.dart';
import 'screens/ride_home_screen.dart';
import 'screens/pre_rodada_screen.dart';
import 'screens/leader_panel_screen.dart';
import 'screens/ride_map_screen.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

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
