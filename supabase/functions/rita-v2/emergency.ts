// ─────────────────────────────────────────────────────────────────
// Rita Phase 9 — Emergency Protocol & Accident Response
//
// Sistema de detección automática de accidentes y escalación:
//   - Detección de impacto via acelerómetro (>8G)
//   - Check-in de voz automático (0-3 segundos)
//   - Escalonamiento: SMS contactos → 122 ambulancia → grúa Ridera
//   - Documentación post-accidente y auto-filing de seguros
// ─────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase: SupabaseClient = createClient(SB_URL, SB_KEY);

export type EmergencyIncident = {
  id: string;
  riderId: string;
  incidentType: string; // 'impact_detected', 'distress_button', 'manual_report'
  timestamp: string;
  location: { lat: number; lon: number } | null;
  escalationLevel: number;
  wasRealEmergency: boolean | null;
};

export type EmergencyContact = {
  id: string;
  contactName: string;
  phone: string;
  relationship: string;
  priority: number;
};

export type RiderMedicalInfo = {
  bloodType: string | null;
  allergies: string[];
  medications: string[];
  knownConditions: string[];
};

// ─── Validar que el rider tiene contactos y modo emergencia activo ────
export async function esRiderPreparado(phone: string): Promise<boolean> {
  const tel = phone.replace(/^57/, "");

  const { data: rider } = await supabase
    .from("riders")
    .select("id")
    .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
    .maybeSingle();

  if (!rider) return false;

  const { data: contacts } = await supabase
    .from("emergency_contacts")
    .select("id")
    .eq("rider_id", rider.id);

  return (contacts?.length ?? 0) > 0;
}

// ─── Obtener contactos de emergencia del rider ───────────────────────
export async function obtenerContactosEmergencia(phone: string): Promise<EmergencyContact[]> {
  const tel = phone.replace(/^57/, "");

  const { data: rider } = await supabase
    .from("riders")
    .select("id")
    .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
    .maybeSingle();

  if (!rider) return [];

  const { data: contacts } = await supabase
    .from("emergency_contacts")
    .select("id, contact_name, phone_number, relationship, priority")
    .eq("rider_id", rider.id)
    .order("priority", { ascending: true })
    .limit(5);

  if (!contacts) return [];

  return contacts.map((c) => ({
    id: c.id,
    contactName: c.contact_name,
    phone: c.phone_number,
    relationship: c.relationship || "contacto",
    priority: c.priority || 1,
  }));
}

// ─── Obtener información médica del rider ────────────────────────────
export async function obtenerInfoMedica(phone: string): Promise<RiderMedicalInfo | null> {
  const tel = phone.replace(/^57/, "");

  const { data: rider } = await supabase
    .from("riders")
    .select("id")
    .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
    .maybeSingle();

  if (!rider) return null;

  const { data: medicalInfo } = await supabase
    .from("rider_medical_info")
    .select("blood_type, allergies, medications, known_conditions")
    .eq("rider_id", rider.id)
    .maybeSingle();

  if (!medicalInfo) {
    return {
      bloodType: null,
      allergies: [],
      medications: [],
      knownConditions: [],
    };
  }

  return {
    bloodType: medicalInfo.blood_type,
    allergies: medicalInfo.allergies || [],
    medications: medicalInfo.medications || [],
    knownConditions: medicalInfo.known_conditions || [],
  };
}

// ─── Registrar incidente de impacto o emergencia ──────────────────────
export async function registrarIncidente(
  phone: string,
  incidentType: string,
  location: { lat: number; lon: number } | null = null,
  impactData: { ax: number; ay: number; az: number; severity: number } | null = null,
): Promise<EmergencyIncident | null> {
  const tel = phone.replace(/^57/, "");

  const { data: rider } = await supabase
    .from("riders")
    .select("id")
    .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
    .maybeSingle();

  if (!rider) return null;

  const incidentData = {
    rider_id: rider.id,
    incident_type: incidentType,
    timestamp: new Date().toISOString(),
    location: location ? `POINT(${location.lat} ${location.lon})` : null,
    acceleration_x: impactData?.ax ?? null,
    acceleration_y: impactData?.ay ?? null,
    acceleration_z: impactData?.az ?? null,
    impact_severity: impactData?.severity ?? null,
    escalation_level: 1, // Comienza en nivel 1 (audio check-in)
  };

  const { data: incident, error } = await supabase
    .from("emergency_incidents")
    .insert([incidentData])
    .select("id, rider_id, incident_type, timestamp, escalation_level")
    .single();

  if (error || !incident) {
    console.error("Error registrando incidente:", error);
    return null;
  }

  return {
    id: incident.id,
    riderId: incident.rider_id,
    incidentType: incident.incident_type,
    timestamp: incident.timestamp,
    location,
    escalationLevel: incident.escalation_level,
    wasRealEmergency: null,
  };
}

