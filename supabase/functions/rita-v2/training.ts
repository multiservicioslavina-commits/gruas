import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

// ────────────────────────────────────────────────────────────────
// PHASE 8 — AI-Powered Training & Certification
// ────────────────────────────────────────────────────────────────

interface SkillProfile {
  rider_id: string;
  overall_level: "beginner" | "intermediate" | "advanced" | "expert";
  experience_score: number;
  risk_profile: string;
}

interface TrainingModule {
  id: string;
  name: string;
  category: string;
  difficulty_level: string;
  total_duration_minutes: number;
  awards_certification: boolean;
}

interface TrainingProgress {
  rider_id: string;
  module_id: string;
  status: "not_started" | "in_progress" | "completed" | "abandoned";
  completion_percentage: number;
  assessment_score?: number;
  passed: boolean;
}

// Obtener perfil de habilidades del rider
export async function obtenerPerfilHabilidades(phone: string): Promise<SkillProfile | null> {
  const tel = phone.replace(/^57/, "");
  const { data: rider } = await supabase
    .from("riders")
    .select("id")
    .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
    .limit(1)
    .maybeSingle();

  if (!rider) return null;

  const { data: profile } = await supabase
    .from("rider_skill_profiles")
    .select("*")
    .eq("rider_id", rider.id)
    .maybeSingle();

  return profile ?? null;
}

// Evaluación diagnóstica basada en conducción reciente
export async function realizarEvaluacionDiagnostica(phone: string): Promise<{
  profile_created: boolean;
  overall_level: string;
  risk_score: number;
  recommended_modules: string[];
}> {
  const tel = phone.replace(/^57/, "");
  const { data: rider } = await supabase
    .from("riders")
    .select("id, total_distancia_km")
    .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
    .limit(1)
    .maybeSingle();

  if (!rider) {
    return {
      profile_created: false,
      overall_level: "unknown",
      risk_score: 0,
      recommended_modules: []
    };
  }

  // Determinar nivel basado en km acumulados
  let overallLevel = "beginner";
  let experienceScore = 0;

  if (rider.total_distancia_km > 50000) {
    overallLevel = "expert";
    experienceScore = 100;
  } else if (rider.total_distancia_km > 15000) {
    overallLevel = "advanced";
    experienceScore = 80;
  } else if (rider.total_distancia_km > 3000) {
    overallLevel = "intermediate";
    experienceScore = 60;
  } else {
    overallLevel = "beginner";
    experienceScore = 30;
  }

  // Obtener últimas sesiones para analizar patrones de conducción
  const { data: recentSessions } = await supabase
    .from("rider_sessions")
    .select("hard_braking_count, speed_violations, rapid_acceleration_count, near_miss_count")
    .eq("rider_id", rider.id)
    .order("created_at", { ascending: false })
    .limit(30);

  let totalIncidents = 0;
  let riskScore = experienceScore;

  if (recentSessions) {
    const incidents = recentSessions.reduce((sum, s) => {
      return sum + (s.hard_braking_count || 0) + (s.speed_violations || 0) + (s.rapid_acceleration_count || 0) + (s.near_miss_count || 0);
    }, 0);
    totalIncidents = incidents;
    riskScore = Math.max(0, experienceScore - incidents * 2);
  }

  // Recomendar módulos basado en perfil
  const recommendedModules: string[] = [];

  if (riskScore < 40) {
    recommendedModules.push("safety_fundamentals", "defensive_driving");
  }
  if (totalIncidents > 10) {
    recommendedModules.push("emergency_response");
  }
  if (overallLevel === "intermediate" || overallLevel === "advanced") {
    recommendedModules.push("maintenance_mastery");
  }

  // Crear o actualizar perfil de habilidades
  const { data: existingProfile } = await supabase
    .from("rider_skill_profiles")
    .select("id")
    .eq("rider_id", rider.id)
    .maybeSingle();

  if (existingProfile) {
    await supabase
      .from("rider_skill_profiles")
      .update({
        overall_level: overallLevel,
        experience_score: experienceScore,
        risk_profile: riskScore > 70 ? "safe" : riskScore > 40 ? "moderate" : "aggressive",
        last_assessment: new Date().toISOString()
      })
      .eq("rider_id", rider.id);
  } else {
    await supabase.from("rider_skill_profiles").insert({
      rider_id: rider.id,
      overall_level: overallLevel,
      experience_score: experienceScore,
      risk_profile: riskScore > 70 ? "safe" : riskScore > 40 ? "moderate" : "aggressive",
      city_riding_score: 50,
      highway_riding_score: 50,
      emergency_response_score: 40,
      weather_handling_score: 45,
      defensive_riding_score: 40,
      bike_maintenance_score: 30,
      safety_awareness_score: experienceScore
    });
  }

  // Registrar evaluación diagnóstica
  await supabase.from("diagnostic_assessments").insert({
    rider_id: rider.id,
    assessment_type: "behavioral",
    city_riding_assessment: 50,
    highway_riding_assessment: 55,
    emergency_response_assessment: 40,
    weather_handling_assessment: 45,
    defensive_riding_assessment: 40,
    hard_braking_incidents: totalIncidents > 5 ? Math.floor(totalIncidents / 5) : 0,
    speed_violations: 0,
    rapid_acceleration_count: 0,
    near_miss_reports: 0,
    risk_score: 100 - riskScore,
    recommended_modules: recommendedModules,
    recommended_focus_areas: riskScore < 60 ? ["safety", "emergency_response"] : ["advanced_skills"],
    completed_at: new Date().toISOString()
  });

  return {
    profile_created: true,
    overall_level: overallLevel,
    risk_score: 100 - riskScore,
    recommended_modules: recommendedModules
  };
}

