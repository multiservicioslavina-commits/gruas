// lib/claude.js
const { getTierConfig } = require("./tiers");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

async function askClaude(systemPrompt, conversationHistory, options) {
  const opts = options || {};
  const tier = getTierConfig();

  const systemBlocks = [
    {
      type: "text",
      text: systemPrompt,
      cache_control: { type: "ephemeral" },
    },
  ];

  // El nombre va en un bloque APARTE, sin cache_control, para no invalidar
  // el cache del prompt principal (que es igual para todos los usuarios).
  if (opts.userName) {
    systemBlocks.push({
      type: "text",
      text: `Este usuario se llama ${opts.userName}. Salúdalo o refiérete a él usando ese nombre de forma natural, sin repetirlo en cada frase.`,
    });
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model || tier.model,
      max_tokens: opts.maxTokens || tier.maxTokens,
      system: systemBlocks,
      messages: conversationHistory,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API falló (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const textBlock = data.content?.find((b) => b.type === "text");
  return textBlock?.text || "Perdón, no pude generar una respuesta en este momento.";
}

module.exports = { askClaude };
