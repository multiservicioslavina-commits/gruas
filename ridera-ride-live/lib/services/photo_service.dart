import 'dart:io';
import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class PhotoService {
  final _db = Supabase.instance.client;
  final _picker = ImagePicker();

  Future<String?> captureAndUpload({
    required String rideId,
    double? lat,
    double? lon,
  }) async {
    final file = await _picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 80,
      maxWidth: 1920,
    );
    if (file == null) return null;

    final uid = _db.auth.currentUser!.id;
    final path = '$rideId/$uid/${DateTime.now().millisecondsSinceEpoch}.jpg';

    await _db.storage.from('ride-photos').upload(
      path,
      File(file.path),
      fileOptions: const FileOptions(contentType: 'image/jpeg'),
    );

    final url = _db.storage.from('ride-photos').getPublicUrl(path);

    await _db.from('ride_photos').insert({
      'ride_id': rideId,
      'uid': uid,
      'url': url,
      'lat': lat,
      'lon': lon,
    });

    return url;
  }

  Future<List<Map<String, dynamic>>> getPhotos(String rideId) async {
    final res = await _db
        .from('ride_photos')
        .select()
        .eq('ride_id', rideId)
        .order('created_at');
    return List<Map<String, dynamic>>.from(res);
  }
}
