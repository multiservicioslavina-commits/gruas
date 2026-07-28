import 'package:flutter/material.dart';
import 'package:just_audio/just_audio.dart';
import 'package:on_audio_query/on_audio_query.dart';
import '../services/music_service.dart';
import '../theme.dart';

class MusicPlayerScreen extends StatefulWidget {
  const MusicPlayerScreen({super.key});

  @override
  State<MusicPlayerScreen> createState() => _MusicPlayerScreenState();
}

class _MusicPlayerScreenState extends State<MusicPlayerScreen> {
  final _music = MusicService.instance;
  bool _loading = true;
  bool _hasPermission = false;
  final _searchCtrl = TextEditingController();
  String _search = '';

  @override
  void initState() {
    super.initState();
    _init();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _init() async {
    setState(() => _loading = true);
    final granted = await _music.requestPermission();
    if (granted) await _music.loadSongs();
    if (!mounted) return;
    setState(() {
      _hasPermission = granted;
      _loading = false;
    });
  }

  List<SongModel> get _filtered {
    if (_search.isEmpty) return _music.songs;
    final q = _search.toLowerCase();
    return _music.songs
        .where((s) =>
            s.title.toLowerCase().contains(q) ||
            (s.artist ?? '').toLowerCase().contains(q))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: RColors.asphalt,
      appBar: AppBar(
        backgroundColor: RColors.asphalt,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text(
          'Música local',
          style: TextStyle(
              color: Colors.white, fontWeight: FontWeight.w700, fontSize: 18),
        ),
        actions: [
          if (_hasPermission && _music.songs.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.shuffle_rounded, color: RColors.brand),
              tooltip: 'Aleatorio',
              onPressed: () async {
                final songs = _music.songs;
                if (songs.isEmpty) return;
                await _music.playFrom(List.from(songs)..shuffle(), 0);
              },
            ),
        ],
      ),
      body: _loading
          ? const Center(
              child: CircularProgressIndicator(color: RColors.brand))
          : !_hasPermission
              ? _PermissionView(onRetry: _init)
              : _music.songs.isEmpty
                  ? const _EmptyView()
                  : _buildSongList(),
      bottomNavigationBar: StreamBuilder<SequenceState?>(
        stream: _music.player.sequenceStateStream,
        builder: (ctx, snap) {
          final current = snap.data?.currentSource?.tag as SongModel?;
          if (current == null) return const SizedBox.shrink();
          return _MiniPlayer(music: _music, song: current);
        },
      ),
    );
  }

  Widget _buildSongList() {
    final songs = _filtered;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
          child: TextField(
            controller: _searchCtrl,
            onChanged: (v) => setState(() => _search = v),
            style: const TextStyle(color: RColors.ink),
            decoration: InputDecoration(
              hintText: 'Buscar canción o artista...',
              hintStyle: const TextStyle(color: RColors.inkDim),
              prefixIcon:
                  const Icon(Icons.search_rounded, color: RColors.inkDim),
              suffixIcon: _search.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.close, color: RColors.inkDim),
                      onPressed: () {
                        _searchCtrl.clear();
                        setState(() => _search = '');
                      },
                    )
                  : null,
              filled: true,
              fillColor: RColors.asphalt2,
              contentPadding: const EdgeInsets.symmetric(vertical: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: RColors.line),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: RColors.line),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: RColors.brand),
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          child: Row(
            children: [
              Text(
                '${songs.length} canciones',
                style:
                    const TextStyle(color: RColors.inkDim, fontSize: 12),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView.builder(
            itemCount: songs.length,
            itemBuilder: (ctx, i) {
              final song = songs[i];
              return StreamBuilder<SequenceState?>(
                stream: _music.player.sequenceStateStream,
                builder: (ctx, snap) {
                  final current =
                      snap.data?.currentSource?.tag as SongModel?;
                  final isPlaying = current?.id == song.id;
                  return _SongTile(
                    song: song,
                    isPlaying: isPlaying,
                    onTap: () async {
                      await _music.playFrom(songs, i);
                    },
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}

class _SongTile extends StatelessWidget {
  const _SongTile({
    required this.song,
    required this.isPlaying,
    required this.onTap,
  });
  final SongModel song;
  final bool isPlaying;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final duration = MusicService.instance.formatDuration(song.duration);
    return ListTile(
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
      leading: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: isPlaying
              ? RColors.brand.withValues(alpha: 0.2)
              : RColors.asphalt2,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
              color: isPlaying ? RColors.brand : RColors.line, width: 1),
        ),
        child: Icon(
          isPlaying ? Icons.equalizer_rounded : Icons.music_note_rounded,
          color: isPlaying ? RColors.brand : RColors.inkDim,
          size: 22,
        ),
      ),
      title: Text(
        song.title,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          color: isPlaying ? RColors.brand : RColors.ink,
          fontWeight: isPlaying ? FontWeight.w700 : FontWeight.w500,
          fontSize: 14,
        ),
      ),
      subtitle: Text(
        song.artist ?? 'Artista desconocido',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(color: RColors.inkDim, fontSize: 12),
      ),
      trailing: Text(
        duration,
        style: const TextStyle(color: RColors.inkFaint, fontSize: 12),
      ),
    );
  }
}

class _MiniPlayer extends StatelessWidget {
  const _MiniPlayer({required this.music, required this.song});
  final MusicService music;
  final SongModel song;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (_) => _FullPlayerSheet(music: music),
      ),
      child: Container(
        height: 72,
        decoration: const BoxDecoration(
          color: RColors.asphalt2,
          border: Border(top: BorderSide(color: RColors.line)),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: RColors.brand.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.music_note_rounded,
                  color: RColors.brand, size: 22),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    song.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 13),
                  ),
                  Text(
                    song.artist ?? 'Artista desconocido',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        color: RColors.inkDim, fontSize: 11),
                  ),
                ],
              ),
            ),
            StreamBuilder<PlayerState>(
              stream: music.player.playerStateStream,
              builder: (ctx, snap) {
                final playing = snap.data?.playing ?? false;
                return Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      icon: Icon(
                        playing
                            ? Icons.pause_rounded
                            : Icons.play_arrow_rounded,
                        color: Colors.white,
                        size: 30,
                      ),
                      onPressed: () => playing
                          ? music.player.pause()
                          : music.player.play(),
                    ),
                    IconButton(
                      icon: const Icon(Icons.skip_next_rounded,
                          color: RColors.inkDim, size: 26),
                      onPressed: () => music.player.seekToNext(),
                    ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _FullPlayerSheet extends StatefulWidget {
  const _FullPlayerSheet({required this.music});
  final MusicService music;

  @override
  State<_FullPlayerSheet> createState() => _FullPlayerSheetState();
}

class _FullPlayerSheetState extends State<_FullPlayerSheet> {
  MusicService get m => widget.music;
  bool _seeking = false;
  double _seekValue = 0;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: RColors.asphalt2,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: RColors.line,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 24),
          StreamBuilder<SequenceState?>(
            stream: m.player.sequenceStateStream,
            builder: (ctx, snap) {
              final song = snap.data?.currentSource?.tag as SongModel?;
              return _buildSongHeader(song);
            },
          ),
          const SizedBox(height: 28),
          _buildSeekBar(),
          const SizedBox(height: 20),
          _buildControls(),
        ],
      ),
    );
  }

  Widget _buildSongHeader(SongModel? song) {
    return Column(
      children: [
        Container(
          width: 140,
          height: 140,
          decoration: BoxDecoration(
            color: RColors.asphalt3,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: RColors.brand.withValues(alpha: 0.4)),
          ),
          child: song != null
              ? QueryArtworkWidget(
                  id: song.id,
                  type: ArtworkType.AUDIO,
                  artworkBorderRadius: BorderRadius.circular(16),
                  artworkFit: BoxFit.cover,
                  nullArtworkWidget: const Icon(
                    Icons.album_rounded,
                    color: RColors.brand,
                    size: 64,
                  ),
                )
              : const Icon(Icons.album_rounded,
                  color: RColors.brand, size: 64),
        ),
        const SizedBox(height: 20),
        Text(
          song?.title ?? '—',
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
              color: Colors.white, fontWeight: FontWeight.w700, fontSize: 18),
        ),
        const SizedBox(height: 4),
        Text(
          song?.artist ?? 'Artista desconocido',
          textAlign: TextAlign.center,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(color: RColors.inkDim, fontSize: 14),
        ),
      ],
    );
  }

  Widget _buildSeekBar() {
    return StreamBuilder<Duration>(
      stream: m.player.positionStream,
      builder: (ctx, posSnap) {
        return StreamBuilder<Duration?>(
          stream: m.player.durationStream,
          builder: (ctx, durSnap) {
            final pos = posSnap.data ?? Duration.zero;
            final dur = durSnap.data ?? Duration.zero;
            final maxVal =
                dur.inMilliseconds.toDouble().clamp(1.0, double.infinity);
            final curVal = _seeking
                ? _seekValue
                : pos.inMilliseconds.toDouble().clamp(0.0, maxVal);

            return Column(
              children: [
                SliderTheme(
                  data: SliderTheme.of(ctx).copyWith(
                    activeTrackColor: RColors.brand,
                    inactiveTrackColor: RColors.line,
                    thumbColor: RColors.brand,
                    thumbShape:
                        const RoundSliderThumbShape(enabledThumbRadius: 6),
                    overlayShape: SliderComponentShape.noOverlay,
                    trackHeight: 3,
                  ),
                  child: Slider(
                    value: curVal,
                    min: 0,
                    max: maxVal,
                    onChangeStart: (v) =>
                        setState(() { _seeking = true; _seekValue = v; }),
                    onChanged: (v) => setState(() => _seekValue = v),
                    onChangeEnd: (v) async {
                      setState(() => _seeking = false);
                      await m.player
                          .seek(Duration(milliseconds: v.toInt()));
                    },
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(_fmt(pos),
                          style: const TextStyle(
                              color: RColors.inkDim, fontSize: 12)),
                      Text(_fmt(dur),
                          style: const TextStyle(
                              color: RColors.inkDim, fontSize: 12)),
                    ],
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Widget _buildControls() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        StreamBuilder<bool>(
          stream: m.player.shuffleModeEnabledStream,
          builder: (ctx, snap) {
            final enabled = snap.data ?? false;
            return IconButton(
              icon: Icon(Icons.shuffle_rounded,
                  color: enabled ? RColors.brand : RColors.inkDim,
                  size: 26),
              onPressed: m.toggleShuffle,
            );
          },
        ),
        IconButton(
          icon:
              const Icon(Icons.skip_previous_rounded, color: Colors.white, size: 36),
          onPressed: () => m.player.seekToPrevious(),
        ),
        StreamBuilder<PlayerState>(
          stream: m.player.playerStateStream,
          builder: (ctx, snap) {
            final state = snap.data;
            final loading = state?.processingState == ProcessingState.loading ||
                state?.processingState == ProcessingState.buffering;
            final playing = state?.playing ?? false;
            return GestureDetector(
              onTap: () =>
                  playing ? m.player.pause() : m.player.play(),
              child: Container(
                width: 64,
                height: 64,
                decoration: const BoxDecoration(
                  color: RColors.brand,
                  shape: BoxShape.circle,
                ),
                child: loading
                    ? const Padding(
                        padding: EdgeInsets.all(18),
                        child: CircularProgressIndicator(
                          color: Colors.white,
                          strokeWidth: 2.5,
                        ),
                      )
                    : Icon(
                        playing ? Icons.pause_rounded : Icons.play_arrow_rounded,
                        color: Colors.white,
                        size: 36,
                      ),
              ),
            );
          },
        ),
        IconButton(
          icon: const Icon(Icons.skip_next_rounded, color: Colors.white, size: 36),
          onPressed: () => m.player.seekToNext(),
        ),
        StreamBuilder<LoopMode>(
          stream: m.player.loopModeStream,
          builder: (ctx, snap) {
            final mode = snap.data ?? LoopMode.off;
            return IconButton(
              icon: Icon(
                mode == LoopMode.one
                    ? Icons.repeat_one_rounded
                    : Icons.repeat_rounded,
                color: mode == LoopMode.off ? RColors.inkDim : RColors.brand,
                size: 26,
              ),
              onPressed: m.cycleLoopMode,
            );
          },
        ),
      ],
    );
  }

  String _fmt(Duration d) {
    final m = d.inMinutes.toString();
    final s = (d.inSeconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }
}

class _PermissionView extends StatelessWidget {
  const _PermissionView({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.library_music_rounded,
                size: 64, color: RColors.inkDim),
            const SizedBox(height: 20),
            const Text(
              'Permiso requerido',
              style: TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            const Text(
              'RIDERA necesita acceso a tus archivos de audio para reproducir música local sin internet.',
              textAlign: TextAlign.center,
              style: TextStyle(color: RColors.inkDim, fontSize: 14, height: 1.5),
            ),
            const SizedBox(height: 28),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.folder_open_rounded),
              label: const Text('Dar permiso'),
              style: FilledButton.styleFrom(
                backgroundColor: RColors.brand,
                minimumSize: const Size(200, 52),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyView extends StatelessWidget {
  const _EmptyView();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.music_off_rounded, size: 64, color: RColors.inkDim),
            SizedBox(height: 20),
            Text(
              'Sin música local',
              style: TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w700),
            ),
            SizedBox(height: 12),
            Text(
              'Descarga música en tu dispositivo (MP3, FLAC, etc.) y aparecerá aquí automáticamente.',
              textAlign: TextAlign.center,
              style: TextStyle(color: RColors.inkDim, fontSize: 14, height: 1.5),
            ),
          ],
        ),
      ),
    );
  }
}
