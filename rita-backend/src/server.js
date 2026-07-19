import express from 'express';
import { handleWebhook, verifyWebhook } from './webhook.js';

const app = express();
app.use(express.json());

// Meta webhook verification (GET)
app.get('/webhook', verifyWebhook);

// Meta webhook messages (POST)
app.post('/webhook', handleWebhook);

// Health check
app.get('/', (req, res) => res.json({ status: 'Rita activa 🏍️' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Rita escuchando en puerto ${PORT}`));
