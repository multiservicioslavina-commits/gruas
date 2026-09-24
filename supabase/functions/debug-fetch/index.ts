// Desactivada (auditoría de seguridad, septiembre 2026).
//
// Era un proxy de fetch para depuración. Intentaba limitarse a dominios
// propios, pero la comprobación usaba una expresión regular sin anclar sobre
// la URL completa, así que bastaba con que la cadena permitida apareciera en
// cualquier parte —el path, el query, o como subdominio de un atacante— para
// pasar el filtro. En la práctica: un SSRF que permitía pedir cualquier URL
// desde el servidor.
//
// No la llamaba nada en el código (verificado con grep en todo el repo: sólo
// aparecía en supabase/config.toml). Se desactiva igual que debug-proxy.
//
// Si vuelve a hacer falta, comparar contra `new URL(u).hostname` con igualdad
// exacta o sufijo (`host === 'ridera.com.co' || host.endsWith('.ridera.com.co')`),
// nunca con una regex sobre la URL entera.
Deno.serve(async () => new Response('disabled', { status: 410 }))
