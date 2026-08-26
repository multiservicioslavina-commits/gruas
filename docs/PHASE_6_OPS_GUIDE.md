# Phase 6: Smart Recommendations — Operations Guide

## Overview

Rita's Smart Recommendations engine generates personalized product suggestions for riders based on:
- **Maintenance** (predictive, km-based)
- **Seasonal** (climate, festivities)
- **Experience** (beginner/intermediate/expert levels)
- **Behavior** (riding patterns: braking, distance, speed)
- **Companion** (cross-sell: related products)

**Revenue Model**: 7% base marketplace commission + 3% bonus if recommendation converts = **10% per transaction**.

---

## Tools Reference

### User Tools (Rider-Facing)

#### `obtener_recomendaciones`
Returns up to 3 personalized recommendations ranked by relevance.

**Usage**: Rita calls this when a rider asks "Qué me recomiendas?", "Tienes algo para mi moto?"

**Response Format**:
```
💡 RECOMENDACIONES PARA TI (3)

1. 🛢️ Cambio de aceite (mantenimiento)
   Tu CB500X lleva 8,500km. Toca aceite de motor.
   Honda 10W-40 5L - $45,000 | [Comprar]

2. 🌧️ Protección lluvia (estación)
   Vemos lluvia en Medellín. Cubre para tu moto.
   Cobertor impermeable - $35,000 | [Comprar]

3. 🧤 Guantes premium (experiencia)
   Vemos que tienes 2 años rodando. Upgrade de seguridad.
   Guantes de piel resistencia - $60,000 | [Comprar]
```

#### `registrar_compra_recomendacion`
**CRITICAL**: Rita calls this EVERY TIME a rider purchases something recommended.

**Input**:
- `recommendation_id`: UUID of the recommendation
- `amount`: Transaction amount in COP
- `source`: "direct_link" (default), "search", or "other"

**Example**:
```
Rita: Voy a registrar tu compra en mis records para poder ofrecerte mejores recomendaciones.
[registrar_compra_recomendacion: rec_123, 45000, direct_link]
```

**Commission Calculation**:
- Base: 7% of amount
- Bonus: +3% if source="direct_link"
- Total: 10% of $45,000 = $4,500 commission

#### `obtener_historial_recomendaciones`
Rider views their last 10 recommendations with status (shown/clicked/purchased) and commission earned.

#### `crear_regla_recomendacion` (Admin Only)
Create new recommendation rules without code changes.

**Example**:
```
Nombre: "Cambio de aceite a 8000km CB500"
Tipo: "maintenance"
Condicion: {"km_threshold": 8000, "bike_pattern": "CB500*"}
Productos: "Aceite 10W-40, Filtro de aceite"
Prioridad: 1
```

---

### Admin Tools (Ops Dashboard)

#### `obtener_metricas_recomendaciones`
Get performance metrics for all recommendations.

**Output Example**:
```
📊 MÉTRICAS DE RECOMENDACIONES (últimos 30 días)

📈 Generales
• Generadas: 1,247
• Mostradas: 923
• Clickeadas: 287
• Compradas: 45

🎯 Conversión
• CTR: 31.1%
• Conversion Rate: 15.7%
• Ingresos totales: $2,025,000

📋 Por Tipo
• maintenance: 456 mostradas, 32 compradas, $1,440,000
• seasonal: 267 mostradas, 8 compradas, $280,000
• behavior: 145 mostradas, 3 compradas, $105,000
• companion: 55 mostradas, 2 compradas, $200,000
```

#### `obtener_recomendaciones_admin`
View all recommendations with filters by rider, type, or status.

**Filters**:
- `rider_id`: Filter by specific rider
- `tipo`: maintenance | seasonal | experience | behavior | companion
- `estado`: pending | purchased | ignored

**Output**: Last 20 matching recommendations with status, price, commission.

#### `marcar_recomendacion_mostrada`
Manually mark a recommendation as shown (used for impression tracking).

---

## Monitoring Dashboard

### Key Performance Indicators (KPIs)

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| **CTR** (Click-Through Rate) | >25% | <20% | <15% |
| **Conversion Rate** | >10% | <8% | <5% |
| **Monthly Revenue** | >$60k | <$40k | <$20k |
| **Recommendations/Month** | >500 | <300 | <100 |
| **Avg Days to Purchase** | <7 days | >10 days | >15 days |

### Daily Monitoring Checklist

**Each morning** (use `obtener_metricas_recomendaciones dias_atras=1`):

- [ ] Yesterday's CTR — Is it trending up or down?
- [ ] Recommendations generated — Enough volume?
- [ ] Conversion rate — Are riders actually buying?
- [ ] Revenue — On track for monthly target?
- [ ] Errors — Any failed recommendations in logs?

**Weekly Review** (every Monday):

- [ ] Run metrics for last 7 days
- [ ] Compare to previous week (trend analysis)
- [ ] Check which types perform best (maintenance always wins)
- [ ] Review low-performing recommendation types
- [ ] Adjust seasonal recommendations if weather changes

**Monthly Audit** (end of month):

