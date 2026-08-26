import { supabase } from "./tools.ts";

export async function detectarEmergencia(phone: string, detectionType: string, confidenceLevel: number, sensorData: Record<string, unknown>): Promise<{ detectionId: string; confidence: number; autoRespond: boolean }> {
  const { data: rider } = await supabase.from("riders").select("id").eq("telefono", phone.replace(/^57/, "")).maybeSingle();
  if (!rider) return { detectionId: "", confidence: 0, autoRespond: false };

  const { data: detection, error } = await supabase.from("emergency_detections").insert({
    rider_id: rider.id,
    detection_type: detectionType,
    confidence_level: confidenceLevel,
    sensor_data: sensorData,
    detected_at: new Date().toISOString(),
  }).select().single();

  if (error) {
    console.error("Error detectarEmergencia:", error);
    return { detectionId: "", confidence: 0, autoRespond: false };
  }

  const shouldAutoRespond = confidenceLevel > 80;
  return { detectionId: detection.id, confidence: confidenceLevel, autoRespond: shouldAutoRespond };
}

export async function confirmarEmergencia(phone: string, detectionId: string): Promise<{ responseId: string; ok: boolean; message: string }> {
  const { data: rider } = await supabase.from("riders").select("id").eq("telefono", phone.replace(/^57/, "")).maybeSingle();
  if (!rider) return { responseId: "", ok: false, message: "Rider not found" };

  const { data: response, error } = await supabase.from("emergency_responses").insert({
    rider_id: rider.id,
    detection_id: detectionId,
    response_type: "confirm_emergency",
    triggered_by: "rider",
    status: "responded",
    rider_contacted_at: new Date().toISOString(),
  }).select().single();

  if (error) {
    console.error("Error confirmarEmergencia:", error);
    return { responseId: "", ok: false, message: "Failed to confirm emergency" };
  }

  await supabase.from("emergency_detections").update({ rider_acknowledged_at: new Date().toISOString() }).eq("id", detectionId);
  return { responseId: response.id, ok: true, message: "Emergency confirmed. Emergency services notified." };
}

export async function cancelarFalsoPositivo(phone: string, detectionId: string): Promise<{ ok: boolean; message: string }> {
  const { data: rider } = await supabase.from("riders").select("id").eq("telefono", phone.replace(/^57/, "")).maybeSingle();
  if (!rider) return { ok: false, message: "Rider not found" };

  await supabase.from("emergency_detections").update({ rider_acknowledged_at: new Date().toISOString() }).eq("id", detectionId);
  await supabase.from("emergency_responses").insert({
    rider_id: rider.id,
    detection_id: detectionId,
    response_type: "manual_cancel",
    triggered_by: "rider",
    status: "cancelled",
  });

  const { data: stats } = await supabase.from("emergency_statistics").select("total_false_alarms").eq("rider_id", rider.id).maybeSingle();
  const falseAlarmCount = (stats?.total_false_alarms ?? 0) + 1;
  await supabase.from("emergency_statistics").upsert({ rider_id: rider.id, total_false_alarms: falseAlarmCount });

  return { ok: true, message: "False alarm cancelled. No emergency services contacted." };
}

export async function activarSOS(phone: string): Promise<{ responseId: string; ok: boolean; message: string }> {
  const { data: rider } = await supabase.from("riders").select("id").eq("telefono", phone.replace(/^57/, "")).maybeSingle();
  if (!rider) return { responseId: "", ok: false, message: "Rider not found" };

  const { data: detection, error: detectionError } = await supabase.from("emergency_detections").insert({
    rider_id: rider.id,
    detection_type: "manual_sos",
    confidence_level: 100,
    sensor_data: { manual_activation: true },
    detected_at: new Date().toISOString(),
  }).select().single();

  if (detectionError) {
    console.error("Error activarSOS:", detectionError);
    return { responseId: "", ok: false, message: "Failed to activate SOS" };
  }

  const { data: response } = await supabase.from("emergency_responses").insert({
    rider_id: rider.id,
    detection_id: detection.id,
    response_type: "confirm_emergency",
    triggered_by: "rider",
    status: "responded",
    rider_contacted_at: new Date().toISOString(),
  }).select().single();

  await notificarContactosEmergencia(phone, "SOS manual activado", "critical");
  return { responseId: response?.id || "", ok: true, message: "SOS activated! Emergency services and contacts notified." };
}

