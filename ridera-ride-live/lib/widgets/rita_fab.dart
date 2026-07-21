import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../rita_config.dart';
import '../theme.dart';

class RitaFab extends StatefulWidget {
  final VoidCallback? onPressed;

  const RitaFab({
    super.key,
    this.onPressed,
  });

  @override
  State<RitaFab> createState() => _RitaFabState();
}

class _RitaFabState extends State<RitaFab>
    with SingleTickerProviderStateMixin {
  late AnimationController _animController;
  late Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      duration: const Duration(milliseconds: 600),
      vsync: this,
    );
    _scaleAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _animController, curve: Curves.elasticOut),
    );
    _animController.forward();
  }

  @override
  void dispose() {
    _animController.dispose();
    super.dispose();
  }

  Future<void> _openRitaChat() async {
    try {
      final url = Uri.parse(
        'https://wa.me/$kRitaWhatsAppNumber?text=${Uri.encodeComponent(kRitaGreeting)}',
      );
      await launchUrl(url, mode: LaunchMode.externalApplication);
    } catch (_) {}
    widget.onPressed?.call();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: _scaleAnimation,
      child: FloatingActionButton(
        onPressed: _openRitaChat,
        backgroundColor: RColors.brand,
        elevation: 6,
        child: const Icon(Icons.chat_bubble_outline, color: Colors.white),
      ),
    );
  }
}