// ─── Procesar respuesta del rider al check-in de voz ───────────────────
export async function procesarRespuestaCheckIn(
  incidentId: string,
  response: string,
  responseTimeMs: number,
): Promise<boolean> {
  const estaOk = /sí|estoy bien|ok|todo bien|dale|bueno/i.test(response);

  const { error } = await supabase
    .from("emergency_incidents")
    .update({
      rider_responded: true,
      rider_response: response,
      rider_response_time_ms: responseTimeMs,
      was_real_emergency: false,
      resolved_at: new Date().toISOString(),
      resolution_reason: "rider_ok",
    })
    .eq("id", incidentId);

  if (error) {
    console.error("Error procesando respuesta check-in:", error);
  }

  return estaOk;
}

// ─── Escalar a Tier 2: Notificar contactos de emergencia por SMS ───────
export async function escalarA_SMS(incidentId: string, phone: string): Promise<boolean> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id, nombre, moto_marca, moto_modelo")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return false;

    // Obtener contactos de emergencia
    const { data: contacts } = await supabase
      .from("emergency_contacts")
      .select("phone_number")
      .eq("rider_id", rider.id)
      .eq("consent", true)
      .limit(3); // Solo los 3 primeros

    if (!contacts || contacts.length === 0) {
      console.warn("No hay contactos de emergencia para:", phone);
      return false;
    }

    // Obtener datos del incidente
    const { data: incident } = await supabase
      .from("emergency_incidents")
      .select("location, timestamp")
      .eq("id", incidentId)
      .maybeSingle();

    // Construir mensaje SMS
    const nombreRider = rider.nombre || "Motero";
    const moto = `${rider.moto_marca || ""} ${rider.moto_modelo || ""}`.trim() || "moto";
    const msgSMS = `⚠️ POSIBLE ACCIDENTE
Rider: ${nombreRider}
Moto: ${moto}
Ubicación: https://maps.google.com/?q=...
Hora: ${new Date().toLocaleTimeString("es-CO")}

Contacta a ${nombreRider} o llama 122 si necesita ayuda.`;

    // Enviar SMS a contactos (simulado, en producción usar Twilio)
    console.log(`[SMS] Enviando a ${contacts.length} contactos:`, msgSMS);

    // Actualizar incidente a Tier 2
    await supabase
      .from("emergency_incidents")
      .update({
        escalation_level: 2,
        escalated_at: new Date().toISOString(),
      })
      .eq("id", incidentId);

    return true;
  } catch (e) {
    console.error("Error escalonando a SMS:", e);
    return false;
  }
}

// ─── Escalar a Tier 3: Llamar 122 (ambulancia) ────────────────────────
export async function escalarA_122(incidentId: string, phone: string): Promise<boolean> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id, nombre")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return false;

    // Obtener info médica
    const { data: medicalInfo } = await supabase
      .from("rider_medical_info")
      .select("blood_type")
      .eq("rider_id", rider.id)
      .maybeSingle();

    // Obtener incidente
    const { data: incident } = await supabase
      .from("emergency_incidents")
      .select("location, timestamp")
      .eq("id", incidentId)
      .maybeSingle();

    // Datos para dispatch
    const dispatchData = {
      rider_name: rider.nombre,
      rider_id: rider.id,
      blood_type: medicalInfo?.blood_type || "desconocido",
      location: incident?.location || "ubicación desconocida",
      timestamp: new Date().toISOString(),
    };

    console.log(`[122] Llamada de emergencia registrada:`, dispatchData);

    // En producción: llamar Twilio API
    // const twilio = new TwilioAPI();
    // await twilio.call({
    //   to: "+57 122",
    //   from: TWILIO_PHONE,
    //   twiml: buildTwiML(dispatchData)
    // });

    await supabase
      .from("emergency_incidents")
      .update({
        escalation_level: 3,
        escalated_at: new Date().toISOString(),
        was_real_emergency: true,
      })
      .eq("id", incidentId);

    return true;
  } catch (e) {
    console.error("Error escalonando a 122:", e);
    return false;
  }
}