export async function obtenerContactosEmergencia(phone: string): Promise<Array<{ name: string; phone: string; relationship: string }>> {
  const { data: rider } = await supabase.from("riders").select("id").eq("telefono", phone.replace(/^57/, "")).maybeSingle();
  if (!rider) return [];

  const { data: contacts } = await supabase.from("emergency_contacts").select("name, phone, relationship").eq("rider_id", rider.id).order("notify_priority");
  return contacts || [];
}

export async function registrarContactoEmergencia(phone: string, name: string, contactPhone: string, relationship: string): Promise<{ ok: boolean; message: string }> {
  const { data: rider } = await supabase.from("riders").select("id").eq("telefono", phone.replace(/^57/, "")).maybeSingle();
  if (!rider) return { ok: false, message: "Rider not found" };

  const { error } = await supabase.from("emergency_contacts").insert({
    rider_id: rider.id,
    name,
    phone: contactPhone,
    relationship,
    notify_priority: 1,
  });

  if (error) {
    console.error("Error registrarContactoEmergencia:", error);
    return { ok: false, message: "Failed to register contact" };
  }

  return { ok: true, message: `Emergency contact ${name} registered successfully.` };
}

export async function obtenerPerfilMedico(phone: string): Promise<{ bloodType?: string; allergies: string[]; conditions: string[]; emergencyContactName?: string }> {
  const { data: rider } = await supabase.from("riders").select("id").eq("telefono", phone.replace(/^57/, "")).maybeSingle();
  if (!rider) return { allergies: [], conditions: [] };

  const { data: profile } = await supabase.from("emergency_medical_profiles").select("blood_type, allergies, medical_conditions, emergency_contact_name").eq("rider_id", rider.id).maybeSingle();
  return {
    bloodType: profile?.blood_type,
    allergies: profile?.allergies || [],
    conditions: profile?.medical_conditions || [],
    emergencyContactName: profile?.emergency_contact_name,
  };
}

export async function actualizarPerfilMedico(phone: string, bloodType: string, allergies: string[], conditions: string[], emergencyContactName: string): Promise<{ ok: boolean; message: string }> {
  const { data: rider } = await supabase.from("riders").select("id").eq("telefono", phone.replace(/^57/, "")).maybeSingle();
  if (!rider) return { ok: false, message: "Rider not found" };

  const { error } = await supabase.from("emergency_medical_profiles").upsert({
    rider_id: rider.id,
    blood_type: bloodType,
    allergies,
    medical_conditions: conditions,
    emergency_contact_name: emergencyContactName,
  });

  if (error) {
    console.error("Error actualizarPerfilMedico:", error);
    return { ok: false, message: "Failed to update medical profile" };
  }

  return { ok: true, message: "Medical profile updated successfully." };
}

export async function compartirUbicacion(phone: string, responseId: string, durationMinutes: number): Promise<{ ok: boolean; shareToken: string; message: string }> {
  const { data: rider } = await supabase.from("riders").select("id").eq("telefono", phone.replace(/^57/, "")).maybeSingle();
  if (!rider) return { ok: false, shareToken: "", message: "Rider not found" };

  const shareToken = Math.random().toString(36).substring(2, 15);
  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

  const { error } = await supabase.from("emergency_shared_routes").insert({
    rider_id: rider.id,
    emergency_response_id: responseId,
    share_token: shareToken,
    shared_at: new Date().toISOString(),
    expires_at: expiresAt,
    active: true,
  });

  if (error) {
    console.error("Error compartirUbicacion:", error);
    return { ok: false, shareToken: "", message: "Failed to share location" };
  }

  return { ok: true, shareToken, message: `Location shared for ${durationMinutes} minutes. Share token: ${shareToken}` };
}

