import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import { ClientSecretCredential } from '@azure/identity';

// Acquire and cache AAD token for Fabric Data Agent
const tenantId = process.env.TENANT_ID;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const dataAgentUrl = process.env.DATA_AGENT_URL; // e.g. https://<agent>.fabric.microsoft.com/aiassistant/openai

if (!tenantId || !clientId || !clientSecret || !dataAgentUrl) {
  throw new Error('Fabric Data Agent env vars missing: TENANT_ID, CLIENT_ID, CLIENT_SECRET, DATA_AGENT_URL');
}

const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
let cachedToken = null;

async function getBearerToken() {
  const needsRefresh =
    !cachedToken ||
    cachedToken.expiresOnTimestamp - Date.now() < 5 * 60 * 1000; // refresh 5 min early

  if (needsRefresh) {
    cachedToken = await credential.getToken('https://api.fabric.microsoft.com/.default');
  }
  return cachedToken.token;
}

export async function askDataAgent(question, language = 'en') {
  if (!question || !question.trim()) {
    throw new Error('Question is required');
  }

  const token = await getBearerToken();

  const client = new OpenAI({
    apiKey: 'unused',
    baseURL: dataAgentUrl,
    defaultQuery: { 'api-version': '2024-05-01-preview' },
    defaultHeaders: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ActivityId: randomUUID()
    }
  });

  // Fabric ignores model/instructions; assistant is placeholder
  const assistant = await client.beta.assistants.create({ model: 'not used' });
  const thread = await client.beta.threads.create();

  await client.beta.threads.messages.create({
    thread_id: thread.id,
    role: 'user',
    content: question
  });

  let run = await client.beta.threads.runs.create({
    thread_id: thread.id,
    assistant_id: assistant.id
  });

  while (run.status === 'queued' || run.status === 'in_progress') {
    await new Promise((r) => setTimeout(r, 1500));
    run = await client.beta.threads.runs.retrieve({
      thread_id: thread.id,
      run_id: run.id
    });
  }

  const messages = await client.beta.threads.messages.list({
    thread_id: thread.id,
    order: 'asc'
  });

  const reply =
    messages.data.find((m) => m.role === 'assistant')?.content?.[0]?.text?.value ||
    'No response from data agent.';

  // Best-effort cleanup
  client.beta.threads.delete({ thread_id: thread.id }).catch(() => {});

  return reply;
}
