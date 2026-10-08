export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(503).json({ error: "AI backend is not configured yet." });

  try {
    const body = req.body || {};
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return res.status(400).json({ error: "message is required." });

    const context = body.context || {};
    const system = `You are the BI Orchestrator for Shreyas's personal BI Analyst Operating System.
Use application context as ground truth. Never invent current report or task data.
For SQL/DAX, provide practical drafts and state assumptions.
For consequential actions, propose the action and request approval rather than claiming it was executed.
Be concise and structured. Identify a future specialist agent when useful.
Application context:
${JSON.stringify({ user: context.user || "Shreyas", reports: (context.reports || []).slice(0, 100), tasks: (context.tasks || []).slice(0, 200) })}`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-6-luna",
        instructions: system,
        input: message,
        max_output_tokens: 900
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || "AI request failed." });
    return res.status(200).json({ content: data.output_text || "No response text returned." });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
