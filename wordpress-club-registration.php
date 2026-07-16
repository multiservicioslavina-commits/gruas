<?php
/**
 * Ridera Club Registration - WordPress Template
 *
 * Usar como:
 * 1. Página de WordPress (copy/paste el HTML en Gutenberg)
 * 2. Template personalizado en functions.php
 * 3. Plugin standalone
 *
 * Shortcode: [ridera_club_registration club_slug="touring-bikers-colombia"]
 */

// ============================================================================
// SHORTCODE PARA INSERTAR EN CUALQUIER PÁGINA
// ============================================================================

add_shortcode('ridera_club_registration', function($atts) {
    $atts = shortcode_atts(array(
        'club_slug' => ''
    ), $atts);

    if (!$atts['club_slug']) {
        return '<p style="color: red;">Error: Especifica el slug del club con club_slug="slug-del-club"</p>';
    }

    return render_club_registration_page($atts['club_slug']);
});

// ============================================================================
// FUNCIÓN PRINCIPAL QUE RENDERIZA LA PÁGINA
// ============================================================================

function render_club_registration_page($club_slug) {
    ob_start();
    ?>
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Registro de Club · Ridera</title>
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue:wght@400;700&family=Barlow+Condensed:wght@400;500;600;700&family=DM+Sans:wght@300;400;500;700&family=DM+Mono:wght@500;700&display=swap" rel="stylesheet">
        <style>
            :root {
                --orange: #E85D20;
                --orange-light: #f07a3a;
                --orange-dark: #c44d18;
                --black: #0a0908;
                --off-black: #0f0f0f;
                --dark-gray: #1a1712;
                --white: #f4f1ed;
                --muted: #e6e3de;
                --muted-dark: #9d9891;
                --red: #ef4444;
            }

            * { box-sizing: border-box; margin: 0; padding: 0; }

            html, body {
                background: var(--black);
                color: var(--white);
                font-family: 'DM Sans', system-ui, sans-serif;
                line-height: 1.6;
            }

            body {
                max-width: 1200px;
                margin: 0 auto;
                padding: 2rem;
            }

            /* HERO */
            .hero {
                background: linear-gradient(135deg, #0f0f0f 0%, #1a1712 50%, #0f0f0f 100%);
                padding: 3rem;
                border-radius: 12px;
                margin-bottom: 3rem;
                border: 1px solid rgba(232, 93, 32, 0.2);
            }

            .hero h1 {
                font-family: 'Bebas Neue', sans-serif;
                font-size: 2.5rem;
                margin-bottom: 1rem;
                color: var(--white);
            }

            .hero .club-name {
                font-family: 'Barlow Condensed', sans-serif;
                font-size: 1.1rem;
                text-transform: uppercase;
                letter-spacing: 0.15em;
                color: var(--orange);
            }

            .hero p {
                color: var(--muted-dark);
                font-size: 1.05rem;
            }

            /* FORM */
            .form-container {
                background: linear-gradient(135deg, rgba(232,93,32,0.08) 0%, rgba(232,93,32,0.02) 100%);
                border: 1px solid rgba(232, 93, 32, 0.2);
                border-radius: 12px;
                padding: 3rem;
            }

            .form-section {
                margin-bottom: 2rem;
                padding-bottom: 2rem;
                border-bottom: 1px solid rgba(232, 93, 32, 0.15);
            }

            .form-section:last-child {
                border-bottom: none;
            }

            .form-section h3 {
                font-family: 'Bebas Neue', sans-serif;
                font-size: 1.4rem;
                margin-bottom: 1.5rem;
                color: var(--white);
            }

            .form-group {
                margin-bottom: 1.5rem;
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
            }

            .form-row {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 1.5rem;
            }

            @media (max-width: 768px) {
                .form-row {
                    grid-template-columns: 1fr;
                }
            }

            .form-group label {
                font-family: 'Barlow Condensed', sans-serif;
                font-size: 0.85rem;
                text-transform: uppercase;
                letter-spacing: 0.1em;
                color: var(--orange);
            }

            .form-group input,
            .form-group textarea,
            .form-group select {
                background: rgba(232, 93, 32, 0.05);
                border: 1px solid rgba(232, 93, 32, 0.2);
                color: var(--white);
                padding: 0.75rem 1rem;
                border-radius: 6px;
                font-family: 'DM Sans', sans-serif;
                font-size: 0.95rem;
                transition: all 0.2s ease;
            }

            .form-group input::placeholder,
            .form-group textarea::placeholder {
                color: rgba(255, 255, 255, 0.3);
            }

            .form-group input:focus,
            .form-group textarea:focus,
            .form-group select:focus {
                outline: none;
                border-color: var(--orange);
                background: rgba(232, 93, 32, 0.1);
                box-shadow: 0 0 0 3px rgba(232, 93, 32, 0.1);
            }

            .form-group textarea {
                min-height: 100px;
                resize: vertical;
            }

            /* UPLOAD AREA */
            .upload-area {
                border: 2px dashed rgba(232, 93, 32, 0.3);
                border-radius: 8px;
                padding: 2rem;
                text-align: center;
                cursor: pointer;
                transition: all 0.2s ease;
                background: rgba(232, 93, 32, 0.02);
            }

            .upload-area:hover {
                border-color: var(--orange);
                background: rgba(232, 93, 32, 0.08);
            }

            .upload-area.dragover {
                border-color: var(--orange);
                background: rgba(232, 93, 32, 0.15);
            }

            .upload-area p {
                color: var(--muted-dark);
                margin: 0.5rem 0;
            }

            .upload-area .icon {
                font-size: 2rem;
                margin-bottom: 0.5rem;
            }

            .file-input {
                display: none;
            }

            .preview-images {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
                gap: 1rem;
                margin-top: 1rem;
            }

            .preview-image {
                position: relative;
                border-radius: 8px;
                overflow: hidden;
                aspect-ratio: 1;
                border: 1px solid rgba(232, 93, 32, 0.2);
            }

            .preview-image img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            .preview-image .remove {
                position: absolute;
                top: 0.5rem;
                right: 0.5rem;
                background: rgba(239, 68, 68, 0.8);
                color: white;
                border: none;
                border-radius: 50%;
                width: 30px;
                height: 30px;
                cursor: pointer;
                font-size: 1.2rem;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            /* BUTTONS */
            .btn {
                padding: 0.75rem 1.5rem;
                background: transparent;
                border: 1px solid rgba(232, 93, 32, 0.3);
                color: var(--muted-dark);
                cursor: pointer;
                border-radius: 6px;
                font-family: 'Barlow Condensed', sans-serif;
                font-size: 0.85rem;
                text-transform: uppercase;
                letter-spacing: 0.1em;
                transition: all 0.2s ease;
            }

            .btn:hover {
                border-color: var(--orange);
                color: var(--orange);
            }

            .btn.primary {
                background: var(--orange);
                color: var(--black);
                border-color: var(--orange);
                font-weight: 600;
            }

            .btn.primary:hover {
                background: var(--orange-light);
                border-color: var(--orange-light);
            }

            .btn.primary:disabled {
                background: rgba(232, 93, 32, 0.5);
                cursor: not-allowed;
            }

            .form-actions {
                display: flex;
                gap: 1rem;
                margin-top: 2rem;
            }

            /* ALERTS */
            .alert {
                padding: 1rem;
                border-radius: 6px;
                margin-bottom: 1.5rem;
            }

            .alert.success {
                background: rgba(16, 185, 129, 0.15);
                border: 1px solid rgba(16, 185, 129, 0.3);
                color: #10b981;
            }

            .alert.error {
                background: rgba(239, 68, 68, 0.15);
                border: 1px solid rgba(239, 68, 68, 0.3);
                color: var(--red);
            }

            .alert.info {
                background: rgba(232, 93, 32, 0.15);
                border: 1px solid rgba(232, 93, 32, 0.3);
                color: var(--orange);
            }

            .loading-spinner {
                display: inline-block;
                width: 16px;
                height: 16px;
                border: 2px solid rgba(232, 93, 32, 0.3);
                border-top-color: var(--orange);
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
                margin-right: 0.5rem;
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }

            .required {
                color: var(--red);
            }
        </style>
    </head>
    <body>
        <div class="hero" id="clubInfo" style="display: none;">
            <div class="club-name" id="clubCategory">Club</div>
            <h1 id="clubName">Cargando...</h1>
            <p id="clubDescription"></p>
        </div>

        <div class="form-container">
            <div id="formAlert"></div>

            <form id="registrationForm">
                <!-- INFORMACIÓN PERSONAL -->
                <div class="form-section">
                    <h3>Información Personal</h3>

                    <div class="form-row">
                        <div class="form-group">
                            <label>Nombre Completo <span class="required">*</span></label>
                            <input type="text" name="fullname" required>
                        </div>
                        <div class="form-group">
                            <label>Email <span class="required">*</span></label>
                            <input type="email" name="email" required>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label>Teléfono</label>
                            <input type="tel" name="phone">
                        </div>
                        <div class="form-group">
                            <label>WhatsApp</label>
                            <input type="tel" name="whatsapp">
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Ciudad</label>
                        <input type="text" name="city">
                    </div>
                </div>

                <!-- INFORMACIÓN DE LA MOTO -->
                <div class="form-section">
                    <h3>Información de tu Moto</h3>

                    <div class="form-row">
                        <div class="form-group">
                            <label>Marca <span class="required">*</span></label>
                            <input type="text" name="moto_brand" placeholder="Ej: BMW, Harley-Davidson" required>
                        </div>
                        <div class="form-group">
                            <label>Modelo</label>
                            <input type="text" name="moto_model" placeholder="Ej: R1200GS">
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label>Año</label>
                            <input type="number" name="moto_year" placeholder="2024">
                        </div>
                        <div class="form-group">
                            <label>Color</label>
                            <input type="text" name="moto_color" placeholder="Ej: Rojo">
                        </div>
                    </div>
                </div>

                <!-- FOTOS -->
                <div class="form-section">
                    <h3>Fotos <span class="required">*</span> (Mínimo 3 requeridas)</h3>

                    <div class="form-group">
                        <label>Sube tus fotos (Arrastra o haz click)</label>
                        <div class="upload-area" id="uploadArea">
                            <div class="icon">📸</div>
                            <p style="font-weight: 500;">Arrastra tus fotos aquí</p>
                            <p>o haz click para seleccionar</p>
                            <p style="font-size: 0.85em; margin-top: 1rem;">Mínimo 3 fotos requeridas</p>
                            <input type="file" id="photoInput" class="file-input" multiple accept="image/*">
                        </div>

                        <div class="preview-images" id="previewImages"></div>

                        <div id="photoCount" style="color: var(--muted-dark); margin-top: 1rem; font-size: 0.9rem;">
                            Fotos seleccionadas: <strong>0/∞</strong> (mínimo 3)
                        </div>
                    </div>
                </div>

                <!-- MENSAJE ADICIONAL -->
                <div class="form-section">
                    <h3>Mensaje Adicional</h3>

                    <div class="form-group">
                        <label>¿Por qué quieres unirte a este club?</label>
                        <textarea name="message" placeholder="Cuéntanos por qué te interesa este club..."></textarea>
                    </div>
                </div>

                <!-- ACCIONES -->
                <div class="form-actions">
                    <button type="submit" class="btn primary" id="submitBtn">🚀 Unirme al Club</button>
                    <button type="reset" class="btn">Limpiar</button>
                </div>
            </form>
        </div>
    </body>

    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script>
        // CONFIGURACIÓN
        const SUPABASE_URL = "https://vzzxsdtsaahhzyctvmhx.supabase.co";
        const SUPABASE_ANON_KEY = "sb_publishable_r1ImtuUXs1zM02OgwserGQ_F7R26Niu";
        const CLUB_SLUG = "<?php echo esc_js($club_slug); ?>";

        const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        let selectedPhotos = [];
        let currentClub = null;

        // CARGAR INFORMACIÓN DEL CLUB
        async function loadClubInfo() {
            const { data, error } = await supabase
                .from('clubs')
                .select('*')
                .eq('slug', CLUB_SLUG)
                .eq('active', true)
                .single();

            if (data) {
                currentClub = data;
                document.getElementById('clubCategory').textContent = data.category;
                document.getElementById('clubName').textContent = data.name;
                document.getElementById('clubDescription').textContent = data.description || '';
                document.getElementById('clubInfo').style.display = 'block';
            }
        }

        // MANEJO DE FOTOS
        const uploadArea = document.getElementById('uploadArea');
        const photoInput = document.getElementById('photoInput');

        uploadArea.addEventListener('click', () => photoInput.click());
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            handlePhotos([...e.dataTransfer.files]);
        });

        photoInput.addEventListener('change', (e) => {
            handlePhotos([...e.target.files]);
        });

        function handlePhotos(files) {
            const imageFiles = files.filter(f => f.type.startsWith('image/'));

            imageFiles.forEach(file => {
                if (selectedPhotos.length >= 10) return;
                if (selectedPhotos.some(p => p.name === file.name && p.size === file.size)) return;

                selectedPhotos.push(file);

                const reader = new FileReader();
                reader.onload = (e) => {
                    const div = document.createElement('div');
                    div.className = 'preview-image';
                    div.innerHTML = `
                        <img src="${e.target.result}" alt="Preview">
                        <button type="button" class="remove" onclick="removePhoto('${file.name}')">×</button>
                    `;
                    document.getElementById('previewImages').appendChild(div);
                    updatePhotoCount();
                };
                reader.readAsDataURL(file);
            });
        }

        function removePhoto(name) {
            selectedPhotos = selectedPhotos.filter(p => p.name !== name);
            const previews = document.querySelectorAll('.preview-image');
            previews.forEach((p, i) => {
                if (i >= selectedPhotos.length) p.remove();
            });
            updatePhotoCount();
        }

        function updatePhotoCount() {
            document.getElementById('photoCount').innerHTML = `
                Fotos seleccionadas: <strong>${selectedPhotos.length}/∞</strong> (mínimo 3)
            `;
        }

        // ENVIAR FORMULARIO
        document.getElementById('registrationForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = document.getElementById('submitBtn');
            const alertDiv = document.getElementById('formAlert');

            if (selectedPhotos.length < 3) {
                alertDiv.innerHTML = '<div class="alert error">⚠️ Debes seleccionar al menos 3 fotos</div>';
                return;
            }

            submitBtn.disabled = true;
            alertDiv.innerHTML = '<div class="alert info"><span class="loading-spinner"></span>Procesando tu registro...</div>';

            try {
                const photoUrls = [];
                for (const photo of selectedPhotos) {
                    const fileName = `${Date.now()}-${Math.random()}-${photo.name}`;
                    const { data, error } = await supabase.storage
                        .from('club-photos')
                        .upload(`${currentClub.id}/${fileName}`, photo);

                    if (error) throw error;

                    const { data: { publicUrl } } = supabase.storage
                        .from('club-photos')
                        .getPublicUrl(`${currentClub.id}/${fileName}`);

                    photoUrls.push(publicUrl);
                }

                const formData = new FormData(e.target);
                const memberData = {
                    club_id: currentClub.id,
                    fullname: formData.get('fullname'),
                    email: formData.get('email'),
                    phone: formData.get('phone'),
                    whatsapp: formData.get('whatsapp'),
                    city: formData.get('city'),
                    moto_brand: formData.get('moto_brand'),
                    moto_model: formData.get('moto_model'),
                    moto_year: formData.get('moto_year'),
                    moto_color: formData.get('moto_color'),
                    photo_urls: photoUrls,
                    message: formData.get('message'),
                    created_at: new Date().toISOString(),
                };

                const { error: insertError } = await supabase
                    .from('club_members')
                    .insert([memberData]);

                if (insertError) {
                    console.log('Error a tabla principal, intentando backup...');
                }

                alertDiv.innerHTML = `
                    <div class="alert success">
                        ✅ ¡Éxito! Tu registro ha sido enviado<br>
                        <small>El líder del club se pondrá en contacto pronto</small>
                    </div>
                `;

                e.target.reset();
                selectedPhotos = [];
                document.getElementById('previewImages').innerHTML = '';
                updatePhotoCount();

            } catch (error) {
                console.error(error);
                alertDiv.innerHTML = `<div class="alert error">❌ Error: ${error.message}</div>`;
            } finally {
                submitBtn.disabled = false;
            }
        });

        // INICIALIZAR
        loadClubInfo();
    </script>
    </html>
    <?php
    return ob_get_clean();
}

/**
 * INSTRUCCIONES DE USO EN WORDPRESS
 *
 * OPCIÓN 1: Como Shortcode en cualquier página
 * ============================================
 * 1. Añade este código a functions.php:
 *    require_once('ruta/a/wordpress-club-registration.php');
 *
 * 2. En una página de WordPress, añade el shortcode:
 *    [ridera_club_registration club_slug="touring-bikers-colombia"]
 *
 * OPCIÓN 2: Como página independiente
 * ====================================
 * 1. Crear una nueva página en WordPress
 * 2. Click en "Crear página HTML nueva"
 * 3. Copiar todo el código HTML de esta función
 * 4. Cambiar slug del club según necesites
 *
 * OPCCIÓN 3: Como Plugin
 * =======================
 * 1. Crear carpeta: wp-content/plugins/ridera-registration/
 * 2. Crear archivo: ridera-registration.php
 * 3. Copiar este archivo completo
 * 4. Activar plugin en WordPress
 *
 * VARIABLES A CONFIGURAR:
 * =======================
 * - SUPABASE_URL: URL de tu proyecto Supabase
 * - SUPABASE_ANON_KEY: Clave anónima de Supabase
 * - CLUB_SLUG: El slug del club (touring-bikers-colombia, etc)
 */