// Obtener módulos de entrenamiento disponibles
export async function obtenerModulosDisponibles(
  level?: "beginner" | "intermediate" | "advanced" | "expert",
  category?: string
): Promise<TrainingModule[]> {
  let query = supabase
    .from("training_modules")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (level) {
    query = query.eq("difficulty_level", level);
  }
  if (category) {
    query = query.eq("category", category);
  }

  const { data } = await query;
  return data ?? [];
}

// Iniciar módulo de entrenamiento
export async function iniciarModuloEntrenamiento(phone: string, moduleId: string): Promise<{
  success: boolean;
  progress_id: string;
  module_name: string;
  estimated_duration_minutes: number;
}> {
  const tel = phone.replace(/^57/, "");
  const { data: rider } = await supabase
    .from("riders")
    .select("id")
    .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
    .limit(1)
    .maybeSingle();

  if (!rider) {
    return { success: false, progress_id: "", module_name: "", estimated_duration_minutes: 0 };
  }

  // Obtener módulo
  const { data: module } = await supabase
    .from("training_modules")
    .select("id, name, total_duration_minutes")
    .eq("id", moduleId)
    .maybeSingle();

  if (!module) {
    return { success: false, progress_id: "", module_name: "", estimated_duration_minutes: 0 };
  }

  // Crear o actualizar progreso
  const { data: existingProgress } = await supabase
    .from("rider_training_progress")
    .select("id")
    .eq("rider_id", rider.id)
    .eq("module_id", moduleId)
    .maybeSingle();

  let progressId = "";

  if (existingProgress) {
    await supabase
      .from("rider_training_progress")
      .update({ status: "in_progress", last_accessed: new Date().toISOString() })
      .eq("id", existingProgress.id);
    progressId = existingProgress.id;
  } else {
    const { data: newProgress } = await supabase
      .from("rider_training_progress")
      .insert({
        rider_id: rider.id,
        module_id: moduleId,
        status: "in_progress"
      })
      .select("id")
      .single();

    progressId = newProgress?.id ?? "";
  }

  return {
    success: true,
    progress_id: progressId,
    module_name: module.name,
    estimated_duration_minutes: module.total_duration_minutes
  };
}