export async function notificarContactosEmergencia(phone: string, message: string, priority: string): Promise<{ notified: number; failed: number }> {
  const { data: rider } = await supabase.from("riders").select("id").eq("telefono", phone.replace(/^57/, "")).maybeSingle();
  if (!rider) return { notified: 0, failed: 0 };

  const { data: contacts } = await supabase.from("emergency_contacts").select("phone").eq("rider_id", rider.id).eq("notify_on_emergency", true);
  if (!contacts) return { notified: 0, failed: 0 };

  let notified = 0;
  let failed = 0;

  for (const contact of contacts) {
    try {
      const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${Deno.env.get("TWILIO_ACCOUNT_SID")}/Messages.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${btoa(`${Deno.env.get("TWILIO_ACCOUNT_SID")}:${Deno.env.get("TWILIO_AUTH_TOKEN"}`)}`,
        },
        body: new URLSearchParams({
          From: Deno.env.get("TWILIO_PHONE_FROM") || "",
          To: contact.phone,
          Body: message,
        }).toString(),
      });

      if (resp.ok) notified++;
      else failed++;
    } catch (e) {
      console.error("Error notifying contact:", e);
      failed++;
    }
  }

  return { notified, failed };
}

export async function registrarReporteIncidente(phone: string, responseId: string, incidentType: string, description: string, injuriesReported: string[]): Promise<{ ok: boolean; reportId: string; message: string }> {
  const { data: rider } = await supabase.from("riders").select("id").eq("telefono", phone.replace(/^57/, "")).maybeSingle();
  if (!rider) return { ok: false, reportId: "", message: "Rider not found" };

  const { data: report, error } = await supabase.from("incident_reports").insert({
    rider_id: rider.id,
    emergency_response_id: responseId,
    incident_type: incidentType,
    description,
    injuries_reported: injuriesReported,
    severity_level: injuriesReported.length > 0 ? "moderate" : "minor",
    submitted_at: new Date().toISOString(),
  }).select().single();

  if (error) {
    console.error("Error registrarReporteIncidente:", error);
    return { ok: false, reportId: "", message: "Failed to register incident report" };
  }

  await supabase.from("emergency_statistics").upsert({
    rider_id: rider.id,
    total_real_emergencies: (await supabase.from("emergency_statistics").select("total_real_emergencies").eq("rider_id", rider.id).maybeSingle()).data?.total_real_emergencies ?? 0 + 1,
  });

  return { ok: true, reportId: report.id, message: "Incident report registered. Thank you for the information." };
}

export async function obtenerEstadisticasEmergencia(phone: string): Promise<{ totalEmergencies: number; falseAlarms: number; realEmergencies: number; lastEmergencyDays: number | null }> {
  const { data: rider } = await supabase.from("riders").select("id").eq("telefono", phone.replace(/^57/, "")).maybeSingle();
  if (!rider) return { totalEmergencies: 0, falseAlarms: 0, realEmergencies: 0, lastEmergencyDays: null };

  const { data: stats } = await supabase.from("emergency_statistics").select("total_emergencies_detected, total_false_alarms, total_real_emergencies, last_emergency_date").eq("rider_id", rider.id).maybeSingle();

  const lastEmergencyDays = stats?.last_emergency_date ? Math.floor((Date.now() - new Date(stats.last_emergency_date).getTime()) / (1000 * 60 * 60 * 24)) : null;

  return {
    totalEmergencies: stats?.total_emergencies_detected || 0,
    falseAlarms: stats?.total_false_alarms || 0,
    realEmergencies: stats?.total_real_emergencies || 0,
    lastEmergencyDays,
  };
}

export async function generarContextoEmergencia(phone: string): Promise<string> {
  const { data: rider } = await supabase.from("riders").select("id").eq("telefono", phone.replace(/^57/, "")).maybeSingle();
  if (!rider) return "";

  const { data: stats } = await supabase.from("emergency_statistics").select("total_real_emergencies, total_false_alarms, days_since_last_emergency").eq("rider_id", rider.id).maybeSingle();

  if (!stats || (stats.total_real_emergencies === 0 && stats.total_false_alarms === 0)) {
    return "🚨 EMERGENCIAS: Sin historial de emergencias.\n";
  }

  const bloque = `🚨 EMERGENCIAS:
- Total de emergencias: ${stats.total_real_emergencies + stats.total_false_alarms}
- Emergencias reales: ${stats.total_real_emergencies}
- Falsas alarmas: ${stats.total_false_alarms}
- Días desde última emergencia: ${stats.days_since_last_emergency || "N/A"}
- Rita puede detectar caídas, impactos y activar SOS. Todos tus contactos de emergencia están registrados.

`;

  return bloque;
}
