// Desactivada (auditoría de seguridad, septiembre 2026).
//
// Era una herramienta de depuración del render de video: exponía, SIN NINGUNA
// autenticación, cuatro acciones sobre AWS usando las credenciales del
// servidor — leer cualquier objeto del bucket S3 por su key, listar el bucket
// completo, y leer los logs de CloudWatch de la función Lambda.
//
// No la llamaba nada en el código (verificado con grep en todo el repo: sólo
// aparecía en supabase/config.toml). Se desactiva igual que debug-proxy en vez
// de borrarla, para que una llamada vieja reciba un 410 claro y no un 404
// ambiguo.
//
// Si vuelve a hacer falta depurar el render, rehacerla exigiendo autenticación
// (cabecera con un secreto propio, o verify_jwt = true en config.toml) y
// restringiendo `key`/`prefix` a un prefijo concreto del bucket.
Deno.serve(async () => new Response('disabled', { status: 410 }))