- [ ] Full 30-day metrics review
- [ ] Segment analysis: maintenance vs seasonal vs behavior
- [ ] Top-performing recommendation reasons
- [ ] Lowest-performing rules (consider disabling)
- [ ] Budget vs actual revenue
- [ ] Plan next month's seasonal recommendations

---

## A/B Testing Setup

### Test 1: Presentation Timing

**Hypothesis**: Showing recommendations right after km update (when maintenance top-of-mind) converts better.

**Control**: Random timing (current)
**Variant**: Always show after km update
**Duration**: 2 weeks
**Success Metric**: +10% CTR

**How to test**:
1. Tag recommendations with `timing_variant` in `reason_data`
2. Record when shown relative to km update
3. Compare CTR by variant in metrics

### Test 2: Recommendation Count

**Hypothesis**: 3 recommendations is too many. 2 best picks convert better.

**Control**: 3 recommendations (current)
**Variant**: 2 best picks only
**Duration**: 2 weeks
**Success Metric**: +5% conversion rate

**Implementation**:
- Set `limite: 2` in `obtener_recomendacionesPendientes` for variant users
- Tag results with `count_variant: 2` in reason_data

### Test 3: Companion Product Placement

**Hypothesis**: Companion recommendations between maintenance/seasonal convert better if shown immediately after purchase.

**Control**: Show after 24 hours
**Variant**: Show immediately (same message)
**Duration**: 1 week
**Success Metric**: +20% CTR on companion

---

## Troubleshooting

### Problem: Low CTR (<20%)

**Diagnosis**:
1. Are recommendations relevant? Check `reason` field for clarity
2. Run: `obtener_recomendaciones_admin estado=pending`
3. Sample 10 pending — do they make sense for those riders?

**Solutions**:
- Review maintenance intervals (may be too aggressive)
- Check seasonal rules — are they weather-appropriate?
- Disable low-performing rule types temporarily

### Problem: High CTR but Low Conversion (<5%)

**Diagnosis**:
1. Riders like the suggestions but not buying
2. Likely price mismatch or marketplace issue

**Solutions**:
- Review `estimated_price` accuracy
- Check if products actually available on marketplace
- Test price range adjustments (-10%, -20%)

### Problem: No Recommendations Generated

**Diagnosis**:
1. Check if riders have sessions (need km data)
2. Verify seasonal/behavior generators ran
3. Check Supabase logs for errors

**Solutions**:
1. Ensure `calcularProximoMantenimiento` is called
2. Verify `rider_sessions` table has recent data
3. Check `recommendation_rules` table — any rules active?

---

## Database Maintenance

### Daily Cleanup

No action needed — recommendations auto-expire via `valid_until` column.

### Weekly Health Check

```sql
-- Check for stale recommendations
SELECT COUNT(*) as stale 
FROM rider_product_recommendations 
WHERE valid_until < NOW();
-- Should be growing steadily, not stuck at 0

-- Check conversion rate by type
SELECT recommendation_type, 
  COUNT(*) as total, 
  COUNT(*) FILTER (WHERE purchased) as purchased,
  (COUNT(*) FILTER (WHERE purchased)::float / COUNT(*) * 100)::int as conversion_pct
FROM rider_product_recommendations
WHERE recommended_at > NOW() - '30 days'::interval
GROUP BY recommendation_type
ORDER BY conversion_pct DESC;
```

### Monthly Optimization

```sql
-- Archive old purchased recommendations (optional)
DELETE FROM rider_product_recommendations 
WHERE purchased = true 
  AND purchased_at < NOW() - '90 days'::interval;

-- Refresh rider preference stats
UPDATE rider_shopping_profile
SET avg_purchase_value = (
  SELECT AVG(purchased_amount) 
  FROM rider_product_recommendations 
  WHERE rider_id = rider_shopping_profile.rider_id 
    AND purchased = true
)
WHERE id IS NOT NULL;
```

---

## Escalation Contacts

| Issue | Contact | Slack |
|-------|---------|-------|
| Low CTR/Conversion | Data team | #analytics |
| Marketplace integration | Ecommerce team | #marketplace |
| Database/performance | DevOps | #infrastructure |
| Recommendation logic | AI/ML team | #rita-dev |
| Rider feedback | Customer success | #customer-success |

---

## Launch Checklist (Week 3)

- [ ] All 5 tools tested end-to-end
- [ ] Metrics dashboard operational
- [ ] Admin can view recommendations and rules
- [ ] Ops team trained on tools
- [ ] A/B testing framework ready
- [ ] Monitoring alerts configured
- [ ] Escalation procedures documented
- [ ] First week of recommendations monitored
- [ ] Initial performance baseline established

---

## Notes for Ops

1. **Always verify commission math**: 10% = 7% base + 3% if direct_link
2. **Don't force recommendations**: Rita never pushes unsolicited. Riders must ask.
3. **Track everything**: Every `registrar_compra_recomendacion` is revenue we don't lose
4. **Seasonal rules need weather**: Update when SIATA integration goes live
5. **A/B tests need isolation**: Tag all test variants clearly in `reason_data`

**Questions?** → rita-dev Slack channel or email devops@ridera.com.co
