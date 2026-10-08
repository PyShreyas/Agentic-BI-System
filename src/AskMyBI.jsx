import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

const QUICK_PROMPTS = [
  "What should I work on today?",
  "What is currently blocked?",
  "Give me a summary of my BI workload.",
  "Generate my stand-up update."
];

function dateKey(d = new Date()) {
  const value = d?.toDate ? d.toDate() : new Date(d);
  if (Number.isNaN(value.getTime())) return "";
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
}

function buildFallback(prompt, reports, tasks) {
  const today = dateKey();
  const active = tasks.filter(t => t.status !== "done");
  const todayTasks = active.filter(t => t.dueDate === today || dateKey(t.createdAt) === today);
  const blocked = active.filter(t => t.status === "blocked");
  const overdue = active.filter(t => t.dueDate && t.dueDate < today);
  const high = active.filter(t => ["critical", "high"].includes(t.priority));
  const deployed = reports.filter(r => r.status === "deployed_live");

  const q = prompt.toLowerCase();
  if (q.includes("today") || q.includes("work on")) {
    if (!todayTasks.length) return "You have no active tasks planned for today. I recommend reviewing the backlog and selecting one high-priority BI task.";
    return `Today's active work: ${todayTasks.map(t => t.title).join(", ")}. Start with ${high.find(t => todayTasks.some(x => x.id === t.id))?.title || todayTasks[0].title}.`;
  }
  if (q.includes("blocked")) {
    return blocked.length ? `Currently blocked: ${blocked.map(t => t.title).join(", ")}.` : "No tasks are currently marked as blocked.";
  }
  if (q.includes("stand-up") || q.includes("standup")) {
    return `Stand-up draft:\n\nCompleted: Review your completed tasks in My Day.\n\nIn Progress: ${active.filter(t => t.status === "in_progress").map(t => t.title).join(", ") || "No tasks currently marked In Progress."}\n\nBlocked: ${blocked.map(t => t.title).join(", ") || "None."}\n\nToday: ${todayTasks.map(t => t.title).join(", ") || "Plan the next priority task."}`;
  }
  if (q.includes("workload") || q.includes("summary")) {
    return `BI workload snapshot: ${reports.length} reports tracked, ${active.length} active tasks, ${blocked.length} blocked, ${overdue.length} overdue, and ${deployed.length} reports deployed live.`;
  }
  return "I can help with your BI workload, tasks, reports, blockers, SQL/DAX planning, QA, and documentation. Ask me a specific question or use one of the quick prompts.";
}

export default function AskMyBI({ C, S, reports = [], currentUser }) {
  const [tasks, setTasks] = useState([]);
  const [messages, setMessages] = useState([
    { role: "assistant", text: `Hi ${currentUser || "Shreyas"} — I'm your BI Analyst Assistant. I can use your current report and task context to help you plan work, investigate issues, and prepare BI outputs.` }
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => onSnapshot(collection(db, "tasks"), s => setTasks(s.docs.map(d => ({ id: d.id, ...d.data() })))), []);

  const context = useMemo(() => ({
    user: currentUser,
    reports: reports.map(r => ({
      id: r.id, name: r.name, clientName: r.clientName, module: r.module,
      status: r.status, priority: r.priority, owner: r.owner,
      remarks: (r.remarks || []).filter(x => !x.resolved).map(x => ({ text: x.text, category: x.category }))
    })),
    tasks: tasks.map(t => ({
      id: t.id, title: t.title, category: t.category || "general",
      status: t.status, priority: t.priority, dueDate: t.dueDate || "",
      reportId: t.reportId || "", estimatedHours: t.estimatedHours || ""
    }))
  }), [currentUser, reports, tasks]);

  const send = async (forcedText) => {
    const text = (forcedText ?? input).trim();
    if (!text || sending) return;
    setInput("");
    setMessages(m => [...m, { role: "user", text }]);
    setSending(true);
    try {
      const response = await fetch("/api/ask-bi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, context })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI request failed");
      setMessages(m => [...m, { role: "assistant", text: data.content || "I could not generate a response." }]);
    } catch (error) {
      const fallback = buildFallback(text, reports, tasks);
      setMessages(m => [...m, { role: "assistant", text: fallback + "\n\nAI backend note: " + (error.message || "API unavailable") }]);
    } finally {
      setSending(false);
    }
  };

  return <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1100, margin: "0 auto", width: "100%" }}>
    <div style={{ ...S.card, background: `linear-gradient(135deg,${C.accent} 0%,#0B5FFF 100%)`, border: "none", color: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, opacity: .72, textTransform: "uppercase", letterSpacing: ".08em" }}>Agentic BI Foundation</div>
          <h2 style={{ margin: "5px 0 3px", fontSize: 25 }}>Ask My BI</h2>
          <div style={{ fontSize: 13, opacity: .82 }}>Your first AI layer for tasks, reports, blockers and analyst workflows.</div>
        </div>
        <div style={{ padding: "7px 10px", borderRadius: 20, background: "#ffffff18", border: "1px solid #ffffff35", fontSize: 11, fontWeight: 700 }}>BI ORCHESTRATOR · V1</div>
      </div>
    </div>

    <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
      {QUICK_PROMPTS.map(p => <button key={p} onClick={() => send(p)} disabled={sending} style={{ ...S.btn(), fontSize: 11 }}>{p}</button>)}
    </div>

    <div style={{ ...S.card, minHeight: 500, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, color: C.text }}>BI Analyst Assistant</h3>
          <p style={{ margin: "3px 0 0", fontSize: 11, color: C.textMuted }}>Context: {reports.length} reports · {tasks.length} tasks</p>
        </div>
        <span style={{ fontSize: 10, color: "#16A34A", fontWeight: 700 }}>● READY</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: "16px 2px" }}>
        {messages.map((m, i) => <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "82%", padding: "11px 13px", borderRadius: 11, background: m.role === "user" ? C.accent : C.bg, color: m.role === "user" ? "#fff" : C.text, border: m.role === "user" ? "none" : `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
          {m.text}
        </div>)}
        {sending && <div style={{ alignSelf: "flex-start", color: C.textMuted, fontSize: 12 }}>Thinking…</div>}
      </div>

      <div style={{ display: "flex", gap: 8, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} disabled={sending} style={{ ...S.input, flex: 1 }} placeholder="Ask about your reports, tasks, blockers, SQL, DAX or today's priorities…" />
        <button onClick={() => send()} disabled={sending || !input.trim()} style={S.btn("primary")}>{sending ? "..." : "Ask"}</button>
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10 }}>
      {[
        ["🧠 Orchestrator", "Understands your request and routes future work to specialist agents."],
        ["🗄 SQL Agent", "Next: source investigation, joins, grain and data-quality checks."],
        ["📊 Power BI Agent", "Next: DAX, model relationships, visuals and report logic."],
        ["🧪 QA Agent", "Next: validation, anomaly checks and release readiness."]
      ].map(([title, desc]) => <div key={title} style={{ ...S.card, padding: 13 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{title}</div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4, lineHeight: 1.5 }}>{desc}</div>
      </div>)}
    </div>
  </div>;
}
