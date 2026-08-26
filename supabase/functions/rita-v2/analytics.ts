import { supabase } from "./tools.ts";

export async function obtenerMetricasDelDia(phone: string): Promise<{ kmTotal: number; ridesCount: number; riskScore: number; topCity: string }> {
  const { data: rider } = await supabase.from("riders").select("id").eq("telefono", phone.replace(/^57/, "")).maybeSingle();
  if (!rider) return { kmTotal: 0, ridesCount: 0, riskScore: 0, topCity: "" };

  const today = new Date().toISOString().split('T')[0];
  const { data: metrics } = await supabase.from("daily_rider_metrics").select("total_km, total_rides, daily_risk_score, top_city").eq("rider_id", rider.id).eq("metric_date", today).maybeSingle();

  return {
    kmTotal: metrics?.total_km || 0,
    ridesCount: metrics?.total_rides || 0,
    riskScore: metrics?.daily_risk_score || 0,
    topCity: metrics?.top_city || "",
  };
}

export async function obtenerTendenciasRiesgo(phone: string, dias: number = 30): Promise<{ trend: string; riskHistory: number[]; predictedRisk: number }> {
  const { data: rider } = await supabase.from("riders").select("id").eq("telefono", phone.replace(/^57/, "")).maybeSingle();
  if (!rider) return { trend: "stable", riskHistory: [], predictedRisk: 0 };

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - dias);
  const startDateStr = startDate.toISOString().split('T')[0];

  const { data: metrics } = await supabase.from("daily_rider_metrics").select("daily_risk_score, metric_date").eq("rider_id", rider.id).gte("metric_date", startDateStr).order("metric_date");

  if (!metrics || metrics.length === 0) return { trend: "stable", riskHistory: [], predictedRisk: 0 };

  const riskHistory = metrics.map(m => m.daily_risk_score || 0);
  const avgRisk = riskHistory.reduce((a, b) => a + b, 0) / riskHistory.length;
  const recentAvg = riskHistory.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, riskHistory.length);

  let trend = "stable";
  if (recentAvg > avgRisk * 1.1) trend = "worsening";
  else if (recentAvg < avgRisk * 0.9) trend = "improving";

  const { data: predictions } = await supabase.from("risk_predictions").select("predicted_risk_level").eq("rider_id", rider.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const riskMap: Record<string, number> = { low: 25, moderate: 50, high: 75, critical: 100 };
  const predictedRisk = riskMap[predictions?.predicted_risk_level as string] || 0;

  return { trend, riskHistory, predictedRisk };
}

export async function obtenerAnomaliasBehavior(phone: string): Promise<{ anomalies: Array<{ type: string; severity: string; description: string }> }> {
  const { data: rider } = await supabase.from("riders").select("id").eq("telefono", phone.replace(/^57/, "")).maybeSingle();
  if (!rider) return { anomalies: [] };

  const { data: anomalies } = await supabase.from("behavior_anomalies").select("anomaly_type, severity, description, confidence_level").eq("rider_id", rider.id).eq("rider_acknowledged", false).order("confidence_level", { ascending: false }).limit(5);

  return {
    anomalies: (anomalies || []).map(a => ({
      type: a.anomaly_type,
      severity: a.severity,
      description: a.description,
    })),
  };
}

export async function obtenerRutasPopulares(limite: number = 5): Promise<Array<{ routeName: string; riders: number; riskScore: number; popularity: number }>> {
  const today = new Date().toISOString().split('T')[0];
  const { data: routes } = await supabase.from("route_analytics").select("route_name, unique_riders, avg_risk_score, popularity_score").eq("analytics_date", today).order("popularity_score", { ascending: false }).limit(limite);

  return (routes || []).map(r => ({
    routeName: r.route_name,
    riders: r.unique_riders,
    riskScore: r.avg_risk_score || 0,
    popularity: r.popularity_score || 0,
  }));
}

