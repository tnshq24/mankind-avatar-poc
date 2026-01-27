// Calls the Python Fabric Data Agent bridge (Flask) instead of hitting Fabric directly.
// Expects the Python service to run locally at DATA_AGENT_PY_URL (default http://localhost:5050/ask).

const PY_URL = process.env.DATA_AGENT_PY_URL || 'http://localhost:5050/ask';

export async function askDataAgentViaPython(question, language = 'en') {
  const body = { question, language };

  const resp = await fetch(PY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Python bridge error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  if (data.error) throw new Error(data.error);

  return data.response;
}
