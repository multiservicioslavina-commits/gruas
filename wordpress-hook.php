<?php
/**
 * Hook WordPress: al publicar (aprobar) un CPT 'gruas',
 * llama a registrar-gruero con action=aprobar para crear la cuenta
 * en Supabase Auth y enviarle el email de bienvenida al gruero.
 * Pegar en functions.php del tema hijo o en un plugin personalizado.
 */
add_action('transition_post_status', function($nuevo, $anterior, $post) {
    if ($post->post_type !== 'gruas') return;
    if ($nuevo !== 'publish' || $anterior === 'publish') return;

    $meta = get_post_meta($post->ID);

    // Recoger todos los campos del CPT (ignorar meta internos de WordPress)
    $meta_flat = ['nombre' => $post->post_title];
    foreach ($meta as $key => $val) {
        if (strpos($key, '_') === 0) continue;
        $meta_flat[$key] = $val[0];
    }

    // Email del gruero (buscar en campos comunes del CPT)
    $email = $meta_flat['email'] ?? $meta_flat['correo'] ?? $meta_flat['correo_electronico'] ?? '';

    // Payload para registrar-gruero con acción de aprobación
    $payload = array_merge($meta_flat, [
        'action'    => 'aprobar',
        'nombre'    => $post->post_title,
        'email'     => $email,
        'gruero_id' => isset($meta_flat['supabase_id']) ? (int)$meta_flat['supabase_id'] : null,
    ]);

    // Headers — no requiere token (verify_jwt=false), pero se envía si está definido
    $headers = ['Content-Type' => 'application/json'];
    if (defined('SUPABASE_SERVICE_KEY') && SUPABASE_SERVICE_KEY) {
        $headers['Authorization'] = 'Bearer ' . SUPABASE_SERVICE_KEY;
    }

    wp_remote_post(
        'https://vzzxsdtsaahhzyctvmhx.supabase.co/functions/v1/registrar-gruero',
        [
            'body'    => json_encode($payload),
            'headers' => $headers,
            'timeout' => 20,
        ]
    );
}, 10, 3);
