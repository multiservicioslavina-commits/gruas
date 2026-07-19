import { execSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

// whisper.cpp binary path (compiled at deploy time via Dockerfile)
const WHISPER_BIN = process.env.WHISPER_BIN || '/app/whisper.cpp/main';
const WHISPER_MODEL = process.env.WHISPER_MODEL || '/app/whisper.cpp/models/ggml-base.bin';

export async function transcribeAudio(audioBuffer) {
  const id = randomUUID();
  const oggPath = join(tmpdir(), `${id}.ogg`);
  const wavPath = join(tmpdir(), `${id}.wav`);
  const txtPath = join(tmpdir(), `${id}.txt`);

  try {
    // Save OGG from WhatsApp
    writeFileSync(oggPath, audioBuffer);

    // Convert OGG → WAV 16kHz mono (whisper.cpp requirement)
    execSync(`ffmpeg -y -i ${oggPath} -ar 16000 -ac 1 -f wav ${wavPath}`, {
      timeout: 15000,
      stdio: 'pipe',
    });

    // Transcribe with whisper.cpp
    execSync(
      `${WHISPER_BIN} -m ${WHISPER_MODEL} -l es -f ${wavPath} -otxt -of ${join(tmpdir(), id)}`,
      { timeout: 30000, stdio: 'pipe' }
    );

    // Read result
    if (!existsSync(txtPath)) return null;
    const text = readFileSync(txtPath, 'utf8').trim();
    return text || null;
  } catch (err) {
    console.error('[Whisper] Error:', err.message);
    return null;
  } finally {
    // Cleanup
    [oggPath, wavPath, txtPath].forEach(f => {
      try { unlinkSync(f); } catch {}
    });
  }
}
