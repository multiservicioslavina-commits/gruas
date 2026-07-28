import 'package:just_audio/just_audio.dart';
import 'package:on_audio_query/on_audio_query.dart';

class MusicService {
  MusicService._();
  static final MusicService instance = MusicService._();

  final AudioPlayer player = AudioPlayer();
  final _query = OnAudioQuery();

  List<SongModel> _songs = [];
  List<SongModel> get songs => List.unmodifiable(_songs);
  List<SongModel> _currentPlaylist = [];

  SongModel? get currentSong {
    final idx = player.currentIndex;
    if (idx == null || _currentPlaylist.isEmpty) return null;
    if (idx >= _currentPlaylist.length) return null;
    return _currentPlaylist[idx];
  }

  Future<bool> requestPermission() => _query.permissionsRequest();
  Future<bool> hasPermission() => _query.permissionsStatus();

  Future<void> loadSongs() async {
    final all = await _query.querySongs(
      sortType: SongSortType.TITLE,
      orderType: OrderType.ASC_OR_SMALLER,
      uriType: UriType.EXTERNAL,
      ignoreCase: true,
    );
    _songs = all
        .where((s) => s.uri != null && (s.duration ?? 0) > 30000)
        .toList();
  }

  Future<void> playFrom(List<SongModel> playlist, int index) async {
    _currentPlaylist = List.from(playlist);
    final sources = playlist
        .map((s) => AudioSource.uri(Uri.parse(s.uri!), tag: s))
        .toList();
    await player.setAudioSource(
      ConcatenatingAudioSource(children: sources),
      initialIndex: index,
      initialPosition: Duration.zero,
    );
    await player.play();
  }

  Future<void> toggleShuffle() async {
    final enabled = !player.shuffleModeEnabled;
    await player.setShuffleModeEnabled(enabled);
    if (enabled) await player.shuffle();
  }

  Future<void> cycleLoopMode() async {
    switch (player.loopMode) {
      case LoopMode.off:
        await player.setLoopMode(LoopMode.all);
        break;
      case LoopMode.all:
        await player.setLoopMode(LoopMode.one);
        break;
      case LoopMode.one:
        await player.setLoopMode(LoopMode.off);
        break;
    }
  }

  String formatDuration(int? millis) {
    if (millis == null) return '--:--';
    final d = Duration(milliseconds: millis);
    final m = d.inMinutes.toString();
    final s = (d.inSeconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }
}
