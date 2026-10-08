import { useEffect, useMemo, useState } from "react";
import {
  collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp
} from "firebase/firestore";
import { db } from "./firebase";

const QUICK_PROMPTS = [
  "What should I work on today?",
  "What is overdue?",
  "What is currently blocked?",
  "Give me my BI workload summary.",
  "Generate my stand-up update.",
  "Show me COSCO reports.",
  "Which reports need attention?",
  "Show stale reports.",
  "What reports are in Client UAT?"
];

const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS_LABELS = {
  todo: "To Do",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done"
};

function dateKey(value = new Date()) {
  const d = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

function addDaysKey(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

function activeTasks(tasks) {
  return tasks.filter(t => t.status !== "done");
}

function sortByPriorityAndDate(tasks) {
  return [...tasks].sort((a, b) =>
    (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
    String(a.dueDate || "9999-12-31").localeCompare(String(b.dueDate || "9999-12-31"))
  );
}

function normalizeReport(report) {
  return {
    ...report,
    searchText: [
      report.name,
      report.clientName,
      report.client,
      report.module,
      report.owner,
      report.priority,
      report.status,
      ...(report.remarks || []).filter(r => !r.resolved).map(r => r.text)
    ].filter(Boolean).join(" ").toLowerCase()
  };
}

function reportStatusLabel(status) {
  return String(status || "unknown").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
}

function findReportMatches(prompt, reports) {
  const q = prompt.toLowerCase().trim();
  const normalized = reports.map(normalizeReport);
  const words = q.split(/[^a-z0-9]+/).filter(w => w.length >= 3);
  const stopWords = new Set(["show", "which", "what", "reports", "report", "need", "attention", "status", "are", "the", "for", "with", "from", "that", "have", "has", "currently"]);
  const queryWords = words.filter(w => !stopWords.has(w));
  return normalized.map(report => {
    const score = queryWords.reduce((sum, word) => sum + (report.searchText.includes(word) ? 1 : 0), 0);
    return { report, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score || String(a.report.name || "").length - String(b.report.name || "").length).map(x => x.report);
}

function isStaleReport(report) {
  if (!report || report.status === "deployed_live" || !report.updatedAt) return false;
  const d = report.updatedAt.toDate ? report.updatedAt.toDate() : new Date(report.updatedAt);
  return !Number.isNaN(d.getTime()) && Date.now() - d.getTime() > 3 * 86400000;
}

function reportsNeedingAttention(reports) {
  return reports.filter(r =>
    ["pending_clarification", "client_uat", "internal_review", "sign_off"].includes(r.status) ||
    ["critical", "high"].includes(r.priority) ||
    isStaleReport(r)
  );
}

function detectIntent(prompt) {
  const q = prompt.toLowerCase().trim();

  // Action intents must win before broad informational matches.
  if (/create|add|new task/.test(q)) return "createTask";
  if (/complete|mark.*done|finish.*task/.test(q)) return "completeTask";
  if (/delete|remove|archive.*task/.test(q)) return "deleteTask";
  if (/change.*priority|set.*priority|make.*critical|make.*high|make.*medium|make.*low|repriorit/.test(q)) return "updatePriority";
  if (/due date|deadline|due tomorrow|due today|move.*deadline|change.*deadline/.test(q)) return "updateDueDate";
  if (/change.*status|set.*status|mark.*in progress|start.*task|working on/.test(q)) return "updateStatus";

  if (/stand[- ]?up|daily update/.test(q)) return "standup";
  if (/blocked|blocker/.test(q)) return "blocked";
  if (/overdue|past due|late/.test(q)) return "overdue";
  if (/workload|summary|how am i doing|how much work/.test(q)) return "workload";
  if (/what should i (work|do)|what do i work on|today('s)? (work|tasks)|tasks? today/.test(q)) return "today";
  if (/complete|mark.*done|finish.*task/.test(q)) return "completeTask";
  if (/delete|remove|archive.*task/.test(q)) return "deleteTask";
  if (/change.*priority|set.*priority|make.*critical|make.*high|make.*medium|make.*low|repriorit/.test(q)) return "updatePriority";
  if (/due date|deadline|due tomorrow|due today|move.*deadline|change.*deadline/.test(q)) return "updateDueDate";
  if (/change.*status|set.*status|mark.*in progress|start.*task|working on/.test(q)) return "updateStatus";
  if (/high priority|critical|urgent/.test(q)) return "priority";
  if (/how many tasks|task count|number of tasks/.test(q)) return "taskCount";
  if (/stale|outdated|old reports?/.test(q)) return "staleReports";
  if (/need attention|needs attention|at risk|attention needed|which reports? should i focus/.test(q)) return "reportAttention";
  if (/report.*(for|from|of)|reports? (for|from|of)|show.*reports?|find.*reports?|search.*reports?|client|module/.test(q)) return "reportSearch";
  if (/reports? (in|at)|report status|reports? status|which reports?/.test(q)) return "reports";
  if (/delete|remove.*task/.test(q)) return "deleteTask";
  if (/change.*priority|set.*priority|make.*critical|make.*high|make.*medium|make.*low|repriorit/.test(q)) return "updatePriority";
  if (/due date|deadline|due tomorrow|due today|move.*deadline|change.*deadline/.test(q)) return "updateDueDate";
  if (/in progress|start.*task|working on/.test(q)) return "updateStatus";
  return "help";
}

function findTaskMatches(prompt, tasks) {
  const q = prompt.toLowerCase();
  return tasks
    .filter(t => t.title && q.includes(t.title.toLowerCase()))
    .sort((a, b) => b.title.length - a.title.length);
}

function findTaskMention(prompt, tasks) {
  const matches = findTaskMatches(prompt, tasks);
  if (matches.length) return matches[0];
  const q = prompt.toLowerCase();
  const words = q.split(/[^a-z0-9]+/).filter(w => w.length >= 3);
  const scored = tasks.filter(t => t.title).map(t => {
    const titleWords = t.title.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3);
    const score = titleWords.filter(w => words.includes(w)).length;
    return { task: t, score };
  }).filter(x => x.score > 0).sort((a,b) => b.score-a.score || a.task.title.length-b.task.title.length);
  return scored[0]?.task || null;
  return tasks
    .filter(t => t.title)
    .sort((a, b) => b.title.length - a.title.length)
    .find(t => q.includes(t.title.toLowerCase()));
}

function parsePriority(prompt) {
  const q = prompt.toLowerCase();
  if (/critical/.test(q)) return "critical";
  if (/high|urgent/.test(q)) return "high";
  if (/medium/.test(q)) return "medium";
  if (/low/.test(q)) return "low";
  return "";
}

function parseDueDate(prompt) {
  const q = prompt.toLowerCase();
  if (/tomorrow/.test(q)) return addDaysKey(1);
  if (/today/.test(q)) return dateKey();
  const match = q.match(/(20\\d{2}-\\d{2}-\\d{2})/);
  return match ? match[1] : "";
}

function parseStatus(prompt) {
  const q = prompt.toLowerCase();
  if (/blocked/.test(q)) return "blocked";
  if (/in progress|start.*task|working on/.test(q)) return "in_progress";
  if (/to do|todo|backlog/.test(q)) return "todo";
  if (/done|complete|completed/.test(q)) return "done";
  return "";
}

function buildAnswer(intent, tasks, reports, promptForAgent = "") {
  const today = dateKey();
  const tomorrow = addDaysKey(1);
  const active = activeTasks(tasks);
  const overdue = active.filter(t => t.dueDate && t.dueDate < today);
  const dueToday = active.filter(t => t.dueDate === today);
  const high = active.filter(t => ["critical", "high"].includes(t.priority));
  const blocked = active.filter(t => t.status === "blocked");
  const inProgress = active.filter(t => t.status === "in_progress");
  const completed = tasks.filter(t => t.status === "done" && (dateKey(t.completedAt) === today || dateKey(t.updatedAt) === today));
  const staleReports = reports.filter(r => r.status !== "deployed_live" && r.updatedAt && (Date.now() - (r.updatedAt.toDate ? r.updatedAt.toDate().getTime() : new Date(r.updatedAt).getTime())) > 3 * 86400000);

  if (intent === "today") {
    const candidates = sortByPriorityAndDate([...overdue, ...dueToday, ...high.filter(t => !dueToday.some(x => x.id === t.id))]);
    if (!candidates.length) return "You have no active tasks due today or overdue. Good time to review the backlog and choose the next BI priority.";
    return "Recommended work for today:\n\n" + candidates.slice(0, 5).map((t, i) =>
      `${i + 1}. ${t.title} — ${t.priority || "medium"} — ${t.dueDate === today ? "Due today" : t.dueDate && t.dueDate < today ? "Overdue" : "Priority"}`
    ).join("\n") + `\n\nRecommendation: start with ${candidates[0].title}.`;
  }

  if (intent === "overdue") {
    return overdue.length ? "Overdue tasks:\n\n" + sortByPriorityAndDate(overdue).map(t => `• ${t.title} — ${t.dueDate} — ${t.priority || "medium"}`).join("\n") : "No active tasks are overdue.";
  }

  if (intent === "blocked") {
    return blocked.length ? "Currently blocked:\n\n" + blocked.map(t => `• ${t.title}${t.dueDate ? ` — due ${t.dueDate}` : ""}`).join("\n") : "No tasks are currently marked as blocked.";
  }

  if (intent === "priority") {
    const list = sortByPriorityAndDate(high);
    return list.length ? "High-priority active work:\n\n" + list.slice(0, 8).map(t => `• ${t.title} — ${t.priority}${t.dueDate ? ` — ${t.dueDate}` : ""}`).join("\n") : "There are no Critical or High priority active tasks.";
  }

  if (intent === "taskCount") {
    return `Task snapshot: ${tasks.length} total · ${active.length} active · ${completed.length} completed today · ${overdue.length} overdue · ${blocked.length} blocked.`;
  }

  if (intent === "workload") {
    const byCategory = {};
    active.forEach(t => { const c = t.category || "General"; byCategory[c] = (byCategory[c] || 0) + 1; });
    const categoryText = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}: ${v}`).join(" · ");
    return `BI workload snapshot:\n\nReports: ${reports.length}\nActive tasks: ${active.length}\nIn progress: ${inProgress.length}\nBlocked: ${blocked.length}\nOverdue: ${overdue.length}\n\nTask mix: ${categoryText || "No active task categories yet."}`;
  }

  if (intent === "staleReports") {
    const stale = reports.filter(isStaleReport);
    return stale.length
      ? "Stale reports (>3 days, excluding live):\n\n" + stale.slice(0, 12).map(r => `• ${r.name || "Unnamed report"} — ${reportStatusLabel(r.status)} — ${r.clientName || r.client || "No client"}`).join("\n")
      : "No stale reports were detected. Reports older than 3 days are flagged unless they are deployed live.";
  }

  if (intent === "reportAttention") {
    const attention = reportsNeedingAttention(reports);
    return attention.length
      ? "Reports needing attention:\n\n" + attention.slice(0, 12).map(r => `• ${r.name || "Unnamed report"} — ${reportStatusLabel(r.status)} — ${r.priority || "medium"}${isStaleReport(r) ? " — Stale" : ""}`).join("\n")
      : "No reports are currently flagged for attention.";
  }

  if (intent === "reportSearch") {
    const matches = findReportMatches(promptForAgent, reports);
    if (!matches.length) return "I couldn't find a report matching that client, module, name, or keyword.";
    return "Matching reports:\n\n" + matches.slice(0, 10).map(r =>
      `• ${r.name || "Unnamed report"} — ${reportStatusLabel(r.status)} — ${r.clientName || r.client || "No client"} — ${r.module || "No module"} — ${r.priority || "medium"}`
    ).join("\n");
  }

  if (intent === "reports") {
    if (!reports.length) return "No reports are currently available in the tracker.";
    const counts = {};
    reports.forEach(r => { counts[r.status || "unknown"] = (counts[r.status || "unknown"] || 0) + 1; });
    return "Report tracker snapshot:\n\n" + Object.entries(counts).map(([status, count]) => `• ${status.replaceAll("_", " ")}: ${count}`).join("\n") +
      `\n\nStale reports (>3 days, excluding live): ${staleReports.length}.`;
  }

  if (intent === "standup") {
    return `Stand-up update:\n\nCompleted today\n${completed.map(t => `• ${t.title}`).join("\n") || "• No tasks marked completed today."}\n\nIn progress\n${inProgress.map(t => `• ${t.title}`).join("\n") || "• None."}\n\nToday\n${sortByPriorityAndDate(dueToday).slice(0, 5).map(t => `• ${t.title}`).join("\n") || "• No tasks due today."}\n\nBlocked\n${blocked.map(t => `• ${t.title}`).join("\n") || "• None."}`;
  }

  return "I can currently answer questions about your tasks, workload, overdue work, priorities, blockers, reports and stand-up status. I can also prepare task actions for your approval.";
}

function parseCreateTask(prompt) {
  const q = prompt.trim();
  const lower = q.toLowerCase();
  const priority = /critical/.test(lower) ? "critical" : /high|urgent/.test(lower) ? "high" : /low/.test(lower) ? "low" : "medium";
  const dueDate = /tomorrow/.test(lower) ? addDaysKey(1) : /today/.test(lower) ? dateKey() : "";
  const category = /sql/.test(lower) ? "SQL" : /dax/.test(lower) ? "DAX" : /uat/.test(lower) ? "UAT" : /test|testing|qa/.test(lower) ? "Testing" : /meeting/.test(lower) ? "Meeting" : /document/.test(lower) ? "Documentation" : "General";
  let title = q.replace(/create|add|new task|high|critical|medium|low|urgent|today|tomorrow|for me|please/gi, "").replace(/\s+/g, " ").trim();
  title = title.replace(/^task\s*(to|for)?\s*/i, "").trim();
  if (!title) title = "New BI task";
  return { title: title.charAt(0).toUpperCase() + title.slice(1), category, priority, dueDate };
}

export default function AskMyBI({ C, S, reports = [], currentUser }) {
  const [tasks, setTasks] = useState([]);
  const [messages, setMessages] = useState([
    { role: "assistant", text: `Hi ${currentUser || "Shreyas"} — Ask My BI is now running in Local Agent Mode. No external AI API is required.` }
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  useEffect(() => onSnapshot(collection(db, "tasks"), s => setTasks(s.docs.map(d => ({ id: d.id, ...d.data() })))), []);

  const context = useMemo(() => ({ tasks, reports }), [tasks, reports]);

  const executeAction = async () => {
    if (!pendingAction) return;
    setSending(true);
    try {
      if (pendingAction.type === "createTask") {
        const t = pendingAction.data;
        await addDoc(collection(db, "tasks"), {
          title: t.title, owner: currentUser || "Shreyas Krishna", category: t.category,
          priority: t.priority, status: "todo", dueDate: t.dueDate,
          reportId: "", estimatedHours: "", actualHours: "",
          createdDate: dateKey(), createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
        setMessages(m => [...m, { role: "assistant", text: `Task created: ${t.title} — ${t.priority} — ${t.dueDate || "No due date"}.` }]);
      } else if (pendingAction.type === "updateTask") {
        const updates = { updatedAt: serverTimestamp() };
        if (pendingAction.priority) updates.priority = pendingAction.priority;
        if (pendingAction.dueDate !== undefined) updates.dueDate = pendingAction.dueDate;
        if (pendingAction.status) {
          updates.status = pendingAction.status;
          if (pendingAction.status === "done") updates.completedAt = serverTimestamp();
        }
        await updateDoc(doc(db, "tasks", pendingAction.task.id), updates);
        setMessages(m => [...m, { role: "assistant", text: `Task updated: ${pendingAction.task.title}.` }]);
      } else if (pendingAction.type === "deleteTask") {
        await updateDoc(doc(db, "tasks", pendingAction.task.id), { status: "deleted", updatedAt: serverTimestamp() });
        setMessages(m => [...m, { role: "assistant", text: `Task archived: ${pendingAction.task.title}.` }]);
      } else if (pendingAction.type === "completeTask") {
        await updateDoc(doc(db, "tasks", pendingAction.task.id), {
          status: "done", completedAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
        setMessages(m => [...m, { role: "assistant", text: `Task completed: ${pendingAction.task.title}.` }]);
      }
      setPendingAction(null);
    } catch (error) {
      setMessages(m => [...m, { role: "assistant", text: `I could not execute that action: ${error.message}` }]);
    } finally {
      setSending(false);
    }
  };

  const send = async (forcedText) => {
    const text = (forcedText ?? input).trim();
    if (!text || sending) return;
    setInput("");
    setMessages(m => [...m, { role: "user", text }]);
    setSending(true);

    const intent = detectIntent(text);
    let response = "";
    try {
      if (intent === "createTask") {
        const data = parseCreateTask(text);
        setPendingAction({ type: "createTask", data });
        response = `I prepared this action:\n\nCreate task: ${data.title}\nCategory: ${data.category}\nPriority: ${data.priority}\nDue: ${data.dueDate || "No due date"}`;
      } else if (["updatePriority","updateDueDate","updateStatus","deleteTask"].includes(intent)) {
        const task = findTaskMention(text, tasks);
        if (!task) {
          response = "I couldn't identify which task you mean. Include the exact task name.";
        } else if (intent === "deleteTask") {
          setPendingAction({ type: "deleteTask", task });
          response = `I prepared this action:\n\nArchive task: ${task.title}`;
        } else {
          const action = { type: "updateTask", task };
          if (intent === "updatePriority") action.priority = parsePriority(text);
          if (intent === "updateDueDate") action.dueDate = parseDueDate(text);
          if (intent === "updateStatus") action.status = parseStatus(text);
          if (!action.priority && action.dueDate === undefined && !action.status) {
            response = "Please specify the new priority, due date (today, tomorrow, or YYYY-MM-DD), or status.";
          } else {
            setPendingAction(action);
            response = `I prepared this action for “${task.title}”.`;
          }
        }
      } else if (intent === "reportSearch") {
        response = buildAnswer(intent, tasks, reports, text);
      } else if (intent === "staleReports" || intent === "reportAttention") {
        response = buildAnswer(intent, tasks, reports, text);
      } else if (intent === "completeTask") {
        const task = findTaskMention(text, tasks);
        if (!task) response = "I couldn't identify which task you want to complete. Include the task name.";
        else {
          setPendingAction({ type: "completeTask", task });
          response = `I prepared this action:\n\nMark “${task.title}” as Done.`;
        }
      } else {
        response = buildAnswer(intent, tasks, reports, text);
      }
      setMessages(m => [...m, { role: "assistant", text: response }]);
    } finally {
      setSending(false);
    }
  };

  return <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1100, margin: "0 auto", width: "100%" }}>
    <div style={{ ...S.card, background: `linear-gradient(135deg,${C.accent} 0%,#0B5FFF 100%)`, border: "none", color: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, opacity: .72, textTransform: "uppercase", letterSpacing: ".08em" }}>Local Agent Engine</div>
          <h2 style={{ margin: "5px 0 3px", fontSize: 25 }}>Ask My BI</h2>
          <div style={{ fontSize: 13, opacity: .82 }}>Your personal BI command center — powered by your own app data.</div>
        </div>
        <div style={{ padding: "7px 10px", borderRadius: 20, background: "#ffffff18", border: "1px solid #ffffff35", fontSize: 11, fontWeight: 700 }}>LOCAL · API FREE</div>
      </div>
    </div>

    <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
      {QUICK_PROMPTS.map(p => <button key={p} onClick={() => send(p)} disabled={sending} style={{ ...S.btn(), fontSize: 11 }}>{p}</button>)}
    </div>

    {pendingAction && <div style={{ ...S.card, border: `1px solid ${C.accent}`, background: C.accentBg }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.accent, textTransform: "uppercase" }}>Approval Required</div>
      <div style={{ marginTop: 6, fontSize: 13, color: C.text, whiteSpace: "pre-wrap" }}>
        {pendingAction.type === "createTask"
          ? `Create “${pendingAction.data.title}” · ${pendingAction.data.category} · ${pendingAction.data.priority} · ${pendingAction.data.dueDate || "No due date"}`
          : pendingAction.type === "deleteTask"
            ? `Archive “${pendingAction.task.title}”`
            : `Update “${pendingAction.task.title}”${pendingAction.priority ? ` · Priority: ${pendingAction.priority}` : ""}${pendingAction.dueDate !== undefined ? ` · Due: ${pendingAction.dueDate || "No due date"}` : ""}${pendingAction.status ? ` · Status: ${STATUS_LABELS[pendingAction.status] || pendingAction.status}` : ""}`}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={executeAction} disabled={sending} style={S.btn("primary")}>{sending ? "Executing..." : "Approve & Execute"}</button>
        <button onClick={() => setPendingAction(null)} disabled={sending} style={S.btn()}>Cancel</button>
      </div>
    </div>}

    <div style={{ ...S.card, minHeight: 500, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, color: C.text }}>BI Local Agent</h3>
          <p style={{ margin: "3px 0 0", fontSize: 11, color: C.textMuted }}>Live context: {reports.length} reports · {tasks.length} tasks</p>
        </div>
        <span style={{ fontSize: 10, color: "#16A34A", fontWeight: 700 }}>● READY</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: "16px 2px" }}>
        {messages.map((m, i) => <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "82%", padding: "11px 13px", borderRadius: 11, background: m.role === "user" ? C.accent : C.bg, color: m.role === "user" ? "#fff" : C.text, border: m.role === "user" ? "none" : `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
          {m.text}
        </div>)}
        {sending && <div style={{ alignSelf: "flex-start", color: C.textMuted, fontSize: 12 }}>Processing…</div>}
      </div>

      <div style={{ display: "flex", gap: 8, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} disabled={sending} style={{ ...S.input, flex: 1 }} placeholder="Ask about tasks, reports, blockers, workload or today's priorities…" />
        <button onClick={() => send()} disabled={sending || !input.trim()} style={S.btn("primary")}>{sending ? "..." : "Ask"}</button>
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10 }}>
      {[
        ["🧠 Local Orchestrator", "Routes your question to a deterministic BI agent without an external AI service."],
        ["📋 Task Agent", "Reads tasks, priorities and deadlines, and prepares approved task actions."],
        ["📊 Report Agent", "Summarizes report statuses and identifies stale reports."],
        ["🧪 QA Ready", "The next agent layer can add deterministic data-quality and release checks."]
      ].map(([title, desc]) => <div key={title} style={{ ...S.card, padding: 13 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{title}</div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4, lineHeight: 1.5 }}>{desc}</div>
      </div>)}
    </div>
  </div>;
}