export async function obtenerInsights(phone: string, limite: number = 3): Promise<Array<{ title: string; description: string; priority: number }>> {
  const { data: rider } = await supabase.from("riders").select("id").eq("telefono", phone.replace(/^57/, "")).maybeSingle();
  if (!rider) return [];

  const { data: insights } = await supabase.from("rider_insights").select("insight_title, insight_description, priority").eq("rider_id", rider.id).order("priority").order("created_at", { ascending: false }).limit(limite);

  return (insights || []).map(i => ({
    title: i.insight_title || "",
    description: i.insight_description || "",
    priority: i.priority,
  }));
}

export async function obtenerBenchmarksComunitarios(benchmarkType: string = "safety"): Promise<{ median: number; yourPercentile: number; avgCommunity: number; trend: string }> {
  const { data: benchmarks } = await supabase.from("community_benchmarks").select("percentile_50, mean_value, trend_direction").eq("benchmark_type", benchmarkType).order("benchmark_date", { ascending: false }).limit(1).maybeSingle();

  if (!benchmarks) return { median: 0, yourPercentile: 0, avgCommunity: 0, trend: "stable" };

  return {
    median: benchmarks.percentile_50 || 0,
    yourPercentile: 0, // Será calculado dinámicamente por la app
    avgCommunity: benchmarks.mean_value || 0,
    trend: benchmarks.trend_direction || "stable",
  };
}

export async function registrarEventoAnalitca(phone: string, eventType: string, eventData: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
  const { data: rider } = await supabase.from("riders").select("id").eq("telefono", phone.replace(/^57/, "")).maybeSingle();
  if (!rider) return { ok: false, message: "Rider not found" };

  const { error } = await supabase.from("analytics_events").insert({
    rider_id: rider.id,
    event_type: eventType,
    event_properties: eventData,
    timestamp_ms: Date.now(),
  });

  if (error) {
    console.error("Error registrarEventoAnalitca:", error);
    return { ok: false, message: "Failed to register event" };
  }

  return { ok: true, message: "Event recorded" };
}

export async function obtenerDashboardGlobal(): Promise<{ activeRiders: number; avgRiskScore: number; uptime: number; incidentsToday: number }> {
  const today = new Date().toISOString().split('T')[0];
  const { data: dashboard } = await supabase.from("system_dashboard_metrics").select("total_active_riders, avg_risk_score, api_uptime_percent, incident_count").eq("metric_date", today).maybeSingle();

  return {
    activeRiders: dashboard?.total_active_riders || 0,
    avgRiskScore: dashboard?.avg_risk_score || 0,
    uptime: dashboard?.api_uptime_percent || 0,
    incidentsToday: dashboard?.incident_count || 0,
  };
}

export async function generarContextoAnalytics(phone: string): Promise<string> {
  const { data: rider } = await supabase.from("riders").select("id").eq("telefono", phone.replace(/^57/, "")).maybeSingle();
  if (!rider) return "";

  const metricas = await obtenerMetricasDelDia(phone);
  const tendencias = await obtenerTendenciasRiesgo(phone, 30);
  const anomalias = await obtenerAnomaliasBehavior(phone);

  if (metricas.kmTotal === 0 && anomalias.anomalies.length === 0) {
    return "📊 ANALÍTICA: Sin datos de conducción hoy.\n";
  }

  let bloque = `📊 ANALÍTICA HOY:\n`;
  if (metricas.kmTotal > 0) {
    bloque += `- Kilómetros: ${metricas.kmTotal} km\n`;
    bloque += `- Viajes: ${metricas.ridesCount}\n`;
    bloque += `- Riesgo: ${metricas.riskScore}% (${tendencias.trend})\n`;
  }

  if (anomalias.anomalies.length > 0) {
    bloque += `- ⚠️ Anomalías detectadas: ${anomalias.anomalies[0].type}\n`;
  }

  bloque += `\n`;
  return bloque;
}