// Completar módulo y registrar certificación
export async function completarModuloEntrenamiento(
  phone: string,
  moduleId: string,
  assessmentScore: number
): Promise<{
  completed: boolean;
  assessment_passed: boolean;
  certification_earned: boolean;
  certification_number?: string;
  badge_earned?: string;
}> {
  const tel = phone.replace(/^57/, "");
  const { data: rider } = await supabase
    .from("riders")
    .select("id")
    .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
    .limit(1)
    .maybeSingle();

  if (!rider) {
    return { completed: false, assessment_passed: false, certification_earned: false };
  }

  // Obtener módulo
  const { data: module } = await supabase
    .from("training_modules")
    .select("*")
    .eq("id", moduleId)
    .maybeSingle();

  if (!module) {
    return { completed: false, assessment_passed: false, certification_earned: false };
  }

  const passed = assessmentScore >= (module.passing_score || 70);

  // Actualizar progreso
  const { data: progress } = await supabase
    .from("rider_training_progress")
    .select("id")
    .eq("rider_id", rider.id)
    .eq("module_id", moduleId)
    .maybeSingle();

  if (progress) {
    await supabase
      .from("rider_training_progress")
      .update({
        status: passed ? "completed" : "abandoned",
        completion_percentage: 100,
        assessment_score: assessmentScore,
        passed: passed,
        completed_at: new Date().toISOString()
      })
      .eq("id", progress.id);
  }

  let certificationNumber = "";
  let badgeEarned = "";

  if (passed && module.awards_certification) {
    // Generar número de certificación
    certificationNumber = `RSA-${rider.id.substring(0, 8).toUpperCase()}-${Date.now()}`;

    // Registrar certificación
    await supabase.from("certification_history").insert({
      rider_id: rider.id,
      module_id: moduleId,
      certification_type: module.certification_type,
      certification_number: certificationNumber,
      issuing_body: "Ridera Institute",
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + (module.certification_valid_months || 24) * 30 * 24 * 60 * 60 * 1000).toISOString(),
      exam_score: assessmentScore,
      exam_date: new Date().toISOString()
    });
  }

  // Verificar badges
  if (assessmentScore >= 95) {
    badgeEarned = "perfect_score";
    await supabase.from("rider_achievements").insert({
      rider_id: rider.id,
      badge_type: "perfect_score",
      badge_name: "Perfect Score 🌟",
      badge_description: "Completó un módulo con calificación perfecta"
    });
  }

  return {
    completed: true,
    assessment_passed: passed,
    certification_earned: passed && module.awards_certification,
    certification_number: certificationNumber,
    badge_earned: badgeEarned
  };
}

// Obtener recomendaciones de entrenamiento personalizadas
export async function obtenerRecomendacionesEntrenamiento(phone: string, limite: number = 3): Promise<
  Array<{
    module_id: string;
    module_name: string;
    recommendation_type: string;
    reason: string;
    priority: string;
  }>
> {
  const tel = phone.replace(/^57/, "");
  const { data: rider } = await supabase
    .from("riders")
    .select("id")
    .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
    .limit(1)
    .maybeSingle();

  if (!rider) return [];

  // Obtener recomendaciones pendientes
  const { data: recommendations } = await supabase
    .from("training_recommendations")
    .select("*, training_modules(id, name)")
    .eq("rider_id", rider.id)
    .eq("shown", false)
    .order("priority", { ascending: true })
    .order("urgency_score", { ascending: false })
    .limit(limite);

  return (recommendations ?? []).map((r) => ({
    module_id: r.module_id,
    module_name: (r.training_modules as any)?.name ?? "Unknown Module",
    recommendation_type: r.recommendation_type,
    reason: r.reason,
    priority: r.priority
  }));
}

