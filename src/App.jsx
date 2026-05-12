import { useState, useEffect, useCallback, useRef } from "react";
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp, orderBy, query
} from "firebase/firestore";
import { db } from "./firebase";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";

const STATUSES = [
  { key: "backlog", label: "Backlog", color: "#888780", bg: "#F1EFE8", text: "#2C2C2A" },
  { key: "in_development", label: "In Development", color: "#378ADD", bg: "#E6F1FB", text: "#0C447C" },
  { key: "internal_review", label: "Internal Review", color: "#EF9F27", bg: "#FAEEDA", text: "#633806" },
  { key: "sign_off", label: "Sign-Off", color: "#D4537E", bg: "#FBEAF0", text: "#4B1528" },
  { key: "client_uat", label: "Client UAT", color: "#7F77DD", bg: "#EEEDFE", text: "#26215C" },
  { key: "pending_clarification", label: "Pending Clarification", color: "#E24B4A", bg: "#FCEBEB", text: "#501313" },
  { key: "maersk_approved", label: "Maersk Approved", color: "#1D9E75", bg: "#E1F5EE", text: "#04342C" },
  { key: "deployed_live", label: "Deployed Live", color: "#639922", bg: "#EAF3DE", text: "#173404" },
];

const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.key, s]));

const PRIORITIES = [
  { key: "critical", label: "Critical", color: "#E24B4A", bg: "#FCEBEB" },
  { key: "high", label: "High", color: "#D85A30", bg: "#FAECE7" },
  { key: "medium", label: "Medium", color: "#BA7517", bg: "#FAEEDA" },
  { key: "low", label: "Low", color: "#639922", bg: "#EAF3DE" },
];

const MODULES = ["QHSE", "QDMS", "Audit and Inspection", "PMS", "Procurement"];
const OWNERS = ["Abin Alex", "Shreyas Krishna", "Nithuna V", "Jastin Willy", "Sudhanshu S", "Sarah"];

const CREDENTIALS = { "MA-BI": "Welcome@123" };

