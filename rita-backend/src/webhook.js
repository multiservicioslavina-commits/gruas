import { transcribeAudio } from './transcriber.js';
import { askClaude } from './claude.js';
import { sendWhatsApp, downloadMedia } from './whatsapp.js';

const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN || 'rita-ridera-2026';

export function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verificado');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
}

export async function handleWebhook(req, res) {
  // Respond 200 immediately (Meta requires <5s)
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    if (!value?.messages) return;

    const msg = value.messages[0];
    const from = msg.from; // phone number
    const contactName = value.contacts?.[0]?.profile?.name || 'Rider';

    let userText = '';

    if (msg.type === 'text') {
      userText = msg.text.body;
    } else if (msg.type === 'audio') {
      console.log(`[Rita] Audio de ${from}, transcribiendo...`);
      const audioBuffer = await downloadMedia(msg.audio.id);
      userText = await transcribeAudio(audioBuffer);
      if (!userText) {
        await sendWhatsApp(from, '🎙️ No pude entender el audio. ¿Puedes repetirlo o escribirme?');
        return;
      }
      // Confirm transcription
      await sendWhatsApp(from, `🎙️ _"${userText}"_`);
    } else if (msg.type === 'image') {
      userText = '[El usuario envió una imagen]' + (msg.image.caption ? `: ${msg.image.caption}` : '');
    } else {
      await sendWhatsApp(from, 'Por ahora solo puedo leer texto y audios 🏍️');
      return;
    }

    console.log(`[Rita] ${contactName} (${from}): ${userText.slice(0, 100)}`);

    const response = await askClaude(userText, from, contactName);
    await sendWhatsApp(from, response);

    console.log(`[Rita] → ${from}: ${response.slice(0, 100)}`);
  } catch (err) {
    console.error('[Rita] Error:', err.message);
  }
}
