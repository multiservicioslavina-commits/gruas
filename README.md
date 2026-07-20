# Ridera

Plataforma de servicios para motociclistas en Colombia.

## Estructura

```
gruas/
├── app/                      Landing page Ridera Ride Live (Netlify)
├── rider/                    Perfil público de riders (Netlify)
├── gruas-web/                Landing grúas, widget embebible, SEO por ciudad
├── ridera-ride-live/         App móvil Flutter (GPS grupal, caídas, video)
├── ridera-video-backend/     Backend de video con Puppeteer (Railway)
├── ridera-video-remotion/    Video rendering con Remotion (alternativo)
├── rita-backend/             Chatbot WhatsApp con IA (Railway)
├── supabase/
│   ├── functions/            Edge Functions (push, render, rita, approve)
│   └── migrations/           Esquema de base de datos
├── integrations/             Apps Script, WordPress hook
└── docs/                     Documentación interna
```

## Servicios

| Servicio | Hosting | URL |
|---|---|---|
| Landing grúas | Netlify | multiservicioslavina.com |
| Landing app | Netlify | aventura.ridera.com.co |
| Video backend | Railway | ridera-video-backend-prod.up.railway.app |
| Rita chatbot | Railway | gregarious-tenderness-production-38ad.up.railway.app |
| Base de datos | Supabase | vzzxsdtsaahhzyctvmhx.supabase.co |

## Stack

- **Móvil**: Flutter + Supabase Auth + flutter_map
- **Backend**: Node.js (Express) + Puppeteer/Remotion
- **IA**: Claude Haiku (Rita chatbot)
- **DB**: PostgreSQL (Supabase) con RLS
- **Push**: OneSignal