// ─── Escalar a Tier 4: Despachar grúa Ridera ────────────────────────
export async function escalarA_Grua(incidentId: string, phone: string): Promise<boolean> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id, nombre, moto_marca, moto_modelo")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return false;

    const { data: incident } = await supabase
      .from("emergency_incidents")
      .select("location, timestamp")
      .eq("id", incidentId)
      .maybeSingle();

    // En producción: llamar API de grúa Ridera
    const gruaRequest = {
      rider_id: rider.id,
      rider_name: rider.nombre,
      bike: `${rider.moto_marca} ${rider.moto_modelo}`,
      location: incident?.location,
      service_type: "emergency_rescue",
      priority: "alta",
    };

    console.log(`[GRÚA] Solicitud de despacho:`, gruaRequest);

    await supabase
      .from("emergency_incidents")
      .update({
        escalation_level: 4,
        escalated_at: new Date().toISOString(),
      })
      .eq("id", incidentId);

    return true;
  } catch (e) {
    console.error("Error escalonando a grúa:", e);
    return false;
  }
}

// ─── Obtener incidentes recientes del rider ────────────────────────────
export async function obtenerIncidentesRecientes(phone: string, diasAtras: number = 30): Promise<EmergencyIncident[]> {
  const tel = phone.replace(/^57/, "");

  const { data: rider } = await supabase
    .from("riders")
    .select("id")
    .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
    .maybeSingle();

  if (!rider) return [];

  const { data: incidents } = await supabase
    .from("emergency_incidents")
    .select("id, rider_id, incident_type, timestamp, escalation_level, was_real_emergency, location")
    .eq("rider_id", rider.id)
    .gt("timestamp", new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000).toISOString())
    .order("timestamp", { ascending: false });

  if (!incidents) return [];

  return incidents.map((inc) => ({
    id: inc.id,
    riderId: inc.rider_id,
    incidentType: inc.incident_type,
    timestamp: inc.timestamp,
    location: null, // Simplificado; en producción parsear POINT
    escalationLevel: inc.escalation_level,
    wasRealEmergency: inc.was_real_emergency,
  }));
}

// ─── Obtener alertas de seguridad de la comunidad (hotspots de accidentes) ───
export async function obtenerAlertasSeguridad(phone: string, radiusKm: number = 3): Promise<string> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id, ciudad")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return "";

    // Obtener analytics de accidentes cercanos
    const { data: analytics } = await supabase
      .from("accident_analytics")
      .select("location_name, incident_count, severity_avg, last_incident, road_type, weather_condition")
      .order("last_incident", { ascending: false })
      .limit(5);

    if (!analytics || analytics.length === 0) return "";

    let alertas = "🚨 ALERTAS DE SEGURIDAD CERCANAS:\n";
    analytics.forEach((a) => {
      const titulo = `${a.location_name} (${a.road_type})`;
      const severidad = a.incident_count > 3 ? "⚠️⚠️⚠️" : "⚠️";
      const clima = a.weather_condition ? ` · ${a.weather_condition}` : "";
      alertas += `${severidad} ${titulo}${clima}\n`;
    });

    return alertas;
  } catch (e) {
    console.error("Error obteniendo alertas de seguridad:", e);
    return "";
  }
}

// ─── Generar contexto de emergencia para el prompt de Rita ─────────────
export async function generarContextoEmergencia(phone: string): Promise<string> {
  try {
    // Verificar si el rider tiene modo emergencia activo
    const preparado = await esRiderPreparado(phone);
    if (!preparado) {
      return `EMERGENCIA DESACTIVADA: Este rider no ha configurado contactos de emergencia.
No se puede activar modo SOS sin contactos. Sugiérele registrar familiares/amigos primero.`;
    }

    const contactos = await obtenerContactosEmergencia(phone);
    const medicalInfo = await obtenerInfoMedica(phone);
    const incidents = await obtenerIncidentesRecientes(phone, 30);
    const alertas = await obtenerAlertasSeguridad(phone, 3);

    let contexto = `MODO EMERGENCIA ACTIVO:
Contactos registrados: ${contactos.length}
Información médica: ${medicalInfo?.bloodType ? `Tipo de sangre ${medicalInfo.bloodType}` : "No registrada"}
Incidentes en 30 días: ${incidents.length}`;

    if (incidents.length > 0) {
      const ultimoIncidente = incidents[0];
      contexto += `\nÚltimo incidente: ${ultimoIncidente.timestamp} (${ultimoIncidente.incidentType})`;
    }

    if (alertas) {
      contexto += `\n\n${alertas}`;
    }

    return contexto;
  } catch (e) {
    console.error("Error generando contexto emergencia:", e);
    return "";
  }
}
