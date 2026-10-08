const TOOL_DEFINITIONS = [
  {
    type: "function",
    name: "getMyDay",
    description: "Read the user's current BI task workload, including today's tasks, overdue tasks and blockers.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true
  },
  {
    type: "function",
    name: "searchReports",
    description: "Search the current report tracker by report name, client, module or status.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Search phrase." } },
      required: ["query"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "getReport",
    description: "Get one current report by its id.",
    parameters: {
      type: "object",
      properties: { reportId: { type: "string" } },
      required: ["reportId"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "getBlockers",
    description: "Read tasks currently marked as blocked.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true
  },
  {
    type: "function",
    name: "createTask",
    description: "Prepare a new BI task. This is a write action and ALWAYS requires user approval before Firestore execution.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        category: { type: "string", enum: ["development","dax","sql","testing","uat","documentation","meeting","support","learning","general"] },
        priority: { type: "string", enum: ["critical","high","medium","low"] },
        dueDate: { type: "string", description: "YYYY-MM-DD or empty string." },
        reportId: { type: "string", description: "Linked report id or empty string." },
        estimatedHours: { type: "string", description: "Estimated hours or empty string." }
      },
      required: ["title","category","priority","dueDate","reportId","estimatedHours"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "updateTask",
    description: "Prepare an update to an existing BI task. This is a write action and ALWAYS requires user approval before Firestore execution.",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        status: { type: "string", enum: ["todo","in_progress","blocked","done"] },
        priority: { type: "string", enum: ["critical","high","medium","low"] },
        dueDate: { type: "string", description: "YYYY-MM-DD or empty string." }
      },
      required: ["taskId","status","priority","dueDate"],
      additionalProperties: false
    },
    strict: true
  }
];

function todayKey() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

function runTool(name, args, context) {
  const reports = context.reports || [];
  const tasks = context.tasks || [];

  if (name === "getMyDay") {
    const today = todayKey();
    const active = tasks.filter(t => t.status !== "done");
    return {
      today,
      todayTasks: active.filter(t => t.dueDate === today || (t.createdDate || "").slice(0, 10) === today),
      overdueTasks: active.filter(t => t.dueDate && t.dueDate < today),
      blockedTasks: active.filter(t => t.status === "blocked"),
      highPriority: active.filter(t => ["critical", "high"].includes(t.priority))
    };
  }

  if (name === "getBlockers") {
    return { blockers: tasks.filter(t => t.status === "blocked") };
  }

  if (name === "searchReports") {
    const q = String(args.query || "").toLowerCase();
    return {
      reports: reports.filter(r =>
        [r.id, r.name, r.clientName, r.module, r.status, r.priority, r.owner]
          .filter(Boolean).some(v => String(v).toLowerCase().includes(q))
      ).slice(0, 25)
    };
  }

  if (name === "getReport") {
    return { report: reports.find(r => r.id === args.reportId) || null };
  }

  if (name === "createTask" || name === "updateTask") {
    return {
      approvalRequired: true,
      action: { type: name, arguments: args },
      message: "This write action is prepared but not executed. The user must explicitly approve it in the application."
    };
  }

  return { error: "Unknown tool." };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(503).json({ error: "AI backend is not configured yet." });

  try {
    const body = req.body || {};
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return res.status(400).json({ error: "message is required." });

    const context = body.context || {};
    const safeContext = {
      user: context.user || "Shreyas",
      reports: (context.reports || []).slice(0, 100),
      tasks: (context.tasks || []).slice(0, 200)
    };

    const instructions = `You are the BI Orchestrator for Shreyas's personal BI Analyst Operating System.
Use tools whenever the user asks about current tasks, blockers or reports.
Application context is ground truth. Never invent current data.
For SQL/DAX, provide practical drafts and state assumptions.
For write actions such as createTask or updateTask, prepare the action but NEVER claim it was executed. The application will require explicit user approval.
Keep responses concise and useful.
Current application context:
${JSON.stringify(safeContext)}`;

    let input = [{ role: "user", content: message }];
    let pendingAction = null;
    let finalResponse = null;

    for (let turn = 0; turn < 4; turn += 1) {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key}`
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-6-luna",
          instructions,
          input,
          tools: TOOL_DEFINITIONS,
          tool_choice: "auto",
          max_output_tokens: 900
        })
      });

      const data = await response.json();
      if (!response.ok) {
        return res.status(response.status).json({ error: data?.error?.message || "AI request failed." });
      }

      const calls = (data.output || []).filter(item => item.type === "function_call");
      if (!calls.length) {
        finalResponse = data.output_text || "No response text returned.";
        break;
      }

      input = [...input, ...(data.output || [])];

      for (const call of calls) {
        let args = {};
        try { args = JSON.parse(call.arguments || "{}"); } catch { args = {}; }
        const result = runTool(call.name, args, safeContext);

        if (result.approvalRequired) pendingAction = result.action;

        input.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(result)
        });
      }
    }

    return res.status(200).json({ content: finalResponse || "I prepared the requested action.", pendingAction });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
