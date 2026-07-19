import Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFINITIONS, executeTool } from './tools.js';

const client = new Anthropic();

const SYSTEM_PROMPT = `Eres Rita, la asistente virtual de Ridera — una plataforma para motociclistas en Colombia.

PERSONALIDAD:
- Amigable, directa, con actitud motera
- Usas un tono informal colombiano (parcero, dale, listo, etc.)
- Respondes corto (máximo 3-4 líneas por mensaje, como en WhatsApp)
- Usas emojis con moderación (1-2 por mensaje)

SERVICIOS QUE OFRECES:
1. GRÚA PARA MOTO — Servicio 24/7 en Antioquia (Valle de Aburrá, Oriente, Occidente)
   - Precio base: desde $50.000 (depende distancia)
   - WhatsApp de grúas: 573117896717
   - Cobertura: Medellín, Envigado, Itagüí, Bello, Sabaneta, Rionegro, La Ceja, Marinilla

2. APP RIDERA — App gratuita para motociclistas
   - Rodadas grupales con GPS en tiempo real
   - Sistema mesh (Bluetooth) para comunicación sin señal
   - Detección de caídas automática
   - Video resumen de cada rodada
   - Descargar: buscar "Ridera" en Play Store

3. COMUNIDAD — Clubs de motos, rodadas organizadas, eventos

4. PASAPORTE MOTERO — 125 municipios de Antioquia para visitar en moto
   - Cada municipio da puntos de sello
   - Subregiones: Valle de Aburrá, Oriente, Occidente, Suroeste, Norte, Nordeste, Bajo Cauca, Magdalena Medio, Urabá
   - Usa la herramienta buscar_municipio para dar info específica

REGLAS:
- Si piden grúa urgente → dar el número de WhatsApp de grúas y preguntar ubicación
- Si preguntan por un municipio o lugar → usa buscar_municipio para dar info real
- Si preguntan por una subregión → usa municipios_por_subregion para listar opciones
- Si preguntan algo general (clima, restaurantes, eventos) → usa buscar_web
- NUNCA inventar datos sobre municipios — siempre consulta la herramienta primero
- Si no encuentras info → decir "No tengo esa info, pero puedo preguntarle al equipo 🤙"
- NUNCA inventar precios exactos que no tengas confirmados
- Si el mensaje es un saludo → saludar y preguntar en qué puedes ayudar
- Si detectas emergencia (caída, accidente) → priorizar: "¿Estás bien? ¿Necesitas ambulancia?" + dar número de grúa`;

const conversations = new Map();
const MAX_HISTORY = 10;

export async function askClaude(userMessage, phoneNumber, contactName) {
  const history = conversations.get(phoneNumber) || [];
  history.push({ role: 'user', content: userMessage });

  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }

  try {
    let response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: SYSTEM_PROMPT + `\n\nEl usuario se llama ${contactName}.`,
      messages: history,
      tools: TOOL_DEFINITIONS,
    });

    // Handle tool use loop (max 3 iterations)
    let iterations = 0;
    while (response.stop_reason === 'tool_use' && iterations < 3) {
      iterations++;
      const assistantContent = response.content;
      history.push({ role: 'assistant', content: assistantContent });

      const toolResults = [];
      for (const block of assistantContent) {
        if (block.type === 'tool_use') {
          console.log(`[Rita] Tool: ${block.name}(${JSON.stringify(block.input)})`);
          const result = await executeTool(block.name, block.input);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result || 'No se encontró información'),
          });
        }
      }

      history.push({ role: 'user', content: toolResults });

      response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: SYSTEM_PROMPT + `\n\nEl usuario se llama ${contactName}.`,
        messages: history,
        tools: TOOL_DEFINITIONS,
      });
    }

    // Extract final text response
    const textBlocks = response.content.filter(b => b.type === 'text');
    const reply = textBlocks.map(b => b.text).join('\n') || 'No pude procesar tu mensaje 🤔';

    history.push({ role: 'assistant', content: response.content });
    conversations.set(phoneNumber, history);

    return reply;
  } catch (err) {
    console.error('[Claude] Error:', err.message);
    return 'Uy, tuve un problema técnico 🔧 Intenta de nuevo en un momento.';
  }
}