function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function timeAgo(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const StatusBadge = ({ statusKey, small }) => {
  const s = STATUS_MAP[statusKey];
  if (!s) return null;
  return (
    <span style={{ display: "inline-block", padding: small ? "2px 8px" : "3px 10px", borderRadius: 20, background: s.bg, color: s.text, fontSize: small ? 11 : 12, fontWeight: 500, border: `1px solid ${s.color}33`, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
};

const PriorityBadge = ({ priorityKey }) => {
  const p = PRIORITIES.find(x => x.key === priorityKey);
  if (!p) return null;
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 20, background: p.bg, color: p.color, fontSize: 11, fontWeight: 600, border: `1px solid ${p.color}44` }}>
      {p.label}
    </span>
  );
};

const ReportForm = ({ initial, onSave, onCancel, title, saving, colors, s }) => {
  const [form, setForm] = useState({
    name: "", module: MODULES[0], owner: OWNERS[0], priority: "high", status: "backlog", ...initial
  });
  return (
    <div style={s.modal} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={s.modalContent}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: colors.text }}>{title}</h2>
          <button onClick={onCancel} style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: colors.textMuted }}>×</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={s.label}>Report Name *</label>
            <input style={s.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Enter report name" />
          </div>
          <div>
            <label style={s.label}>Module / Department</label>
            <select style={s.input} value={form.module} onChange={e => setForm(f => ({ ...f, module: e.target.value }))}>
              {MODULES.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={s.label}>Report Owner</label>
            <select style={s.input} value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}>
              {OWNERS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label style={s.label}>Priority</label>
            <select style={s.input} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
              {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label style={s.label}>Status</label>
            <select style={s.input} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              {STATUSES.map(st => <option key={st.key} value={st.key}>{st.label}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={s.btn()}>Cancel</button>
          <button onClick={() => form.name.trim() && onSave(form)} style={s.btn("primary")} disabled={saving}>
            {saving ? "Saving..." : "Save Report"}
          </button>
        </div>
      </div>
    </div>
  );
};

const ReportDetail = ({ report, colors, s, currentUser, handleStatusChange, handleDeleteRemark, db, serverTimestamp, updateDoc, doc }) => {
  const remarkRef = useRef(null);
  const [editRemarkId, setEditRemarkId] = useState(null);
  const [editRemarkText, setEditRemarkText] = useState("");

  const handleAddRemark = async () => {
    const text = remarkRef.current?.value?.trim();
    if (!text || !report) return;
    const remark = {
      id: "rm" + Date.now(),
      text,
      author: currentUser,
      createdAt: new Date().toISOString(),
    };
    try {
      await updateDoc(doc(db, "reports", report.id), {
        remarks: [...(report.remarks || []), remark],
        updatedAt: serverTimestamp(),
      });
    } catch (e) { console.error(e); }
    if (remarkRef.current) remarkRef.current.value = "";
  };

  const handleEditRemark = async (remarkId) => {
    if (!editRemarkText.trim()) return;
    try {
      await updateDoc(doc(db, "reports", report.id), {
        remarks: report.remarks.map(r =>
          r.id === remarkId ? { ...r, text: editRemarkText.trim() } : r
        ),
        updatedAt: serverTimestamp(),
      });
    } catch (e) { console.error(e); }
    setEditRemarkId(null);
    setEditRemarkText("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, color: colors.text, fontWeight: 600 }}>{report.name}</h2>
          <p style={{ margin: "4px 0 0", color: colors.textMuted, fontSize: 13 }}>
            {report.module} · Created {fmtDate(report.createdAt)}
            {report.createdBy && ` by ${report.createdBy}`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <PriorityBadge priorityKey={report.priority} />
          <StatusBadge statusKey={report.status} />
        </div>
      </div>

      <div style={{ ...s.card, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "14px 16px" }}>
        <div>
          <p style={{ ...s.label, marginBottom: 2 }}>Owner</p>
          <p style={{ margin: 0, fontSize: 14, color: colors.text }}>{report.owner}</p>
        </div>
        <div>
          <p style={{ ...s.label, marginBottom: 2 }}>Last Updated</p>
          <p style={{ margin: 0, fontSize: 14, color: colors.text }}>{timeAgo(report.updatedAt)}</p>
        </div>
        {report.lastEditedBy && (
          <div>
            <p style={{ ...s.label, marginBottom: 2 }}>Last Edited By</p>
            <p style={{ margin: 0, fontSize: 14, color: colors.text }}>{report.lastEditedBy}</p>
          </div>
        )}
      </div>

      <div>
        <label style={{ ...s.label, marginBottom: 6 }}>Change Status</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {STATUSES.map(st => (
            <button key={st.key} onClick={() => handleStatusChange(report.id, st.key)} style={{ padding: "4px 10px", borderRadius: 16, border: `1px solid ${st.color}66`, background: report.status === st.key ? st.bg : "transparent", color: report.status === st.key ? st.text : colors.textMuted, fontSize: 11, cursor: "pointer", fontWeight: report.status === st.key ? 600 : 400 }}>
              {st.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15, color: colors.text }}>Remarks & Documentation</h3>
          <span style={{ fontSize: 12, color: colors.textMuted }}>{(report.remarks || []).length} entries</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {(report.remarks || []).length === 0 && (
            <p style={{ color: colors.textMuted, fontSize: 13, margin: 0 }}>No remarks yet.</p>
          )}
          {(report.remarks || []).map(rm => (
            <div key={rm.id} style={{ ...s.card, padding: "12px 14px", background: colors.surface2 }}>
              {editRemarkId === rm.id ? (
                <div>
                  <textarea
                    style={{ ...s.input, height: 80, resize: "vertical", marginBottom: 8 }}
                    value={editRemarkText}
                    onChange={e => setEditRemarkText(e.target.value)}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => handleEditRemark(rm.id)} style={s.btn("primary")}>Save</button>
                    <button onClick={() => setEditRemarkId(null)} style={s.btn()}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <p style={{ margin: "0 0 8px", fontSize: 14, color: colors.text, lineHeight: 1.6 }}>{rm.text}</p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: colors.textMuted }}>{rm.author} · {fmtDateTime(rm.createdAt)}</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => { setEditRemarkId(rm.id); setEditRemarkText(rm.text); }} style={{ ...s.btn(), padding: "2px 8px", fontSize: 11 }}>Edit</button>
                      <button onClick={() => handleDeleteRemark(rm.id, report)} style={{ ...s.btn(), padding: "2px 8px", fontSize: 11, color: "#E24B4A", borderColor: "#E24B4A44" }}>Delete</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <textarea
            ref={remarkRef}
            style={{ ...s.input, flex: 1, height: 70, resize: "vertical" }}
            placeholder="Add a remark or documentation update... (Ctrl+Enter to submit)"
            onKeyDown={e => e.key === "Enter" && e.ctrlKey && handleAddRemark()}
          />
          <button onClick={handleAddRemark} style={{ ...s.btn("primary"), alignSelf: "flex-end" }}>Add</button>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [currentUser, setCurrentUser] = useState("");
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [view, setView] = useState("dashboard");
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterModule, setFilterModule] = useState("all");
  const [selectedReport, setSelectedReport] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [kanbanMode, setKanbanMode] = useState(false);
  const [dragItem, setDragItem] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authed) return;
    const q = query(collection(db, "reports"), orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setReports(data);
      setLoading(false);
      setSelectedReport(prev => prev ? (data.find(r => r.id === prev.id) || null) : null);
    });
    return () => unsub();
  }, [authed]);

  const handleLogin = () => {
    if (CREDENTIALS[loginUser] && CREDENTIALS[loginUser] === loginPass) {
      setCurrentUser(loginUser);
      setAuthed(true);
      setLoginErr("");
    } else {
      setLoginErr("Invalid credentials. Please try again.");
    }
  };

  const handleAddReport = async (data) => {
    setSaving(true);
    try {
      await addDoc(collection(db, "reports"), {
        ...data, remarks: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: currentUser,
      });
    } catch (e) { console.error(e); }
    setSaving(false);
    setShowAddModal(false);
  };

  const handleEditReport = async (data) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "reports", editingReport.id), {
        ...data, updatedAt: serverTimestamp(), lastEditedBy: currentUser,
      });
    } catch (e) { console.error(e); }
    setSaving(false);
    setEditingReport(null);
  };

  const handleStatusChange = async (reportId, newStatus) => {
    try {
      await updateDoc(doc(db, "reports", reportId), {
        status: newStatus, updatedAt: serverTimestamp(), lastEditedBy: currentUser,
      });
    } catch (e) { console.error(e); }
  };

  const handleDeleteReport = async (reportId) => {
    if (!window.confirm("Delete this report? This cannot be undone.")) return;
    try {
      await deleteDoc(doc(db, "reports", reportId));
      setSelectedReport(null);
    } catch (e) { console.error(e); }
  };

  const handleDeleteRemark = async (remarkId, report) => {
    try {
      await updateDoc(doc(db, "reports", report.id), {
        remarks: report.remarks.filter(r => r.id !== remarkId),
        updatedAt: serverTimestamp(),
      });
    } catch (e) { console.error(e); }
  };

  const handleDrop = (statusKey) => {
    if (!dragItem) return;
    handleStatusChange(dragItem, statusKey);
    setDragItem(null);
  };

  const filteredReports = reports.filter(r => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (filterModule !== "all" && r.module !== filterModule) return false;
    if (searchTerm && !r.name?.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !r.owner?.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !r.module?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: reports.length,
    backlog: reports.filter(r => r.status === "backlog").length,
    inDev: reports.filter(r => r.status === "in_development").length,
    review: reports.filter(r => ["internal_review", "sign_off", "client_uat"].includes(r.status)).length,
    deployed: reports.filter(r => r.status === "deployed_live").length,
    pendingClarification: reports.filter(r => r.status === "pending_clarification").length,
  };

  const pieData = STATUSES.map(s => ({ name: s.label, value: reports.filter(r => r.status === s.key).length, color: s.color })).filter(d => d.value > 0);
  const barData = MODULES.map(m => ({ module: m.slice(0, 7), count: reports.filter(r => r.module === m).length })).filter(d => d.count > 0);

  const colors = {
    bg: darkMode ? "#1a1a1f" : "#F7F6F3",
    surface: darkMode ? "#23232b" : "#FFFFFF",
    surface2: darkMode ? "#2c2c35" : "#F1EFE8",
    border: darkMode ? "#3a3a45" : "#E0DED6",
    text: darkMode ? "#E8E6E0" : "#1a1a1f",
    textMuted: darkMode ? "#8a8880" : "#6B6962",
    sidebar: darkMode ? "#16161c" : "#FFFFFF",
    accent: "#378ADD",
    accentBg: darkMode ? "#0c2a4a" : "#E6F1FB",
  };

  const s = {
    sidebar: { width: sidebarOpen ? 220 : 60, minWidth: sidebarOpen ? 220 : 60, background: colors.sidebar, borderRight: `1px solid ${colors.border}`, transition: "all 0.2s", display: "flex", flexDirection: "column", height: "100vh", position: "sticky", top: 0, overflow: "hidden" },
    navItem: (active) => ({ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", cursor: "pointer", borderRadius: 8, margin: "2px 8px", background: active ? colors.accentBg : "transparent", color: active ? colors.accent : colors.textMuted, fontWeight: active ? 500 : 400, fontSize: 14, transition: "all 0.15s", whiteSpace: "nowrap", overflow: "hidden" }),
    card: { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12, padding: "1.25rem" },
    btn: (variant = "default") => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: variant === "primary" ? "none" : `1px solid ${colors.border}`, background: variant === "primary" ? colors.accent : colors.surface, color: variant === "primary" ? "#fff" : colors.text, fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 0.15s" }),
    input: { width: "100%", padding: "8px 12px", border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.surface, color: colors.text, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" },
    label: { fontSize: 12, fontWeight: 500, color: colors.textMuted, display: "block", marginBottom: 4 },
    modal: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
    modalContent: { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 24, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto" },
  };

  const navItems = [
    { key: "dashboard", icon: "ti-layout-dashboard", label: "Dashboard" },
    { key: "tracker", icon: "ti-report-analytics", label: "Report Tracker" },
    { key: "analytics", icon: "ti-chart-bar", label: "Analytics" },
    { key: "activity", icon: "ti-activity", label: "Activity Log" },
  ];

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: darkMode ? "#1a1a1f" : "#F7F6F3", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 20, padding: "2.5rem", width: "100%", maxWidth: 400, boxSizing: "border-box" }}>
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <div style={{ width: 52, height: 52, background: colors.accent, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem", fontSize: 22, color: "#fff", fontWeight: 700 }}>BI</div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: colors.text }}>MA-BI Portal</h1>
            <p style={{ margin: "6px 0 0", color: colors.textMuted, fontSize: 14 }}>Report Tracker & Documentation</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={s.label}>Username</label>
              <input style={s.input} value={loginUser} onChange={e => setLoginUser(e.target.value)} placeholder="Enter username" onKeyDown={e => e.key === "Enter" && handleLogin()} />
            </div>
            <div>
              <label style={s.label}>Password</label>
              <input style={s.input} type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)} placeholder="Enter password" onKeyDown={e => e.key === "Enter" && handleLogin()} />
            </div>
            {loginErr && <p style={{ color: "#E24B4A", fontSize: 13, margin: 0 }}>{loginErr}</p>}
            <button onClick={handleLogin} style={{ ...s.btn("primary"), justifyContent: "center", padding: "10px 14px", fontSize: 15, borderRadius: 10, marginTop: 4 }}>Sign In</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: colors.bg, minHeight: "100vh", color: colors.text, display: "flex" }}>
      <div style={s.sidebar}>
        <div style={{ padding: "16px 12px", borderBottom: `1px solid ${colors.border}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, minWidth: 34, background: colors.accent, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13 }}>BI</div>
          {sidebarOpen && <span style={{ fontSize: 15, fontWeight: 600, color: colors.text }}>MA-BI Portal</span>}
        </div>
        <nav style={{ flex: 1, padding: "8px 0" }}>
          {navItems.map(item => (
            <div key={item.key} onClick={() => { setView(item.key); setSelectedReport(null); }} style={s.navItem(view === item.key)}>
              <i className={`ti ${item.icon}`} style={{ fontSize: 18, minWidth: 18 }} />
              {sidebarOpen && <span>{item.label}</span>}
            </div>
          ))}
        </nav>
        <div style={{ borderTop: `1px solid ${colors.border}`, padding: "12px 8px" }}>
          <div style={s.navItem(false)} onClick={() => setDarkMode(d => !d)}>
            <i className={`ti ${darkMode ? "ti-sun" : "ti-moon"}`} style={{ fontSize: 18, minWidth: 18 }} />
            {sidebarOpen && <span>{darkMode ? "Light mode" : "Dark mode"}</span>}
          </div>
          <div style={s.navItem(false)} onClick={() => setSidebarOpen(o => !o)}>
            <i className="ti ti-layout-sidebar-left-collapse" style={{ fontSize: 18, minWidth: 18 }} />
            {sidebarOpen && <span>Collapse</span>}
          </div>
          <div style={s.navItem(false)} onClick={() => { setAuthed(false); setCurrentUser(""); }}>
            <i className="ti ti-logout" style={{ fontSize: 18, minWidth: 18 }} />
            {sidebarOpen && <span>Sign out ({currentUser})</span>}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 24px", borderBottom: `1px solid ${colors.border}`, background: colors.surface, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: colors.text }}>
            {view === "dashboard" && "Dashboard"}
            {view === "tracker" && (selectedReport ? selectedReport.name : "Report Tracker")}
            {view === "analytics" && "Analytics"}
            {view === "activity" && "Activity Log"}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {view === "tracker" && !selectedReport && (
              <button onClick={() => setShowAddModal(true)} style={s.btn("primary")}>
                <i className="ti ti-plus" /> Add Report
              </button>
            )}
            {view === "tracker" && selectedReport && (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setEditingReport(selectedReport)} style={s.btn()}>
                  <i className="ti ti-edit" /> Edit
                </button>
                <button onClick={() => handleDeleteReport(selectedReport.id)} style={{ ...s.btn(), color: "#E24B4A", borderColor: "#E24B4A44" }}>
                  <i className="ti ti-trash" />
                </button>
                <button onClick={() => setSelectedReport(null)} style={s.btn()}>
                  <i className="ti ti-arrow-left" /> Back
                </button>
              </div>
            )}
            <div style={{ width: 34, height: 34, background: colors.accentBg, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: colors.accent }}>
              {currentUser.slice(0, 2)}
            </div>
          </div>
        </div>

        <div style={{ padding: 24, flex: 1 }}>

          {view === "dashboard" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                {[
                  { label: "Total Reports", value: stats.total, icon: "ti-file-description", color: colors.accent },
                  { label: "Backlog", value: stats.backlog, icon: "ti-stack", color: "#888780" },
                  { label: "In Development", value: stats.inDev, icon: "ti-code", color: "#378ADD" },
                  { label: "Under Review", value: stats.review, icon: "ti-eye", color: "#EF9F27" },
                  { label: "Deployed Live", value: stats.deployed, icon: "ti-rocket", color: "#639922" },
                  { label: "Needs Clarification", value: stats.pendingClarification, icon: "ti-help", color: "#E24B4A" },
                ].map(card => (
                  <div key={card.label} style={{ ...s.card, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: colors.textMuted }}>{card.label}</span>
                      <i className={`ti ${card.icon}`} style={{ fontSize: 16, color: card.color }} />
                    </div>
                    <span style={{ fontSize: 26, fontWeight: 600, color: colors.text }}>{card.value}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={s.card}>
                  <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 500, color: colors.textMuted }}>Status distribution</h3>
                  {reports.length === 0 ? <p style={{ color: colors.textMuted, fontSize: 13 }}>No data yet.</p> : (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ percent }) => percent > 0.05 ? `${Math.round(percent * 100)}%` : ""} labelLine={false}>
                          {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {pieData.map(d => (
                      <span key={d.name} style={{ fontSize: 11, color: colors.textMuted, display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, display: "inline-block" }} />
                        {d.name} ({d.value})
                      </span>
                    ))}
                  </div>
                </div>
                <div style={s.card}>
                  <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 500, color: colors.textMuted }}>Reports by module</h3>
                  {reports.length === 0 ? <p style={{ color: colors.textMuted, fontSize: 13 }}>No data yet.</p> : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={barData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                        <XAxis dataKey="module" tick={{ fontSize: 11, fill: colors.textMuted }} />
                        <YAxis tick={{ fontSize: 11, fill: colors.textMuted }} />
                        <Tooltip contentStyle={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8 }} />
                        <Bar dataKey="count" fill={colors.accent} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
              <div style={s.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 500, color: colors.textMuted }}>Recent activity</h3>
                  <button onClick={() => setView("tracker")} style={s.btn()}>View all</button>
                </div>
                {reports.length === 0 ? (
                  <p style={{ color: colors.textMuted, fontSize: 13 }}>No reports yet. Go to Report Tracker to add your first report.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {reports.slice(0, 5).map(r => (
                      <div key={r.id} onClick={() => { setSelectedReport(r); setView("tracker"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 8, background: colors.surface2, cursor: "pointer", gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: colors.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</p>
                          <p style={{ margin: "2px 0 0", fontSize: 12, color: colors.textMuted }}>{r.module} · {r.owner}</p>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                          <StatusBadge statusKey={r.status} small />
                          <span style={{ fontSize: 12, color: colors.textMuted }}>{timeAgo(r.updatedAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {view === "tracker" && !selectedReport && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
                  <i className="ti ti-search" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: colors.textMuted, fontSize: 15 }} />
                  <input style={{ ...s.input, paddingLeft: 32 }} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search reports..." />
                </div>
                <select style={{ ...s.input, width: "auto" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="all">All Statuses</option>
                  {STATUSES.map(st => <option key={st.key} value={st.key}>{st.label}</option>)}
                </select>
                <select style={{ ...s.input, width: "auto" }} value={filterModule} onChange={e => setFilterModule(e.target.value)}>
                  <option value="all">All Modules</option>
                  {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <button onClick={() => setKanbanMode(k => !k)} style={s.btn()}>
                  <i className={`ti ${kanbanMode ? "ti-list" : "ti-layout-kanban"}`} />
                  {kanbanMode ? "List" : "Kanban"}
                </button>
              </div>
              {loading ? (
                <p style={{ color: colors.textMuted, textAlign: "center", padding: "2rem" }}>Loading reports...</p>
              ) : !kanbanMode ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {filteredReports.length === 0 && (
                    <p style={{ color: colors.textMuted, textAlign: "center", padding: "2rem" }}>
                      {reports.length === 0 ? "No reports yet. Click \"Add Report\" to get started." : "No reports match your filters."}
                    </p>
                  )}
                  {filteredReports.map(r => (
                    <div key={r.id} onClick={() => setSelectedReport(r)} style={{ ...s.card, display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: colors.text }}>{r.name}</p>
                          <PriorityBadge priorityKey={r.priority} />
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>{r.module} · {r.owner} · Updated {timeAgo(r.updatedAt)}</p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        <span style={{ fontSize: 12, color: colors.textMuted }}>{(r.remarks || []).length} remarks</span>
                        <StatusBadge statusKey={r.status} />
                        <i className="ti ti-chevron-right" style={{ color: colors.textMuted, fontSize: 16 }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
                  {STATUSES.map(st => {
                    const colReports = filteredReports.filter(r => r.status === st.key);
                    return (
                      <div key={st.key} onDragOver={e => e.preventDefault()} onDrop={() => handleDrop(st.key)} style={{ minWidth: 220, maxWidth: 220, background: colors.surface2, borderRadius: 10, border: `1px solid ${colors.border}`, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: st.text, background: st.bg, padding: "3px 8px", borderRadius: 6 }}>{st.label}</span>
                          <span style={{ fontSize: 12, color: colors.textMuted }}>{colReports.length}</span>
                        </div>
                        {colReports.map(r => (
                          <div key={r.id} draggable onDragStart={() => setDragItem(r.id)} onClick={() => setSelectedReport(r)} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 10, cursor: "grab" }}>
                            <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 500, color: colors.text }}>{r.name}</p>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <PriorityBadge priorityKey={r.priority} />
                              <span style={{ fontSize: 11, color: colors.textMuted }}>{r.owner?.split(" ")[0]}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {view === "tracker" && selectedReport && (
            <ReportDetail
              key={selectedReport.id}
              report={selectedReport}
              colors={colors}
              s={s}
              currentUser={currentUser}
              handleStatusChange={handleStatusChange}
              handleDeleteRemark={handleDeleteRemark}
              db={db}
              serverTimestamp={serverTimestamp}
              updateDoc={updateDoc}
              doc={doc}
            />
          )}

          {view === "analytics" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                <div style={s.card}>
                  <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 500, color: colors.textMuted }}>Pipeline progress</h3>
                  {STATUSES.map(st => {
                    const count = reports.filter(r => r.status === st.key).length;
                    const pct = reports.length > 0 ? Math.round((count / reports.length) * 100) : 0;
                    return (
                      <div key={st.key} style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: colors.text }}>{st.label}</span>
                          <span style={{ fontSize: 12, color: colors.textMuted }}>{count} ({pct}%)</span>
                        </div>
                        <div style={{ height: 6, background: colors.surface2, borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: st.color, borderRadius: 3 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={s.card}>
                  <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 500, color: colors.textMuted }}>Priority breakdown</h3>
                  {PRIORITIES.map(p => {
                    const count = reports.filter(r => r.priority === p.key).length;
                    const pct = reports.length > 0 ? Math.round((count / reports.length) * 100) : 0;
                    return (
                      <div key={p.key} style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: colors.text }}>{p.label}</span>
                          <span style={{ fontSize: 12, color: colors.textMuted }}>{count} ({pct}%)</span>
                        </div>
                        <div style={{ height: 6, background: colors.surface2, borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: p.color, borderRadius: 3 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={s.card}>
                <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 500, color: colors.textMuted }}>Owner workload</h3>
                {reports.length === 0 ? <p style={{ color: colors.textMuted, fontSize: 13 }}>No data yet.</p> : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                    {OWNERS.map(owner => {
                      const owned = reports.filter(r => r.owner === owner);
                      if (!owned.length) return null;
                      return (
                        <div key={owner} style={{ padding: 12, background: colors.surface2, borderRadius: 8, border: `1px solid ${colors.border}` }}>
                          <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 500, color: colors.text }}>{owner}</p>
                          <p style={{ margin: "0 0 8px", fontSize: 12, color: colors.textMuted }}>{owned.length} report{owned.length > 1 ? "s" : ""}</p>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {owned.map(r => <StatusBadge key={r.id} statusKey={r.status} small />)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {view === "activity" && (
            <div style={s.card}>
              <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 500, color: colors.textMuted }}>All report activity</h3>
              {reports.length === 0 ? (
                <p style={{ color: colors.textMuted, fontSize: 13 }}>No activity yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {reports.map((r, i) => (
                    <div key={r.id} style={{ display: "flex", gap: 14, padding: "12px 0", borderBottom: i < reports.length - 1 ? `1px solid ${colors.border}` : "none" }}>
                      <div style={{ width: 36, height: 36, minWidth: 36, borderRadius: "50%", background: colors.accentBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: colors.accent }}>
                        {r.owner?.split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: "0 0 2px", fontSize: 14, color: colors.text, fontWeight: 500 }}>{r.name}</p>
                        <p style={{ margin: 0, fontSize: 12, color: colors.textMuted }}>
                          {r.owner} · {r.module} · {(r.remarks || []).length} remarks
                          {r.lastEditedBy && ` · Last edited by ${r.lastEditedBy}`}
                        </p>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                        <StatusBadge statusKey={r.status} small />
                        <span style={{ fontSize: 11, color: colors.textMuted }}>{fmtDateTime(r.updatedAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {showAddModal && (
        <ReportForm title="Add new report" onSave={handleAddReport} onCancel={() => setShowAddModal(false)} saving={saving} colors={colors} s={s} />
      )}
      {editingReport && (
        <ReportForm title="Edit report" initial={editingReport} onSave={handleEditReport} onCancel={() => setEditingReport(null)} saving={saving} colors={colors} s={s} />
      )}
    </div>
  );
}
