const WA_TOKEN = process.env.WA_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID;
const GRAPH_URL = 'https://graph.facebook.com/v21.0';

export async function sendWhatsApp(to, text) {
  const res = await fetch(`${GRAPH_URL}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp send failed: ${res.status} ${err}`);
  }
}

export async function downloadMedia(mediaId) {
  // Step 1: Get media URL
  const metaRes = await fetch(`${GRAPH_URL}/${mediaId}`, {
    headers: { 'Authorization': `Bearer ${WA_TOKEN}` },
  });
  if (!metaRes.ok) throw new Error(`Media metadata failed: ${metaRes.status}`);
  const { url } = await metaRes.json();

  // Step 2: Download the actual file
  const fileRes = await fetch(url, {
    headers: { 'Authorization': `Bearer ${WA_TOKEN}` },
  });
  if (!fileRes.ok) throw new Error(`Media download failed: ${fileRes.status}`);

  return Buffer.from(await fileRes.arrayBuffer());
}
