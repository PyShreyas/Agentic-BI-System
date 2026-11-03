import { useMemo, useState } from "react";
import SQLAgentWorkspace from "./agents/SQLAgentWorkspace";
import SQLQueryValidator from "./agents/SQLQueryValidator";
import SQLQueryExplainer from "./agents/SQLQueryExplainer";
import SQLSchemaExplorer from "./agents/SQLSchemaExplorer";

const agents = [
  { id: "orchestrator", name: "BI Orchestrator", icon: "ti-hierarchy-3", description: "Coordinate specialist agents into one controlled BI workflow.", status: "Core workflow", color: "#0B5FFF", tabs: ["Overview", "Workflow Builder", "Execution Monitor", "History"], capabilities: ["Route a request to the right specialist agents", "Build ordered multi-agent plans", "Track step-by-step execution status", "Combine findings into one response"] },
  { id: "sql", name: "SQL Agent", icon: "ti-database", description: "Work with SQL Server schemas, queries and data validation.", status: "Next to build", color: "#1688C9", tabs: ["Overview", "SQL Generator", "SQL Explainer", "Query Validator", "Schema Explorer", "Duplicate Analysis", "Reconciliation", "History"], capabilities: ["Generate SQL from a business question", "Explain joins, CTEs, views and stored procedures", "Validate read-only query safety", "Inspect schema metadata", "Find duplicate keys and reconcile row counts"] },
  { id: "report", name: "Report Agent", icon: "ti-chart-dots-3", description: "Understand report status, ownership, freshness and delivery risks.", status: "Existing logic", color: "#7C3AED", tabs: ["Overview", "Report Search", "Status Analysis", "Stale Reports", "Insights"], capabilities: ["Search reports by client, module or name", "Identify stale and attention-needed reports", "Summarise delivery status"] },
  { id: "qa", name: "QA Agent", icon: "ti-shield-check", description: "Run tracker-level checks and prepare release-readiness reviews.", status: "Existing logic", color: "#0D9B3A", tabs: ["Overview", "Data Quality", "Report QA", "UAT Checklist", "Release Readiness"], capabilities: ["Check missing report metadata", "Identify unresolved remarks and blockers", "Prepare UAT and release checklists"] },
  { id: "task", name: "Task Agent", icon: "ti-list-check", description: "Manage tasks, blockers, priorities and due dates.", status: "Existing logic", color: "#D97706", tabs: ["Overview", "Task Manager", "Prioritisation", "Blockers", "Recommendations"], capabilities: ["Find overdue and blocked tasks", "Prioritise work with explainable reasons", "Propose task updates for approval"] },
  { id: "myday", name: "My Day Agent", icon: "ti-calendar-check", description: "Turn your workload into a focused daily plan.", status: "Existing logic", color: "#0891B2", tabs: ["Overview", "Daily Briefing", "Workload", "Recommendations", "Progress"], capabilities: ["Summarise today's workload", "Highlight deadlines and high-priority work", "Recommend the next best task"] },
  { id: "docs", name: "Documentation Agent", icon: "ti-file-text", description: "Prepare consistent BI delivery notes and work updates.", status: "Existing logic", color: "#64748B", tabs: ["Overview", "Developer Notes", "Stand-up Update", "UAT Updates", "Work Summary"], capabilities: ["Draft developer notes from verified findings", "Prepare stand-up and UAT updates", "Summarise completed work"] },
  { id: "knowledge", name: "BI Knowledge Agent", icon: "ti-books", description: "A shared, searchable source of approved BI knowledge.", status: "Planned", color: "#9333EA", tabs: ["Overview", "SQL Library", "DAX Library", "Data Dictionary", "Documentation"], capabilities: ["Store approved SQL and DAX definitions", "Maintain data dictionaries and business rules", "Provide grounded context to specialist agents"] }
];

