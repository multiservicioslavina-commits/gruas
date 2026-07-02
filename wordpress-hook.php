<?php
/**
 * Hook WordPress: al aprobar (publish) un gruero, envía datos a Google Sheets con aprobado=SI
 * y llama a la edge function `aprobar-gruero` que crea la cuenta en Supabase Auth.
 * Pegar en functions.php del tema hijo o en un plugin personalizado.
 */
add_action('transition_post_status', function($nuevo, $anterior, $post) {
    if ($post->post_type !== 'gruas') return;
    if ($nuevo !== 'publish' || $anterior === 'publish') return;

    $meta = get_post_meta($post->ID);
    $data = [
        'tipo'     => 'Grúa',
        'nombre'   => $post->post_title,
        'aprobado' => 'SI',
    ];
    foreach ($meta as $key => $val) {
        if (strpos($key, '_') === 0) continue; // Saltar meta internos de WordPress
        $data[$key] = $val[0];
    }

    // Enviar a Google Sheets
    wp_remote_post(
        'https://script.google.com/macros/s/AKfycbxBo_t8mz7yv56ORULMHz5HWf7zxZHVPsGYcLGgjrtmzH52EpxdxOkc1BhP-q99uxb4/exec',
        [
            'body'    => json_encode($data),
            'headers' => ['Content-Type' => 'application/json'],
            'timeout' => 15,
        ]
    );

    // Llamar a la edge function aprobar-gruero:
    // crea usuario en Supabase Auth, genera slug, envía email de bienvenida
    $supabase_key = defined('SUPABASE_SERVICE_KEY') ? SUPABASE_SERVICE_KEY : '';

    if ($supabase_key) {
        $email = '';
        // Buscar campo email entre los meta del CPT
        foreach (['email', 'correo', 'email_gruero', 'correo_gruero'] as $campo) {
            if (!empty($meta[$campo][0])) {
                $email = $meta[$campo][0];
                break;
            }
        }

        wp_remote_post(
            'https://vzzxsdtsaahhzyctvmhx.supabase.co/functions/v1/aprobar-gruero',
            [
                'body'    => json_encode([
                    'nombre' => $post->post_title,
                    'email'  => $email,
                ]),
                'headers' => [
                    'Content-Type'  => 'application/json',
                    'Authorization' => 'Bearer ' . $supabase_key,
                ],
                'timeout' => 20,
            ]
        );
    }
}, 10, 3);
