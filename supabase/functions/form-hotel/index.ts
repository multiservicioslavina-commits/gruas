import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function html() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Registro Hotel Aliado — RIDERA</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700;800&display=swap');
  #ridera-form, #ridera-form * { box-sizing: border-box !important; }
  #ridera-form {
    font-family: 'DM Sans', system-ui, -apple-system, sans-serif !important;
    background: #0e0e0e !important; color: #f2ede6 !important;
    line-height: 1.6 !important; -webkit-font-smoothing: antialiased;
    padding: 0 !important; min-height: 100vh !important;
    display: flex !important; flex-direction: column !important; align-items: center !important;
  }
  /* Hero */
  #ridera-form .rf-hero {
    width: 100% !important; padding: 52px 20px 44px !important;
    background: linear-gradient(160deg, #1a0e08 0%, #0e0e0e 40%, #0e0e0e 60%, #1a0e08 100%) !important;
    text-align: center !important;
    border-bottom: 1px solid #2e2822 !important;
    position: relative !important; overflow: hidden !important;
  }
  #ridera-form .rf-hero::before {
    content: '' !important; position: absolute !important;
    top: -50% !important; left: -50% !important; width: 200% !important; height: 200% !important;
    background: radial-gradient(ellipse at 50% 0%, rgba(232,93,32,0.06) 0%, transparent 60%) !important;
    pointer-events: none !important;
  }
  #ridera-form .rf-hero .rf-brand {
    font-family: 'Bebas Neue', sans-serif !important;
    font-size: 16px !important; font-weight: 400 !important; color: #E85D20 !important;
    letter-spacing: 8px !important; margin-bottom: 12px !important;
    text-transform: uppercase !important; position: relative !important;
  }
  #ridera-form .rf-hero h1 {
    font-family: 'Bebas Neue', serif !important;
    font-size: 40px !important; font-weight: 400 !important;
    letter-spacing: 2px !important; color: #f2ede6 !important;
    margin: 0 0 14px !important; position: relative !important;
  }
  #ridera-form .rf-hero p {
    font-size: 15px !important; color: #bdb4aa !important;
    max-width: 520px !important; margin: 0 auto !important; line-height: 1.7 !important;
    position: relative !important;
  }
  #ridera-form .rf-hero .rf-badge {
    display: inline-block !important; margin-top: 22px !important;
    padding: 7px 18px !important; border-radius: 20px !important;
    background: rgba(232,93,32,0.1) !important; border: 1px solid rgba(232,93,32,0.25) !important;
    color: #E85D20 !important; font-size: 12px !important; font-weight: 700 !important;
    letter-spacing: 1px !important; text-transform: uppercase !important;
    position: relative !important;
  }
  /* Progress indicator */
  #ridera-form .rf-progress {
    display: flex !important; justify-content: center !important; gap: 8px !important;
    padding: 24px 20px 0 !important; max-width: 680px !important; width: 100% !important;
  }
  #ridera-form .rf-progress-step {
    flex: 1 !important; height: 3px !important; border-radius: 2px !important;
    background: #1e1a16 !important; transition: background 0.4s !important;
    max-width: 120px !important;
  }
  #ridera-form .rf-progress-step.active { background: #E85D20 !important; }
  #ridera-form .rf-progress-step.done { background: #8b5a32 !important; }
  /* Container */
  #ridera-form .rf-container {
    width: 100% !important; max-width: 680px !important;
    padding: 40px 32px !important;
  }
  @media (max-width: 500px) {
    #ridera-form .rf-container { padding: 28px 18px !important; }
    #ridera-form .rf-hero h1 { font-size: 32px !important; }
  }
  /* Section titles */
  #ridera-form .rf-section-title {
    font-family: 'Bebas Neue', sans-serif !important;
    font-size: 14px !important; font-weight: 400 !important; letter-spacing: 5px !important;
    text-transform: uppercase !important; color: #E85D20 !important;
    margin: 44px 0 22px !important; padding-bottom: 10px !important;
    border-bottom: 1px solid #2e2822 !important;
    display: flex !important; align-items: center !important; gap: 10px !important;
  }
  #ridera-form .rf-section-title:first-of-type { margin-top: 0 !important; }
  #ridera-form .rf-section-title .rf-sec-ico { font-size: 18px !important; }
  /* Fields */
  #ridera-form .rf-field { margin-bottom: 22px !important; }
  #ridera-form label {
    display: block !important; font-size: 13px !important; font-weight: 600 !important;
    margin-bottom: 7px !important; color: #d4ccc3 !important;
  }
  #ridera-form .rf-req { color: #E85D20 !important; }
  #ridera-form .rf-opt { font-weight: 400 !important; color: #8a8078 !important; font-size: 12px !important; }
  #ridera-form input, #ridera-form select, #ridera-form textarea {
    width: 100% !important; padding: 13px 16px !important; border-radius: 10px !important;
    border: 1px solid #2e2822 !important; background: #161616 !important;
    color: #f2ede6 !important; font-size: 15px !important; font-family: inherit !important;
    transition: border-color 0.2s, box-shadow 0.2s !important;
  }
  #ridera-form input::placeholder, #ridera-form textarea::placeholder { color: #635c55 !important; }
  #ridera-form input:focus, #ridera-form select:focus, #ridera-form textarea:focus {
    outline: none !important; border-color: #E85D20 !important;
    box-shadow: 0 0 0 3px rgba(232,93,32,0.15) !important;
  }
  #ridera-form textarea { resize: vertical !important; min-height: 90px !important; }
  #ridera-form select {
    cursor: pointer !important; appearance: none !important;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%238a8078' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E") !important;
    background-repeat: no-repeat !important; background-position: right 14px center !important;
  }
  #ridera-form select option { background: #161616 !important; color: #f2ede6 !important; }
  /* Rows */
  #ridera-form .rf-row {
    display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 16px !important;
  }
  @media (max-width: 500px) {
    #ridera-form .rf-row { grid-template-columns: 1fr !important; }
  }
  /* Checkboxes */
  #ridera-form .rf-checks {
    display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 8px !important;
  }
  @media (max-width: 500px) {
    #ridera-form .rf-checks { grid-template-columns: 1fr !important; }
  }
  #ridera-form .rf-checks label {
    display: flex !important; align-items: center !important; gap: 10px !important;
    font-weight: 400 !important; cursor: pointer !important; font-size: 14px !important;
    color: #b5ada4 !important; padding: 10px 14px !important;
    background: #161616 !important; border: 1px solid #2e2822 !important;
    border-radius: 8px !important; transition: all 0.2s !important;
  }
  #ridera-form .rf-checks label:hover {
    border-color: #44382e !important; background: #1a1a1a !important;
  }
  #ridera-form .rf-checks label:has(input:checked) {
    border-color: #E85D20 !important; color: #f2ede6 !important;
    background: rgba(232,93,32,0.08) !important;
  }
  #ridera-form .rf-checks input[type=\"checkbox\"] {
    width: 18px !important; height: 18px !important; accent-color: #E85D20 !important;
    flex-shrink: 0 !important; padding: 0 !important;
  }
  /* GPS row */
  #ridera-form .rf-gps-row { display: flex !important; gap: 10px !important; }
  #ridera-form .rf-gps-row input { flex: 1 !important; }
  #ridera-form .rf-gps-btn {
    flex-shrink: 0 !important; white-space: nowrap !important; padding: 0 18px !important;
    background: transparent !important; border: 1px solid #E85D20 !important;
    color: #E85D20 !important; border-radius: 10px !important; font-weight: 700 !important;
    font-size: 13px !important; cursor: pointer !important; font-family: inherit !important;
    transition: all 0.2s !important;
  }
  #ridera-form .rf-gps-btn:hover { background: #E85D20 !important; color: #fff !important; }
  #ridera-form .rf-gps-btn:disabled { opacity: 0.5 !important; cursor: wait !important; }
  /* Hints */
  #ridera-form .rf-hint { font-size: 12px !important; color: #7a726a !important; margin-top: 7px !important; line-height: 1.5 !important; }
  /* Submit */
  #ridera-form .rf-submit {
    display: block !important; width: 100% !important; padding: 18px !important;
    background: linear-gradient(135deg, #E85D20 0%, #d44a10 100%) !important;
    color: #fff !important; border: none !important; border-radius: 12px !important;
    font-family: 'Bebas Neue', sans-serif !important;
    font-size: 22px !important; font-weight: 400 !important;
    letter-spacing: 3px !important; text-transform: uppercase !important;
    cursor: pointer !important; margin-top: 44px !important;
    box-shadow: 0 4px 24px rgba(232,93,32,0.3) !important;
    transition: all 0.25s !important;
    position: relative !important; overflow: hidden !important;
  }
  #ridera-form .rf-submit::after {
    content: '' !important; position: absolute !important;
    top: 0 !important; left: -100% !important; width: 100% !important; height: 100% !important;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent) !important;
    transition: left 0.5s !important;
  }
  #ridera-form .rf-submit:hover::after { left: 100% !important; }
  #ridera-form .rf-submit:hover {
    box-shadow: 0 6px 32px rgba(232,93,32,0.45) !important;
    transform: translateY(-1px) !important;
  }
  #ridera-form .rf-submit:disabled {
    opacity: 0.5 !important; cursor: not-allowed !important; transform: none !important;
  }
  #ridera-form .rf-note {
    text-align: center !important; margin-top: 16px !important;
    font-size: 13px !important; color: #7a726a !important;
  }
  /* Success */
  #ridera-form .rf-success {
    display: none; text-align: center !important; padding: 80px 20px !important;
  }
  #ridera-form .rf-success .rf-check {
    width: 72px !important; height: 72px !important; border-radius: 50% !important;
    background: rgba(34,197,94,0.1) !important; border: 2px solid #22c55e !important;
    display: inline-flex !important; align-items: center !important; justify-content: center !important;
    font-size: 32px !important; margin-bottom: 24px !important;
    animation: rfPop 0.5s ease-out !important;
  }
  @keyframes rfPop {
    0% { transform: scale(0); opacity: 0; }
    70% { transform: scale(1.1); }
    100% { transform: scale(1); opacity: 1; }
  }
  #ridera-form .rf-success h2 {
    font-family: 'Bebas Neue', serif !important; font-size: 36px !important;
    letter-spacing: 2px !important; margin-bottom: 14px !important; color: #f2ede6 !important;
  }
  #ridera-form .rf-success p { color: #bdb4aa !important; font-size: 15px !important; max-width: 420px !important; margin: 0 auto 8px !important; }
  #ridera-form .rf-success .rf-ig {
    display: inline-block !important; margin-top: 24px !important;
    padding: 12px 28px !important; border-radius: 10px !important;
    background: rgba(232,93,32,0.1) !important; border: 1px solid rgba(232,93,32,0.3) !important;
    color: #E85D20 !important; font-weight: 700 !important; font-size: 14px !important;
    text-decoration: none !important; transition: all 0.2s !important;
  }
  #ridera-form .rf-success .rf-ig:hover {
    background: rgba(232,93,32,0.18) !important;
  }
  /* Footer */
  #ridera-form .rf-footer {
    text-align: center !important; padding: 28px !important;
    border-top: 1px solid #1e1a16 !important; margin-top: 24px !important;
    font-size: 12px !important; color: #5a524a !important;
  }
  body { margin: 0; padding: 0; background: #0e0e0e; }
</style></head><body>
<div id=\"ridera-form\">

  <div class=\"rf-hero\">
    <div class=\"rf-brand\">Ridera Aventura</div>
    <h1>Registro de Hotel Aliado</h1>
    <p>Únete a la red de hospedaje de RIDERA y recibe motociclistas viajeros de toda Colombia. Completa el formulario y te contactamos en menos de 48 horas.</p>
    <div class=\"rf-badge\">✦ Registro gratuito</div>
  </div>

  <div class=\"rf-progress\">
    <div class=\"rf-progress-step active\" data-sec=\"0\"></div>
    <div class=\"rf-progress-step\" data-sec=\"1\"></div>
    <div class=\"rf-progress-step\" data-sec=\"2\"></div>
    <div class=\"rf-progress-step\" data-sec=\"3\"></div>
    <div class=\"rf-progress-step\" data-sec=\"4\"></div>
  </div>

  <div class=\"rf-container\">
    <form id=\"hotelForm\">

      <div class=\"rf-section-title\"><span class=\"rf-sec-ico\">📍</span> Establecimiento</div>

      <div class=\"rf-field\">
        <label>Nombre del hotel / hospedaje <span class=\"rf-req\">*</span></label>
        <input type=\"text\" name=\"nombre\" required placeholder=\"Ej: Hotel La Montaña\">
      </div>

      <div class=\"rf-row\">
        <div class=\"rf-field\">
          <label>Departamento <span class=\"rf-req\">*</span></label>
          <select name=\"departamento\" id=\"rfDep\" required>
            <option value=\"\">Seleccionar...</option>
            <option>Amazonas</option><option>Antioquia</option><option>Arauca</option><option>Atlántico</option>
            <option>Bogotá D.C.</option><option>Bolívar</option><option>Boyacá</option><option>Caldas</option>
            <option>Caquetá</option><option>Casanare</option><option>Cauca</option><option>Cesar</option>
            <option>Chocó</option><option>Córdoba</option><option>Cundinamarca</option><option>Guainía</option>
            <option>Guaviare</option><option>Huila</option><option>La Guajira</option><option>Magdalena</option>
            <option>Meta</option><option>Nariño</option><option>Norte de Santander</option><option>Putumayo</option>
            <option>Quindío</option><option>Risaralda</option><option>San Andrés y Providencia</option>
            <option>Santander</option><option>Sucre</option><option>Tolima</option><option>Valle del Cauca</option>
            <option>Vaupés</option><option>Vichada</option>
          </select>
        </div>
        <div class=\"rf-field\">
          <label>Municipio / Ciudad <span class=\"rf-req\">*</span></label>
          <input type=\"text\" name=\"municipio\" required placeholder=\"Ej: Guatapé\">
        </div>
      </div>

      <div class=\"rf-field\" id=\"rfSubField\" style=\"display:none\">
        <label>Subregión de Antioquia</label>
        <select name=\"subregion\">
          <option value=\"\">Seleccionar...</option>
          <option>Valle de Aburrá</option><option>Oriente</option><option>Suroeste</option>
          <option>Norte</option><option>Occidente</option><option>Nordeste</option>
          <option>Magdalena Medio</option><option>Bajo Cauca</option><option>Urabá</option>
        </select>
      </div>

      <div class=\"rf-field\">
        <label>Dirección o referencia <span class=\"rf-req\">*</span></label>
        <input type=\"text\" name=\"direccion\" required placeholder=\"Dirección, vía, paradero o punto de referencia\">
      </div>

      <div class=\"rf-field\">
        <label>Ubicación GPS <span class=\"rf-opt\">(recomendado)</span></label>
        <div class=\"rf-gps-row\">
          <input type=\"text\" name=\"gps\" id=\"rfGps\" placeholder=\"Ej: 6.2308, -75.1590\">
          <button type=\"button\" class=\"rf-gps-btn\" id=\"rfGpsBtn\">📍 Mi ubicación</button>
        </div>
        <p class=\"rf-hint\">Abre Google Maps, mantén presionado el punto exacto y pega las coordenadas aquí.</p>
      </div>

      <div class=\"rf-field\">
        <label>Link de Google Maps <span class=\"rf-opt\">(opcional)</span></label>
        <input type=\"url\" name=\"google_maps_url\" placeholder=\"https://maps.google.com/...\">
      </div>

      <div class=\"rf-section-title\"><span class=\"rf-sec-ico\">📞</span> Contacto</div>

      <div class=\"rf-row\">
        <div class=\"rf-field\">
          <label>Nombre del responsable <span class=\"rf-req\">*</span></label>
          <input type=\"text\" name=\"contacto_nombre\" required placeholder=\"Nombre completo\">
        </div>
        <div class=\"rf-field\">
          <label>Cargo <span class=\"rf-opt\">(opcional)</span></label>
          <input type=\"text\" name=\"cargo\" placeholder=\"Ej: Administrador\">
        </div>
      </div>

      <div class=\"rf-row\">
        <div class=\"rf-field\">
          <label>Teléfono / WhatsApp <span class=\"rf-req\">*</span></label>
          <input type=\"tel\" name=\"telefono\" required placeholder=\"300 000 0000\">
        </div>
        <div class=\"rf-field\">
          <label>WhatsApp <span class=\"rf-opt\">(si es diferente)</span></label>
          <input type=\"tel\" name=\"whatsapp\" placeholder=\"300 000 0000\">
        </div>
      </div>

      <div class=\"rf-row\">
        <div class=\"rf-field\">
          <label>Correo electrónico</label>
          <input type=\"email\" name=\"email\" placeholder=\"correo@hotel.com\">
        </div>
        <div class=\"rf-field\">
          <label>Instagram</label>
          <input type=\"text\" name=\"instagram\" placeholder=\"@mihotel\">
        </div>
      </div>

      <div class=\"rf-row\">
        <div class=\"rf-field\">
          <label>Facebook</label>
          <input type=\"text\" name=\"facebook\" placeholder=\"Página o link\">
        </div>
        <div class=\"rf-field\">
          <label>Sitio web u otra red</label>
          <input type=\"text\" name=\"website\" placeholder=\"www.hotel.com\">
        </div>
      </div>

      <div class=\"rf-section-title\"><span class=\"rf-sec-ico\">🏨</span> Alojamiento</div>

      <div class=\"rf-field\">
        <label>Tipo de alojamiento</label>
        <select name=\"tipo_alojamiento\">
          <option value=\"\">Seleccionar...</option>
          <option>Hotel</option><option>Hostal</option><option>Finca</option>
          <option>Glamping</option><option>Camping</option><option>Cabaña</option>
          <option>Posada</option><option>Otro</option>
        </select>
      </div>

      <div class=\"rf-row\">
        <div class=\"rf-field\">
          <label>Rango de precios por noche</label>
          <select name=\"precio_rango\">
            <option value=\"\">Seleccionar...</option>
            <option>$30.000 – $60.000</option>
            <option>$60.000 – $100.000</option>
            <option>$100.000 – $180.000</option>
            <option>$180.000 – $300.000</option>
            <option>Más de $300.000</option>
          </select>
        </div>
        <div class=\"rf-field\">
          <label>N° de habitaciones</label>
          <input type=\"number\" name=\"num_habitaciones\" placeholder=\"Ej: 12\" min=\"1\">
        </div>
      </div>

      <div class=\"rf-field\">
        <label>Capacidad total de personas</label>
        <input type=\"number\" name=\"capacidad_personas\" placeholder=\"Ej: 30\" min=\"1\">
      </div>

      <div class=\"rf-field\">
        <label>Tipo de habitaciones <span class=\"rf-opt\">(selecciona las que apliquen)</span></label>
        <div class=\"rf-checks\">
          <label><input type=\"checkbox\" name=\"tipo_habitacion\" value=\"Individual\"> Individual</label>
          <label><input type=\"checkbox\" name=\"tipo_habitacion\" value=\"Doble/Pareja\"> Doble / Pareja</label>
          <label><input type=\"checkbox\" name=\"tipo_habitacion\" value=\"Múltiple\"> Múltiple (grupos)</label>
          <label><input type=\"checkbox\" name=\"tipo_habitacion\" value=\"Familiar\"> Familiar</label>
        </div>
      </div>

      <div class=\"rf-section-title\"><span class=\"rf-sec-ico\">🏍️</span> Para el motociclista</div>

      <div class=\"rf-field\">
        <label>¿Tienen parqueadero para motos? <span class=\"rf-req\">*</span></label>
        <select name=\"parqueadero_tipo\" required>
          <option value=\"\">Seleccionar...</option>
          <option>Sí, cubierto y vigilado</option>
          <option>Sí, cubierto sin vigilancia</option>
          <option>Sí, al aire libre</option>
          <option>No, pero hay parqueadero cercano</option>
          <option>No</option>
        </select>
      </div>

      <div class=\"rf-field\">
        <label>Descuento para riders RIDERA</label>
        <select name=\"descuento_moteros\">
          <option value=\"\">Seleccionar...</option>
          <option value=\"5\">5%</option>
          <option value=\"10\">10%</option>
          <option value=\"15\">15%</option>
          <option value=\"20\">20% o más</option>
          <option value=\"0\">Tarifa especial fija</option>
          <option value=\"-1\">Por definir</option>
        </select>
      </div>

      <div class=\"rf-field\">
        <label>Servicios disponibles</label>
        <div class=\"rf-checks\">
          <label><input type=\"checkbox\" name=\"servicios\" value=\"WiFi\"> WiFi gratuito</label>
          <label><input type=\"checkbox\" name=\"servicios\" value=\"Desayuno\"> Desayuno incluido</label>
          <label><input type=\"checkbox\" name=\"servicios\" value=\"Restaurante\"> Restaurante</label>
          <label><input type=\"checkbox\" name=\"servicios\" value=\"Piscina\"> Piscina</label>
          <label><input type=\"checkbox\" name=\"servicios\" value=\"Lavandería\"> Lavandería</label>
          <label><input type=\"checkbox\" name=\"servicios\" value=\"Herramientas motos\"> Herramientas para motos</label>
          <label><input type=\"checkbox\" name=\"servicios\" value=\"Zona camping\"> Zona de camping</label>
          <label><input type=\"checkbox\" name=\"servicios\" value=\"Agua caliente\"> Agua caliente</label>
          <label><input type=\"checkbox\" name=\"servicios\" value=\"Zona BBQ\"> Zona BBQ</label>
          <label><input type=\"checkbox\" name=\"servicios\" value=\"Bar\"> Bar</label>
        </div>
      </div>

      <div class=\"rf-section-title\"><span class=\"rf-sec-ico\">💳</span> Métodos de pago</div>
      <div class=\"rf-field\">
        <div class=\"rf-checks\">
          <label><input type=\"checkbox\" name=\"metodos_pago\" value=\"Efectivo\"> Efectivo</label>
          <label><input type=\"checkbox\" name=\"metodos_pago\" value=\"Nequi\"> Nequi</label>
          <label><input type=\"checkbox\" name=\"metodos_pago\" value=\"Daviplata\"> Daviplata</label>
          <label><input type=\"checkbox\" name=\"metodos_pago\" value=\"Tarjeta\"> Tarjeta</label>
          <label><input type=\"checkbox\" name=\"metodos_pago\" value=\"Transferencia\"> Transferencia</label>
          <label><input type=\"checkbox\" name=\"metodos_pago\" value=\"Booking/Airbnb\"> Booking / Airbnb</label>
        </div>
      </div>

      <div class=\"rf-section-title\"><span class=\"rf-sec-ico\">📝</span> Descripción</div>

      <div class=\"rf-field\">
        <label>Cuéntanos sobre tu hotel</label>
        <textarea name=\"descripcion\" placeholder=\"¿Qué lo hace especial? Atractivos cercanos, rutas de moto, por qué los moteros deberían quedarse aquí...\"></textarea>
      </div>

      <div class=\"rf-field\">
        <label>Comentarios adicionales</label>
        <textarea name=\"comentarios\" placeholder=\"Rutas cercanas, eventos, algo más que quieras contarnos...\"></textarea>
      </div>

      <button type=\"submit\" class=\"rf-submit\" id=\"rfSubmit\">Enviar registro</button>
      <p class=\"rf-note\">Te contactaremos en máximo 48 horas para confirmar tu alianza.</p>
    </form>

    <div class=\"rf-success\" id=\"rfSuccess\">
      <div class=\"rf-check\">✓</div>
      <h2>¡Registro recibido!</h2>
      <p>Gracias por querer ser parte de RIDERA. Revisaremos tu información y te contactaremos pronto.</p>
      <p>Mientras tanto, síguenos en Instagram:</p>
      <a class=\"rf-ig\" href=\"https://instagram.com/ridera.aventura\" target=\"_blank\">@ridera.aventura</a>
    </div>

    <div class=\"rf-footer\">RIDERA © 2026 — Plataforma para motociclistas de Colombia</div>
  </div>
</div>

<script>
  var rfDep = document.getElementById('rfDep');
  var rfSubField = document.getElementById('rfSubField');
  rfDep.addEventListener('change', function() {
    rfSubField.style.display = this.value === 'Antioquia' ? 'block' : 'none';
    if (this.value !== 'Antioquia') rfSubField.querySelector('select').value = '';
  });

  var rfGpsBtn = document.getElementById('rfGpsBtn');
  var rfGps = document.getElementById('rfGps');
  rfGpsBtn.addEventListener('click', function() {
    if (!navigator.geolocation) { alert('Tu navegador no soporta geolocalización.'); return; }
    rfGpsBtn.disabled = true; rfGpsBtn.textContent = 'Ubicando...';
    navigator.geolocation.getCurrentPosition(
      function(p) {
        rfGps.value = p.coords.latitude.toFixed(6) + ', ' + p.coords.longitude.toFixed(6);
        rfGpsBtn.disabled = false; rfGpsBtn.textContent = '📍 Mi ubicación';
      },
      function() {
        alert('No se pudo obtener ubicación. Pega las coordenadas manualmente.');
        rfGpsBtn.disabled = false; rfGpsBtn.textContent = '📍 Mi ubicación';
      }
    );
  });

  // Progress bar
  var sections = document.querySelectorAll('.rf-section-title');
  var steps = document.querySelectorAll('.rf-progress-step');
  function updateProgress() {
    var scrollPos = window.scrollY + window.innerHeight * 0.4;
    var activeIdx = 0;
    sections.forEach(function(sec, i) {
      if (sec.offsetTop < scrollPos) activeIdx = i;
    });
    steps.forEach(function(step, i) {
      step.classList.remove('active', 'done');
      if (i < activeIdx) step.classList.add('done');
      else if (i === activeIdx) step.classList.add('active');
    });
  }
  window.addEventListener('scroll', updateProgress);
  updateProgress();

  document.getElementById('hotelForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    var btn = document.getElementById('rfSubmit');
    btn.disabled = true; btn.textContent = 'ENVIANDO...';

    var fd = new FormData(this);
    var data = {};
    var servicios = [], metodos = [], tipoHab = [];
    for (var pair of fd.entries()) {
      if (pair[0] === 'servicios') servicios.push(pair[1]);
      else if (pair[0] === 'metodos_pago') metodos.push(pair[1]);
      else if (pair[0] === 'tipo_habitacion') tipoHab.push(pair[1]);
      else data[pair[0]] = pair[1];
    }
    data.servicios = servicios;
    data.metodos_pago = metodos;
    data.tipo_habitacion = tipoHab;

    if (data.gps) {
      var parts = data.gps.split(',').map(function(s) { return parseFloat(s.trim()); });
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        data.lat = parts[0]; data.lon = parts[1];
      }
    }
    delete data.gps;

    if (data.num_habitaciones) data.num_habitaciones = parseInt(data.num_habitaciones) || null;
    if (data.capacidad_personas) data.capacidad_personas = parseInt(data.capacidad_personas) || null;
    var desc = parseInt(data.descuento_moteros);
    data.descuento_moteros = isNaN(desc) ? null : (desc < 0 ? null : desc);

    data.parqueadero_motos = data.parqueadero_tipo && !data.parqueadero_tipo.startsWith('No');

    try {
      var r = await fetch('${SUPABASE_URL}/rest/v1/hoteles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': '${SUPABASE_ANON_KEY}',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(data)
      });
      if (!r.ok) throw new Error(await r.text());
      this.style.display = 'none';
      document.getElementById('rfSuccess').style.display = 'block';
      document.querySelector('.rf-progress').style.display = 'none';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch(err) {
      alert('Error al enviar: ' + err.message);
      btn.disabled = false; btn.textContent = 'ENVIAR REGISTRO';
    }
  });
</script></body></html>`;
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
  }
  const body = html();
  const bytes = new TextEncoder().encode(body);
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': String(bytes.length),
      'Connection': 'keep-alive',
      'Cache-Control': 'no-store',
    },
  });
});