const workflowExample = [
  { agent: "SQL Agent", detail: "Inspect source views, keys, row counts and duplicates." },
  { agent: "Report Agent", detail: "Review report metadata, model and refresh context." },
  { agent: "QA Agent", detail: "Validate count differences and relationship risks." },
  { agent: "Documentation Agent", detail: "Prepare findings and developer notes." }
];

export default function AgenticBIWorkflow({ C, S }) {
  const [selectedAgentId, setSelectedAgentId] = useState("orchestrator");
  const [activeTabs, setActiveTabs] = useState({});
  const selectedAgent = useMemo(() => agents.find(agent => agent.id === selectedAgentId) || agents[0], [selectedAgentId]);
  const activeTab = activeTabs[selectedAgent.id] || "Overview";
  const setActiveTab = tab => setActiveTabs(previous => ({ ...previous, [selectedAgent.id]: tab }));
  const cardStyle = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 };
  const muted = { color: C.textMuted, fontSize: 12, lineHeight: 1.6 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ ...cardStyle, background: "linear-gradient(120deg, #072E55, #0B4A7D)", color: "#fff", border: "none", padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <i className="ti ti-hierarchy-3" style={{ fontSize: 24 }} />
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".09em", opacity: .85 }}>AGENTIC BI WORKFLOW</span>
          <span style={{ marginLeft: "auto", fontSize: 11, padding: "4px 9px", borderRadius: 20, background: "rgba(255,255,255,.14)" }}>Workspace foundation</span>
        </div>
        <h2 style={{ margin: "0 0 6px", fontSize: 23 }}>BI Operations Control Center</h2>
        <p style={{ margin: 0, color: "#D5E7F5", fontSize: 13, maxWidth: 760, lineHeight: 1.6 }}>Open a specialist agent independently, or use the orchestrator to coordinate multiple agents. Each agent has its own workspace and task-specific tabs.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(205px, 1fr))", gap: 10 }}>
        {agents.map(agent => {
          const active = selectedAgent.id === agent.id;
          return (
            <button key={agent.id} onClick={() => setSelectedAgentId(agent.id)} style={{ textAlign: "left", cursor: "pointer", border: `1px solid ${active ? agent.color : C.border}`, borderRadius: 11, padding: 13, background: active ? (C.surface2 || "#EAF2FF") : C.surface, color: C.text, boxShadow: active ? `0 0 0 1px ${agent.color}22` : "none", minHeight: 112 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
                <span style={{ width: 32, height: 32, borderRadius: 9, display: "grid", placeItems: "center", background: `${agent.color}18`, color: agent.color }}><i className={`ti ${agent.icon}`} style={{ fontSize: 18 }} /></span>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{agent.name}</span>
              </div>
              <div style={{ ...muted, marginBottom: 7 }}>{agent.description}</div>
              <span style={{ fontSize: 10, fontWeight: 700, color: agent.color }}>{agent.status}</span>
            </button>
          );
        })}
      </div>

      <section style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "17px 18px 13px", display: "flex", alignItems: "center", gap: 11, borderBottom: `1px solid ${C.border}` }}>
          <span style={{ width: 40, height: 40, borderRadius: 11, display: "grid", placeItems: "center", background: `${selectedAgent.color}18`, color: selectedAgent.color }}><i className={`ti ${selectedAgent.icon}`} style={{ fontSize: 22 }} /></span>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 17 }}>{selectedAgent.name}</h3>
            <p style={{ ...muted, margin: "3px 0 0" }}>{selectedAgent.description}</p>
          </div>
          <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: selectedAgent.color, whiteSpace: "nowrap" }}>{selectedAgent.status}</span>
        </div>
        <div style={{ display: "flex", gap: 4, overflowX: "auto", padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
          {selectedAgent.tabs.map(tab => <button key={tab} onClick={() => setActiveTab(tab)} style={{ whiteSpace: "nowrap", border: "none", borderRadius: 7, padding: "8px 11px", cursor: "pointer", fontSize: 12, fontWeight: activeTab === tab ? 700 : 500, background: activeTab === tab ? C.accent : "transparent", color: activeTab === tab ? "#fff" : C.textMuted }}>{tab}</button>)}
        </div>
        <div style={{ padding: 18 }}>
          {selectedAgent.id === "sql" && activeTab === "SQL Generator" ? <SQLAgentWorkspace C={C} /> : selectedAgent.id === "sql" && activeTab === "SQL Explainer" ? <SQLQueryExplainer C={C} /> : selectedAgent.id === "sql" && activeTab === "Query Validator" ? <SQLQueryValidator C={C} /> : selectedAgent.id === "sql" && activeTab === "Schema Explorer" ? <SQLSchemaExplorer C={C} /> : selectedAgent.id === "orchestrator" && activeTab === "Workflow Builder" ? (
            <div>
              <h4 style={{ margin: "0 0 6px" }}>Multi-agent workflow example</h4>
              <p style={muted}>A single request can be decomposed into specialist steps. This preview illustrates the planned user experience; it does not execute database queries.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 14 }}>
                {workflowExample.map((step, index) => <div key={step.agent} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: 12, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 9 }}><span style={{ width: 25, height: 25, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 20, background: C.accentBg, color: C.accent, fontSize: 11, fontWeight: 700 }}>{index + 1}</span><div><strong style={{ fontSize: 13 }}>{step.agent}</strong><p style={{ ...muted, margin: "3px 0 0" }}>{step.detail}</p></div></div>)}
              </div>
            </div>
          ) : selectedAgent.id === "orchestrator" && activeTab === "Execution Monitor" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
              {[["Planner","Creates ordered plans"],["Executor","Runs approved steps"],["Context","Shares request-scoped findings"],["Approval","Guards consequential actions"]].map(([name, detail]) => <div key={name} style={{ padding: 13, borderRadius: 9, background: C.bg, border: `1px solid ${C.border}` }}><strong style={{ fontSize: 13 }}>{name}</strong><p style={{ ...muted, margin: "5px 0 0" }}>{detail}</p></div>)}
            </div>
          ) : selectedAgent.id === "orchestrator" && activeTab === "History" ? (
            <div style={{ ...muted, padding: 18, textAlign: "center" }}>Workflow history will appear here when persistent workflow-run records are connected.</div>
          ) : (
            <div>
              <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>{activeTab === "Overview" ? "Agent capabilities" : activeTab}</h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 9 }}>
                {selectedAgent.capabilities.map((capability, index) => <div key={capability} style={{ padding: 12, borderRadius: 9, background: C.bg, border: `1px solid ${C.border}`, display: "flex", gap: 9, alignItems: "flex-start" }}><i className="ti ti-check" style={{ color: selectedAgent.color, marginTop: 2 }} /><span style={{ fontSize: 12, lineHeight: 1.6 }}>{capability}</span></div>)}
              </div>
              <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: C.bg, border: `1px dashed ${C.border}` }}>
                <strong style={{ fontSize: 12 }}>Implementation status</strong>
                <p style={{ ...muted, margin: "4px 0 0" }}>{selectedAgent.id === "sql" ? "The SQL Agent workspace is scaffolded. Query generation, schema discovery and database connectivity will be implemented in subsequent milestones with read-only safeguards." : selectedAgent.id === "knowledge" ? "The knowledge workspace is planned. Approved SQL, DAX, data dictionaries and documentation sources will be connected in a later milestone." : "This workspace exposes the agent's capability areas. Existing deterministic logic will be connected to these controls incrementally; tabs are navigation foundations, not claims that every tool is already live."}</p>
              </div>
            </div>
          )}
        </div>
      </section>
      <p style={{ ...muted, margin: 0 }}>Safety model: database access will be read-only by default. Writes and consequential actions require explicit approval. No external AI API or local model installation is required for this workspace shell.</p>
    </div>
  );
}
