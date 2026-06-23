import "server-only";

import { AzureOpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/index";

import { SUPPORT_SYSTEM_PROMPT } from "./knowledge";

// Eigener, self-contained Azure-Client — bewusst NICHT der Checker-Client
// (src/lib/checker/azure-client.ts), damit das Support-Modul den produktiven
// Checker nicht anfasst. Gleiche Env-Vars, gleiches Deployment (gpt-4o-mini).
const API_VERSION = "2024-10-21";

export type SupportMessage = { role: "user" | "assistant"; content: string };

let client: AzureOpenAI | null = null;
let deployment: string | null = null;

function getClient(): { client: AzureOpenAI; deployment: string } {
  if (client && deployment) return { client, deployment };

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const dep = process.env.AZURE_OPENAI_DEPLOYMENT;

  if (!endpoint || !apiKey || !dep) {
    throw new Error(
      "Azure OpenAI nicht konfiguriert: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY und AZURE_OPENAI_DEPLOYMENT müssen gesetzt sein.",
    );
  }

  client = new AzureOpenAI({
    endpoint,
    apiKey,
    apiVersion: API_VERSION,
    deployment: dep,
  });
  deployment = dep;
  return { client, deployment };
}

/**
 * Eine FAQ-Antwort generieren. `history` ist der bisherige Dialog (vom Client
 * geschickt) — die Route validiert/begrenzt vorher Länge und Anzahl.
 */
export async function runSupportChat(
  history: SupportMessage[],
): Promise<string> {
  const { client: c, deployment: d } = getClient();

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SUPPORT_SYSTEM_PROMPT },
    ...history.map(
      (m): ChatCompletionMessageParam => ({
        role: m.role,
        content: m.content,
      }),
    ),
  ];

  const completion = await c.chat.completions.create({
    model: d,
    // Etwas Wärme für natürlichere FAQ-Antworten, aber nah am Wissen bleiben.
    temperature: 0.3,
    max_tokens: 600,
    messages,
  });

  const reply = completion.choices[0]?.message?.content;
  if (!reply || reply.trim().length === 0) {
    throw new Error("Azure-Antwort enthielt keinen Inhalt");
  }
  return reply.trim();
}