// Registrar sesión de práctica (simulador)
export async function registrarSesionPractica(
  phone: string,
  skillFocus: string,
  score: number,
  durationSeconds: number
): Promise<{
  recorded: boolean;
  practice_id: string;
  performance_feedback: string;
}> {
  const tel = phone.replace(/^57/, "");
  const { data: rider } = await supabase
    .from("riders")
    .select("id")
    .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
    .limit(1)
    .maybeSingle();

  if (!rider) {
    return { recorded: false, practice_id: "", performance_feedback: "" };
  }

  // Generar feedback basado en puntuación
  let feedback = "";
  if (score >= 90) {
    feedback = "¡Excelente desempeño! Dominas esta habilidad.";
  } else if (score >= 75) {
    feedback = "Bien hecho. Un poco más de práctica te lo perfecciona.";
  } else if (score >= 60) {
    feedback = "Buen comienzo. Sigue practicando, vas por buen camino.";
  } else {
    feedback = "Necesitas más práctica. No desistas, cada sesión te mejora.";
  }

  // Registrar sesión
  const { data: session } = await supabase
    .from("practice_sessions")
    .insert({
      rider_id: rider.id,
      skill_focus: skillFocus,
      difficulty_level: score > 80 ? "advanced" : score > 60 ? "intermediate" : "beginner",
      duration_seconds: durationSeconds,
      score: score,
      metrics: { accuracy: score, consistency: score * 0.9, reaction_time: 250 },
      performance_feedback: feedback,
      completed: true,
      completed_at: new Date().toISOString()
    })
    .select("id")
    .single();

  return {
    recorded: true,
    practice_id: session?.id ?? "",
    performance_feedback: feedback
  };
}

// Obtener análisis de progreso
export async function obtenerAnalisisProgreso(phone: string): Promise<{
  total_modules_completed: number;
  certifications_earned: number;
  badges_earned: number;
  risk_improvement: number;
  recommended_next_module: string;
}> {
  const tel = phone.replace(/^57/, "");
  const { data: rider } = await supabase
    .from("riders")
    .select("id")
    .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
    .limit(1)
    .maybeSingle();

  if (!rider) {
    return {
      total_modules_completed: 0,
      certifications_earned: 0,
      badges_earned: 0,
      risk_improvement: 0,
      recommended_next_module: ""
    };
  }

  // Contar módulos completados
  const { data: completedModules } = await supabase
    .from("rider_training_progress")
    .select("id")
    .eq("rider_id", rider.id)
    .eq("status", "completed");

  // Contar certificaciones
  const { data: certifications } = await supabase
    .from("certification_history")
    .select("id")
    .eq("rider_id", rider.id)
    .eq("is_active", true);

  // Contar badges
  const { data: badges } = await supabase
    .from("rider_achievements")
    .select("id")
    .eq("rider_id", rider.id);

  // Obtener siguiente módulo recomendado
  const { data: analytics } = await supabase
    .from("progress_analytics")
    .select("next_recommended_modules")
    .eq("rider_id", rider.id)
    .order("period_start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextModule = analytics?.next_recommended_modules?.[0] ?? "";

  return {
    total_modules_completed: completedModules?.length ?? 0,
    certifications_earned: certifications?.length ?? 0,
    badges_earned: badges?.length ?? 0,
    risk_improvement: 15, // Simulado: 15% mejora típica después de módulos
    recommended_next_module: nextModule
  };
}

// Generar contexto para sistema prompt
export async function generarContextoEntrenamiento(phone: string): Promise<string> {
  const perfil = await obtenerPerfilHabilidades(phone);
  const recomendaciones = await obtenerRecomendacionesEntrenamiento(phone, 2);
  const analisis = await obtenerAnalisisProgreso(phone);

  let contexto = `\n🎓 RITA TRAINING & CERTIFICATION\n\n`;

  if (perfil) {
    contexto += `📊 Tu Perfil\n`;
    contexto += `Nivel: ${perfil.overall_level.toUpperCase()} (${Math.round(perfil.experience_score)}/100)\n`;
    contexto += `Riesgo: ${perfil.risk_profile.toUpperCase()}\n\n`;
  }

  contexto += `📈 Tu Progreso\n`;
  contexto += `Módulos completados: ${analisis.total_modules_completed}\n`;
  contexto += `Certificaciones: ${analisis.certifications_earned}\n`;
  contexto += `Logros desbloqueados: ${analisis.badges_earned}\n\n`;

  if (recomendaciones.length > 0) {
    contexto += `💡 Recomendado para ti\n`;
    recomendaciones.forEach((r) => {
      contexto += `• ${r.module_name} (${r.priority})\n`;
    });
  } else {
    contexto += `✅ Todos los módulos recomendados completados. ¡Sigue practicando!\n`;
  }

  return contexto;
}
