import { useState, useEffect, useRef } from "react";
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp, orderBy, query
} from "firebase/firestore";
import { db } from "./firebase";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";

const LOGO_B64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAAAB/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCADTAOoDASIAAhEBAxEB/8QAHQAAAQQDAQEAAAAAAAAAAAAAAAEGBwgCBAUDCf/EAE0QAAEDAwEEBAkKAwMKBwAAAAEAAgMEBREGBxIhMRNBUWEIFCIycYGRodIVFhdCVFaSlbHBI1LRNGJyJDM1Q1OEorLC8EVjdoKTlPH/xAAbAQABBQEBAAAAAAAAAAAAAAAAAQIDBAUGB//EADQRAAIBBAIDED...";

const STATUSES = [
  { key: "backlog", label: "Backlog", color: "#64748B", bg: "#F1F5F9", text: "#334155" },
  { key: "in_development", label: "In Development", color: "#0B5FFF", bg: "#EAF2FF", text: "#0B3DB5" },
  { key: "internal_review", label: "Internal Review", color: "#D97706", bg: "#FFF7ED", text: "#92400E" },
  { key: "sign_off", label: "Sign-Off", color: "#7C3AED", bg: "#F5F3FF", text: "#4C1D95" },
  { key: "client_uat", label: "Client UAT", color: "#3A7BFF", bg: "#EEF4FF", text: "#1E40AF" },
  { key: "pending_clarification", label: "Pending Clarification", color: "#DC2626", bg: "#FEF2F2", text: "#991B1B" },
  { key: "maersk_approved", label: "Maersk Approved", color: "#059669", bg: "#ECFDF5", text: "#065F46" },
  { key: "deployed_live", label: "Deployed Live", color: "#16A34A", bg: "#F0FDF4", text: "#14532D" },
];
const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.key, s]));

const PRIORITIES = [
  { key: "critical", label: "Critical", color: "#DC2626", bg: "#FEF2F2" },
  { key: "high", label: "High", color: "#EA580C", bg: "#FFF7ED" },
  { key: "medium", label: "Medium", color: "#D97706", bg: "#FEFCE8" },
  { key: "low", label: "Low", color: "#16A34A", bg: "#F0FDF4" },
];

const REMARK_CATEGORIES = [
  { key: "data", label: "Data Related", color: "#0B5FFF", bg: "#EAF2FF" },
  { key: "clarification", label: "Clarification Related", color: "#DC2626", bg: "#FEF2F2" },
  { key: "development", label: "Development Related", color: "#059669", bg: "#ECFDF5" },
  { key: "general", label: "General", color: "#64748B", bg: "#F1F5F9" },
];
const REMARK_CAT_MAP = Object.fromEntries(REMARK_CATEGORIES.map(c => [c.key, c]));

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

const MariAppsLogo = ({ size = 36 }) => (
  <img
    src={`data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCABkAGQDASIAAhEBAxEB/8QAGwABAAMBAQEBAAAAAAAAAAAAAAQFBgMHAgH/xAAzEAABAwMCBAQEBgMBAAAAAAABAAIDBAURBiExEkFRYRMicYEUMkJSkbHBIzNiodH/xAAYAQADAQEAAAAAAAAAAAAAAAAAAQIDBP/EAB4RAQEBAQADAQEBAAAAAAAAAAABEQISAxMhMf/aAAwDAQACEQMRAD8A7AAAAAAAAAAAAAAAAAAAAAAA5uaHNIIBB6ELnHhXAoO1cXIIXGPCqDjjdXKl2ZUZqnqGqzKXP4cCbfJFPIrrtomJFRGtVc9SqbmXFVS3FRValfn4LUhVNFVFRV6KuFAAAAAAAAAAAAAAAAAAAAADUx7mORzVVFTkqLhUKh+/DMK9q5VyT6vghNe9rmI5q5a5c8K04vbxjXNVHIqovJVRVyijR0cAAAAAAAAAAAAAAAAAAAAAB0Y8sflex7mPauba1XtVOTkX6VT5LyFIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//Z`}
    alt="MariApps"
    style={{ width: size, height: size, borderRadius: 8, objectFit: "cover" }}
  />
);

const StatusBadge = ({ statusKey, small }) => {
  const s = STATUS_MAP[statusKey];
  if (!s) return null;
  return (
    <span style={{ display: "inline-block", padding: small ? "2px 8px" : "3px 10px", borderRadius: 20, background: s.bg, color: s.text, fontSize: small ? 11 : 12, fontWeight: 600, border: `1px solid ${s.color}33`, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
};

const PriorityBadge = ({ priorityKey }) => {
  const p = PRIORITIES.find(x => x.key === priorityKey);
  if (!p) return null;
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 20, background: p.bg, color: p.color, fontSize: 11, fontWeight: 700, border: `1px solid ${p.color}44` }}>
      {p.label}
    </span>
  );
};

const CatBadge = ({ catKey }) => {
  const c = REMARK_CAT_MAP[catKey] || REMARK_CAT_MAP.general;
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 20, background: c.bg, color: c.color, fontSize: 11, fontWeight: 600, border: `1px solid ${c.color}33` }}>
      {c.label}
    </span>
  );
};

const ClientForm = ({ onSave, onCancel, saving, C, S }) => {
  const [name, setName] = useState("");
  return (
    <div style={S.modal} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={S.modalContent}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, color: C.text, fontWeight: 600 }}>Add Client</h2>
          <button onClick={onCancel} style={{ background: "transparent", border: "none", fontSize: 22, cursor: "pointer", color: C.textMuted }}>×</button>
        </div>
        <label style={S.label}>Client Name *</label>
        <input autoFocus style={S.input} value={name} onChange={e => setName(e.target.value)} placeholder="Enter client name" onKeyDown={e => e.key === "Enter" && name.trim() && onSave(name.trim())} />
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={S.btn()}>Cancel</button>
          <button onClick={() => name.trim() && onSave(name.trim())} style={S.btn("primary")} disabled={saving}>{saving ? "Saving..." : "Add Client"}</button>
        </div>
      </div>
    </div>
  );
};

const ReportForm = ({ initial, onSave, onCancel, title, saving, C, S, clients = [] }) => {
  const [form, setForm] = useState({ name: "", clientId: initial?.clientId || "", module: MODULES[0], owner: OWNERS[0], priority: "high", status: "backlog", ...initial });
  return (
    <div style={S.modal} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={S.modalContent}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, color: C.text, fontWeight: 600 }}>{title}</h2>
          <button onClick={onCancel} style={{ background: "transparent", border: "none", fontSize: 22, cursor: "pointer", color: C.textMuted }}>×</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={S.label}>Client</label>
            <select style={S.input} value={form.clientId || ""} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}>
              <option value="">Unassigned</option>
              {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={S.label}>Report Name *</label>
            <input style={S.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Enter report name" />
          </div>
          <div>
            <label style={S.label}>Module</label>
            <select style={S.input} value={form.module} onChange={e => setForm(f => ({ ...f, module: e.target.value }))}>
              {MODULES.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Report Owner</label>
            <select style={S.input} value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}>
              {OWNERS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Priority</label>
            <select style={S.input} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
              {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Status</label>
            <select style={S.input} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              {STATUSES.map(st => <option key={st.key} value={st.key}>{st.label}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={S.btn()}>Cancel</button>
          <button onClick={() => form.name.trim() && onSave(form)} style={S.btn("primary")} disabled={saving}>
            {saving ? "Saving..." : "Save Report"}
          </button>
        </div>
      </div>
    </div>
  );
};

const ReportDetail = ({ report, C, S, currentUser, handleStatusChange, handleDeleteReport, setEditingReport, setSelectedReport }) => {
  const remarkRef = useRef(null);
  const [remarkCat, setRemarkCat] = useState("general");
  const [editRemarkId, setEditRemarkId] = useState(null);
  const [editRemarkText, setEditRemarkText] = useState("");
  const [activeTab, setActiveTab] = useState("remarks");
  const [devNotes, setDevNotes] = useState(report.devNotes || "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState(report.devNotes || "");
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    setDevNotes(report.devNotes || "");
    setNotesText(report.devNotes || "");
  }, [report.devNotes]);

  const handleAddRemark = async () => {
    const text = remarkRef.current?.value?.trim();
    if (!text) return;
    const remark = {
      id: "rm" + Date.now(),
      text,
      category: remarkCat,
      author: currentUser,
      createdAt: new Date().toISOString(),
      resolved: false,
    };
    try {
      await updateDoc(doc(db, "reports", report.id), {
        remarks: [...(report.remarks || []), remark],
        updatedAt: serverTimestamp(),
      });
    } catch (e) { console.error(e); }
    if (remarkRef.current) remarkRef.current.value = "";
    setRemarkCat("general");
  };

  const handleResolveRemark = async (remarkId) => {
    if (!window.confirm("Mark this clarification as resolved and archive it?")) return;
    try {
      await updateDoc(doc(db, "reports", report.id), {
        remarks: report.remarks.map(r => r.id === remarkId ? { ...r, resolved: true, resolvedAt: new Date().toISOString(), resolvedBy: currentUser } : r),
        updatedAt: serverTimestamp(),
      });
    } catch (e) { console.error(e); }
  };

  const handleDeleteRemark = async (remarkId) => {
    if (!window.confirm("Permanently delete this remark?")) return;
    try {
      await updateDoc(doc(db, "reports", report.id), {
        remarks: report.remarks.filter(r => r.id !== remarkId),
        updatedAt: serverTimestamp(),
      });
    } catch (e) { console.error(e); }
  };

  const handleEditRemark = async (remarkId) => {
    if (!editRemarkText.trim()) return;
    try {
      await updateDoc(doc(db, "reports", report.id), {
        remarks: report.remarks.map(r => r.id === remarkId ? { ...r, text: editRemarkText.trim() } : r),
        updatedAt: serverTimestamp(),
      });
    } catch (e) { console.error(e); }
    setEditRemarkId(null); setEditRemarkText("");
  };

  const handleSaveNotes = async () => {
    try {
      await updateDoc(doc(db, "reports", report.id), {
        devNotes: notesText,
        devNotesUpdatedAt: new Date().toISOString(),
        devNotesUpdatedBy: currentUser,
        updatedAt: serverTimestamp(),
      });
    } catch (e) { console.error(e); }
    setDevNotes(notesText);
    setEditingNotes(false);
  };

  const remarks = report.remarks || [];
  const activeRemarks = remarks.filter(r => !r.resolved);
  const archivedRemarks = remarks.filter(r => r.resolved);
  const pendingClarifications = activeRemarks.filter(r => r.category === "clarification");

  const tabStyle = (key) => ({
    padding: "8px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer", border: "none",
    borderBottom: activeTab === key ? `2px solid ${C.accent}` : "2px solid transparent",
    background: "transparent", color: activeTab === key ? C.accent : C.textMuted,
    transition: "all 0.15s",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ ...S.card, background: `linear-gradient(135deg, #0B5FFF08, #EAF2FF)`, borderColor: "#DCE6F5" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, color: C.text, fontWeight: 700 }}>{report.name}</h2>
            <p style={{ margin: "4px 0 0", color: C.textMuted, fontSize: 13 }}>
              {report.module} · Created {fmtDate(report.createdAt)}{report.createdBy && ` by ${report.createdBy}`}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <PriorityBadge priorityKey={report.priority} />
            <StatusBadge statusKey={report.status} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginTop: 14 }}>
          {[
            { label: "Owner", value: report.owner },
            { label: "Last Updated", value: timeAgo(report.updatedAt) },
            { label: "Active Remarks", value: activeRemarks.length },
            { label: "Pending Clarifications", value: pendingClarifications.length },
          ].map(item => (
            <div key={item.label} style={{ background: "#fff", borderRadius: 8, padding: "10px 12px", border: "1px solid #DCE6F5" }}>
              <p style={{ margin: 0, fontSize: 11, color: C.textMuted, fontWeight: 500 }}>{item.label}</p>
              <p style={{ margin: "2px 0 0", fontSize: 14, color: C.text, fontWeight: 600 }}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pending Clarification Alert */}
      {pendingClarifications.length > 0 && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#991B1B" }}>{pendingClarifications.length} unresolved clarification{pendingClarifications.length > 1 ? "s" : ""} pending</p>
            <p style={{ margin: 0, fontSize: 12, color: "#B91C1C" }}>Review and resolve clarifications before proceeding to next status.</p>
          </div>
        </div>
      )}

      {/* Status Changer */}
      <div style={S.card}>
        <p style={{ ...S.label, marginBottom: 8 }}>Change Status</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {STATUSES.map(st => (
            <button key={st.key} onClick={() => handleStatusChange(report.id, st.key)} style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${st.color}55`, background: report.status === st.key ? st.bg : "transparent", color: report.status === st.key ? st.text : C.textMuted, fontSize: 12, cursor: "pointer", fontWeight: report.status === st.key ? 700 : 400, transition: "all 0.15s" }}>
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={S.card}>
        <div style={{ display: "flex", borderBottom: "1px solid #DCE6F5", marginBottom: 16, gap: 0 }}>
          {[
            { key: "remarks", label: `Remarks (${activeRemarks.length})` },
            { key: "clarifications", label: `Clarification Queue (${pendingClarifications.length})` },
            { key: "devnotes", label: "Developer Notes" },
            { key: "archived", label: `Archived (${archivedRemarks.length})` },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={tabStyle(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Remarks Tab */}
        {activeTab === "remarks" && (
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {activeRemarks.length === 0 && <p style={{ color: C.textMuted, fontSize: 13 }}>No active remarks yet.</p>}
              {activeRemarks.map(rm => (
                <div key={rm.id} style={{ borderRadius: 8, border: "1px solid #DCE6F5", padding: "12px 14px", background: "#F5F8FC" }}>
                  {editRemarkId === rm.id ? (
                    <div>
                      <textarea style={{ ...S.input, height: 70, resize: "vertical", marginBottom: 8 }} value={editRemarkText} onChange={e => setEditRemarkText(e.target.value)} />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => handleEditRemark(rm.id)} style={S.btn("primary")}>Save</button>
                        <button onClick={() => setEditRemarkId(null)} style={S.btn()}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                        <CatBadge catKey={rm.category} />
                        {rm.category === "clarification" && <span style={{ fontSize: 11, color: "#DC2626", fontWeight: 600, background: "#FEF2F2", padding: "2px 8px", borderRadius: 20, border: "1px solid #FECACA" }}>⚠ Pending Resolution</span>}
                      </div>
                      <p style={{ margin: "0 0 8px", fontSize: 14, color: C.text, lineHeight: 1.6 }}>{rm.text}</p>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                        <span style={{ fontSize: 12, color: C.textMuted }}>{rm.author} · {fmtDateTime(rm.createdAt)}</span>
                        <div style={{ display: "flex", gap: 4 }}>
                          {rm.category === "clarification" && (
                            <button onClick={() => handleResolveRemark(rm.id)} style={{ ...S.btn(), padding: "2px 10px", fontSize: 11, color: "#059669", borderColor: "#059669" }}>✓ Resolve</button>
                          )}
                          <button onClick={() => { setEditRemarkId(rm.id); setEditRemarkText(rm.text); }} style={{ ...S.btn(), padding: "2px 8px", fontSize: 11 }}>Edit</button>
                          <button onClick={() => handleDeleteRemark(rm.id)} style={{ ...S.btn(), padding: "2px 8px", fontSize: 11, color: "#DC2626", borderColor: "#FECACA" }}>Delete</button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            {/* Add Remark */}
            <div style={{ borderTop: "1px solid #DCE6F5", paddingTop: 14 }}>
              <p style={{ ...S.label, marginBottom: 8 }}>Add Remark</p>
              <div style={{ marginBottom: 8 }}>
                <label style={S.label}>Category</label>
                <select style={{ ...S.input, width: "auto", minWidth: 200 }} value={remarkCat} onChange={e => setRemarkCat(e.target.value)}>
                  {REMARK_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <textarea ref={remarkRef} style={{ ...S.input, flex: 1, height: 70, resize: "vertical" }} placeholder="Add your remark... (Ctrl+Enter to submit)" onKeyDown={e => e.key === "Enter" && e.ctrlKey && handleAddRemark()} />
                <button onClick={handleAddRemark} style={{ ...S.btn("primary"), alignSelf: "flex-end" }}>Add</button>
              </div>
            </div>
          </div>
        )}

        {/* Clarification Queue Tab */}
        {activeTab === "clarifications" && (
          <div>
            {pendingClarifications.length === 0 ? (
              <div style={{ textAlign: "center", padding: "2rem" }}>
                <p style={{ fontSize: 32, margin: "0 0 8px" }}>✅</p>
                <p style={{ color: C.textMuted, fontSize: 14 }}>No pending clarifications. All clear!</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {pendingClarifications.map((rm, i) => (
                  <div key={rm.id} style={{ borderRadius: 8, border: "1px solid #FECACA", padding: "14px 16px", background: "#FFF5F5" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "#991B1B" }}>Clarification #{i + 1}</p>
                        <p style={{ margin: "0 0 8px", fontSize: 14, color: C.text, lineHeight: 1.6 }}>{rm.text}</p>
                        <span style={{ fontSize: 12, color: "#B91C1C" }}>Raised by {rm.author} · {fmtDateTime(rm.createdAt)}</span>
                      </div>
                      <button onClick={() => handleResolveRemark(rm.id)} style={{ ...S.btn("primary"), background: "#059669", whiteSpace: "nowrap", alignSelf: "flex-start" }}>
                        ✓ Mark Resolved
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Developer Notes Tab */}
        {activeTab === "devnotes" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: C.textMuted }}>Technical documentation, DAX logic, data sources, assumptions</p>
              {!editingNotes && (
                <button onClick={() => setEditingNotes(true)} style={S.btn()}>
                  ✏ Edit Notes
                </button>
              )}
            </div>
            {editingNotes ? (
              <div>
                <textarea
                  style={{ ...S.input, height: 260, resize: "vertical", fontFamily: "monospace", fontSize: 13, lineHeight: 1.7 }}
                  value={notesText}
                  onChange={e => setNotesText(e.target.value)}
                  placeholder={`Document technical details here:\n\n• Report Logic:\n• DAX Calculations:\n• Data Sources:\n• Backend Logic:\n• Assumptions:\n• Implementation Notes:`}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button onClick={handleSaveNotes} style={S.btn("primary")}>Save Notes</button>
                  <button onClick={() => { setEditingNotes(false); setNotesText(devNotes); }} style={S.btn()}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ background: "#F5F8FC", border: "1px solid #DCE6F5", borderRadius: 8, padding: "16px", minHeight: 160 }}>
                {devNotes ? (
                  <>
                    <pre style={{ margin: 0, fontSize: 13, color: C.text, fontFamily: "monospace", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{devNotes}</pre>
                    {report.devNotesUpdatedAt && (
                      <p style={{ margin: "12px 0 0", fontSize: 11, color: C.textMuted }}>Last updated by {report.devNotesUpdatedBy} · {fmtDateTime(report.devNotesUpdatedAt)}</p>
                    )}
                  </>
                ) : (
                  <p style={{ color: C.textMuted, fontSize: 13, margin: 0 }}>No developer notes yet. Click "Edit Notes" to add technical documentation.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Archived Tab */}
        {activeTab === "archived" && (
          <div>
            {archivedRemarks.length === 0 ? (
              <p style={{ color: C.textMuted, fontSize: 13 }}>No archived remarks yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {archivedRemarks.map(rm => (
                  <div key={rm.id} style={{ borderRadius: 8, border: "1px solid #D1FAE5", padding: "12px 14px", background: "#F0FDF4", opacity: 0.85 }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                      <CatBadge catKey={rm.category} />
                      <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>✓ Resolved</span>
                    </div>
                    <p style={{ margin: "0 0 6px", fontSize: 14, color: C.text, lineHeight: 1.6 }}>{rm.text}</p>
                    <p style={{ margin: 0, fontSize: 12, color: C.textMuted }}>
                      Added by {rm.author} · {fmtDateTime(rm.createdAt)}
                      {rm.resolvedBy && ` · Resolved by ${rm.resolvedBy} · ${fmtDateTime(rm.resolvedAt)}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterModule, setFilterModule] = useState("all");
  const [selectedReport, setSelectedReport] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [clientSaving, setClientSaving] = useState(false);
  const [filterClient, setFilterClient] = useState("all");
  const [editingReport, setEditingReport] = useState(null);
  const [kanbanMode, setKanbanMode] = useState(false);
  const [dragItem, setDragItem] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authed) return;
    const q = query(collection(db, "reports"), orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(q, snapshot => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setReports(data);
      setLoading(false);
      setSelectedReport(prev => prev ? (data.find(r => r.id === prev.id) || null) : null);
    });
    return () => unsub();
  }, [authed]);
  
  useEffect(() => {
    if (!authed) return;
    const unsub = onSnapshot(collection(db, "clients"), snapshot => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setClients(data);
    });
    return () => unsub();
  }, [authed]);

  const handleLogin = () => {
    if (CREDENTIALS[loginUser] && CREDENTIALS[loginUser] === loginPass) {
      setCurrentUser(loginUser); setAuthed(true); setLoginErr("");
    } else { setLoginErr("Invalid credentials. Please try again."); }
  };

  const handleAddClient = async (name) => {
    setClientSaving(true);
    try {
      if (clients.some(c => c.name?.trim().toLowerCase() === name.trim().toLowerCase())) {
        alert("A client with this name already exists.");
        return;
      }
      await addDoc(collection(db, "clients"), { name: name.trim(), createdAt: serverTimestamp(), createdBy: currentUser });
      setShowClientModal(false);
    } catch (e) { console.error(e); }
    finally { setClientSaving(false); }
  };

  const handleAddReport = async (data) => {
    setSaving(true);
    try {
      const client = clients.find(c => c.id === data.clientId);
      await addDoc(collection(db, "reports"), { ...data, clientName: client?.name || "Unassigned", remarks: [], devNotes: "", createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: currentUser });
    } catch (e) { console.error(e); }
    setSaving(false); setShowAddModal(false);
  };

  const handleEditReport = async (data) => {
    setSaving(true);
    try {
      const client = clients.find(c => c.id === data.clientId);
      await updateDoc(doc(db, "reports", editingReport.id), { ...data, clientName: client?.name || "Unassigned", updatedAt: serverTimestamp(), lastEditedBy: currentUser });
    } catch (e) { console.error(e); }
    setSaving(false); setEditingReport(null);
  };

  const handleStatusChange = async (reportId, newStatus) => {
    try {
      await updateDoc(doc(db, "reports", reportId), { status: newStatus, updatedAt: serverTimestamp(), lastEditedBy: currentUser });
    } catch (e) { console.error(e); }
  };

  const handleDeleteReport = async (reportId) => {
    if (!window.confirm("Delete this report? This cannot be undone.")) return;
    try { await deleteDoc(doc(db, "reports", reportId)); setSelectedReport(null); } catch (e) { console.error(e); }
  };

  const handleDrop = (statusKey) => {
    if (!dragItem) return;
    handleStatusChange(dragItem, statusKey);
    setDragItem(null);
  };

  const filteredReports = reports.filter(r => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (filterModule !== "all" && r.module !== filterModule) return false;
    if (filterClient !== "all" && r.clientId !== filterClient) return false;
    if (searchTerm && !r.name?.toLowerCase().includes(searchTerm.toLowerCase()) && !r.owner?.toLowerCase().includes(searchTerm.toLowerCase()) && !r.module?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: reports.length,
    backlog: reports.filter(r => r.status === "backlog").length,
    inDev: reports.filter(r => r.status === "in_development").length,
    review: reports.filter(r => ["internal_review", "sign_off", "client_uat"].includes(r.status)).length,
    deployed: reports.filter(r => r.status === "deployed_live").length,
    pending: reports.filter(r => r.status === "pending_clarification").length,
  };

  const pieData = STATUSES.map(s => ({ name: s.label, value: reports.filter(r => r.status === s.key).length, color: s.color })).filter(d => d.value > 0);
  const barData = MODULES.map(m => ({ module: m.length > 8 ? m.slice(0, 8) + "…" : m, count: reports.filter(r => r.module === m).length })).filter(d => d.count > 0);

  const C = {
    bg: darkMode ? "#0F172A" : "#F5F8FC",
    surface: darkMode ? "#1E293B" : "#FFFFFF",
    surface2: darkMode ? "#263248" : "#EAF2FF",
    border: darkMode ? "#334155" : "#DCE6F5",
    text: darkMode ? "#E2E8F0" : "#0F172A",
    textMuted: darkMode ? "#94A3B8" : "#64748B",
    sidebar: darkMode ? "#0F172A" : "#FFFFFF",
    accent: "#072E55",
    accentBg: darkMode ? "#1e3a6e" : "#EAF2FF",
    accentHover: "#0B4A7D",
  };

  const S = {
    card: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "1.25rem", boxShadow: "0 1px 4px rgba(11,95,255,0.06)" },
    btn: (v = "default") => ({
      display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8,
      border: v === "primary" ? "none" : `1px solid ${C.border}`,
      background: v === "primary" ? C.accent : C.surface,
      color: v === "primary" ? "#fff" : C.text,
      fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 0.15s",
    }),
    input: { width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" },
    label: { fontSize: 12, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" },
    modal: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
    modalContent: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(11,95,255,0.15)" },
    navItem: (active) => ({
      display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", cursor: "pointer", borderRadius: 8, margin: "1px 8px",
      background: active ? C.accentBg : "transparent",
      color: active ? C.accent : C.textMuted,
      fontWeight: active ? 600 : 400, fontSize: 14, transition: "all 0.15s", whiteSpace: "nowrap", overflow: "hidden",
      borderLeft: active ? `3px solid ${C.accent}` : "3px solid transparent",
    }),
  };

  const navItems = [
    { key: "dashboard", icon: "ti-layout-dashboard", label: "Dashboard" },
    { key: "tracker", icon: "ti-report-analytics", label: "Report Tracker" },
    { key: "analytics", icon: "ti-chart-bar", label: "Analytics" },
    { key: "activity", icon: "ti-activity", label: "Activity Log" },
  ];

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #072E55 0%, #0B4A7D 55%, #DCEAF5 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', system-ui, sans-serif", padding: 16 }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
        <div style={{ background: "#fff", borderRadius: 20, padding: "2.5rem", width: "100%", maxWidth: 420, boxShadow: "0 25px 60px rgba(11,95,255,0.25)", boxSizing: "border-box" }}>
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <div style={{ width: 80, height: 80, margin: "0 auto 14px", borderRadius: 16, overflow: "hidden", border: "2px solid #EAF2FF", display: "flex", alignItems: "center", justifyContent: "center", background: "#EAF2FF" }}>
              <img src={`data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCABkAGQDASIAAhEBAxEB/8QAGwABAAMBAQEBAAAAAAAAAAAAAAQFBgMHAgH/xAAzEAABAwMCBAQEBgMBAAAAAAABAAIDBAURBiExEkFRYRMicYEUMkJSkbHBIzNiodH/xAAYAQADAQEAAAAAAAAAAAAAAAAAAQIDBP/EAB4RAQEBAQADAQEBAAAAAAAAAAABEQISAxMhMf/aAAwDAQACEQMRAD8A7AAAAAAAAAAAAAAAAAAAAAAA5uaHNIIBB6ELnHhXAoO1cXIIXGPCqDjjdXKl2ZUZqnqGqzKXP4cCbfJFPIrrtomJFRGtVc9SqbmXFVS3FRValfn4LUhVNFVFRV6KuFAAAAAAAAAAAAAAAAAAAAADUx7mORzVVFTkqLhUKh+/DMK9q5VyT6vghNe9rmI5q5a5c8K04vbxjXNVHIqovJVRVyijR0cAAAAAAAAAAAAAAAAAAAAAB0Y8sflex7mPaublBd7VxZj0H/lVkpO1VRHhF7X3VmXFVS3FRValfn4LUhVNFVFRV6KuFAAAAAAAAAAAAAAAAAAAAADUx7mORzVVFTkqLhUKh+/DMK9q5VyT6vghNe9rmI5q5a5c8K04vbxjXNVHIqovJVRVyijR0cAAAAAAAAAAAAAAAAAAAAAB0Y8sflex7mPaublBd7VxZj0H/lVkpO1VRHhF7X3VmXFVS3FRValfn4LUhVNFVFRV6KuFAAAAAAAAAAAAAAAAAAAADUx7mORzVVFTkqLhUKh+/DMK9q5VyT6vghNe9rmI5q5a5c8K04vbxjXNVHIqovJVRVyijR0cAAAAAAAAAAAAAAAAAAAAAB0Y8sflex7mPaubl/2Q==`} alt="MariApps" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#0F172A" }}>MA-BI Portal</h1>
            <p style={{ margin: "6px 0 0", color: "#64748B", fontSize: 14 }}>Report Tracking & Documentation System</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ ...S.label, color: "#64748B" }}>Username</label>
              <input style={S.input} value={loginUser} onChange={e => setLoginUser(e.target.value)} placeholder="Enter username" onKeyDown={e => e.key === "Enter" && handleLogin()} />
            </div>
            <div>
              <label style={{ ...S.label, color: "#64748B" }}>Password</label>
              <input style={S.input} type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)} placeholder="Enter password" onKeyDown={e => e.key === "Enter" && handleLogin()} />
            </div>
            {loginErr && <p style={{ color: "#DC2626", fontSize: 13, margin: 0 }}>{loginErr}</p>}
            <button onClick={handleLogin} style={{ background: "#072E55", color: "#fff", border: "none", padding: "11px 14px", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: "pointer", marginTop: 4 }}>
              Sign In
            </button>
          </div>
          <p style={{ textAlign: "center", marginTop: "1.5rem", fontSize: 12, color: "#94A3B8" }}>Powered by MariApps Marine Solutions</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: C.bg, minHeight: "100vh", color: C.text, display: "flex" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap'); * { box-sizing: border-box; } ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #DCE6F5; border-radius: 10px; } input, select, textarea { font-family: inherit; }`}</style>

      {/* Sidebar */}
      <div style={{ width: sidebarOpen ? 230 : 64, minWidth: sidebarOpen ? 230 : 64, background: C.sidebar, borderRight: `1px solid ${C.border}`, transition: "all 0.2s", display: "flex", flexDirection: "column", height: "100vh", position: "sticky", top: 0, overflow: "hidden", boxShadow: "2px 0 12px rgba(11,95,255,0.06)" }}>
        <div style={{ padding: "14px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, minWidth: 36, borderRadius: 9, overflow: "hidden", border: "1px solid #EAF2FF" }}>
            <img src={`data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCABkAGQDASIAAhEBAxEB/8QAGwABAAMBAQEBAAAAAAAAAAAAAAQFBgMHAgH/xAAzEAABAwMCBAQEBgMBAAAAAAABAAIDBAURBiExEkFRYRMicYEUMkJSkbHBIzNiodH/xAAYAQADAQEAAAAAAAAAAAAAAAAAAQIDBP/EAB4RAQEBAQADAQEBAAAAAAAAAAABEQISAxMhMf/aAAwDAQACEQMRAD8A7AAAAAAAAAAAAAAAAAAAAAAA5uaHNIIBB6ELnHhXAoO1cXIIXGPCqDjjdXKl2ZUZqnqGqzKXP4cCbfJFPIrrtomJFRGtVc9SqbmXFVS3FRValfn4LUhVNFVFRV6KuFAAAAAAAAAAAAAAAAAAAAADUx7mORzVVFTkqLhUKh+/DMK9q5VyT6vghNe9rmI5q5a5c8K04vbxjXNVHIqovJVRVyijR0cAAAAAAAAAAAAAAAAAAAAAB0Y8sflex7mPaublBd7VxZj0H/lVkpO1VRHhF7X3VmXFVS3FRValfn4LUhVNFVFRV6KuFAAAAAAAAAAAAAAAAAAAADUx7mORzVVFTkqLhUKh+/DMK9q5VyT6vghNe9rmI5q5a5c8K04vbxjXNVHIqovJVRVyijR0cAAAAAAAAAAAAAAAAAAAAAB0Y8sflex7mPaubl/2Q==`} alt="MariApps" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          {sidebarOpen && (
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.text }}>MA-BI Portal</p>
              <p style={{ margin: 0, fontSize: 10, color: C.textMuted }}>MariApps</p>
            </div>
          )}
        </div>
        <nav style={{ flex: 1, padding: "10px 0" }}>
          {navItems.map(item => (
            <div key={item.key} onClick={() => { setView(item.key); setSelectedReport(null); }} style={S.navItem(view === item.key)}>
              <i className={`ti ${item.icon}`} style={{ fontSize: 18, minWidth: 18 }} />
              {sidebarOpen && <span>{item.label}</span>}
            </div>
          ))}
        </nav>
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 8px" }}>
          <div style={S.navItem(false)} onClick={() => setDarkMode(d => !d)}>
            <i className={`ti ${darkMode ? "ti-sun" : "ti-moon"}`} style={{ fontSize: 18, minWidth: 18 }} />
            {sidebarOpen && <span>{darkMode ? "Light mode" : "Dark mode"}</span>}
          </div>
          <div style={S.navItem(false)} onClick={() => setSidebarOpen(o => !o)}>
            <i className="ti ti-layout-sidebar-left-collapse" style={{ fontSize: 18, minWidth: 18 }} />
            {sidebarOpen && <span>Collapse</span>}
          </div>
          <div style={S.navItem(false)} onClick={() => { setAuthed(false); setCurrentUser(""); }}>
            <i className="ti ti-logout" style={{ fontSize: 18, minWidth: 18 }} />
            {sidebarOpen && <span>Sign out</span>}
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {/* Topbar */}
        <div style={{ padding: "12px 24px", borderBottom: `1px solid ${C.border}`, background: C.surface, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10, boxShadow: "0 1px 6px rgba(11,95,255,0.06)" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.text }}>
              {view === "dashboard" && "Dashboard"}
              {view === "tracker" && (selectedReport ? selectedReport.name : "Report Tracker")}
              {view === "analytics" && "Analytics"}
              {view === "activity" && "Activity Log"}
            </h1>
            {view === "tracker" && selectedReport && (
              <p style={{ margin: 0, fontSize: 12, color: C.textMuted }}>{selectedReport.module} · {selectedReport.owner}</p>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {view === "dashboard" && (
              <button onClick={() => setShowClientModal(true)} style={{ ...S.btn("primary"), fontWeight: 600 }}>
                <i className="ti ti-building-plus" /> Add Client
              </button>
            )}
            {view === "tracker" && !selectedReport && (
              <button onClick={() => setShowAddModal(true) style={{ ...S.btn("primary"), fontWeight: 600 }}>
                <i className="ti ti-plus" /> Add Report
              </button>
            )}
            {view === "tracker" && selectedReport && (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setEditingReport(selectedReport)} style={S.btn()}>
                  <i className="ti ti-edit" /> Edit
                </button>
                <button onClick={() => handleDeleteReport(selectedReport.id)} style={{ ...S.btn(), color: "#DC2626", borderColor: "#FECACA" }}>
                  <i className="ti ti-trash" />
                </button>
                <button onClick={() => setSelectedReport(null)} style={S.btn()}>
                  <i className="ti ti-arrow-left" /> Back
                </button>
              </div>
            )}
            <div style={{ width: 34, height: 34, background: C.accentBg, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: C.accent, border: `2px solid ${C.accent}33` }}>
              {currentUser.slice(0, 2)}
            </div>
          </div>
        </div>

        <div style={{ padding: 24, flex: 1 }}>

          {/* Dashboard */}
          {view === "dashboard" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18, color: C.text }}>Clients</h2>
                    <p style={{ margin: "3px 0 0", fontSize: 12, color: C.textMuted }}>Manage clients and track their BI reports by status.</p>
                  </div>
                  <span style={{ fontSize: 12, color: C.textMuted }}>{clients.length} client{clients.length === 1 ? "" : "s"}</span>
                </div>
                {clients.length === 0 ? (
                  <div style={{ ...S.card, textAlign: "center", padding: "2.2rem" }}>
                    <i className="ti ti-building-community" style={{ fontSize: 34, color: C.accent }} />
                    <p style={{ margin: "10px 0 4px", fontSize: 15, fontWeight: 600, color: C.text }}>No clients added yet</p>
                    <p style={{ margin: "0 0 14px", fontSize: 12, color: C.textMuted }}>Add your first client to start assigning reports.</p>
                    <button onClick={() => setShowClientModal(true)} style={S.btn("primary")}>+ Add Client</button>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 14 }}>
                    {clients.map(client => {
                      const clientReports = reports.filter(r => r.clientId === client.id);
                      const statusCounts = STATUSES.map(st => ({ ...st, count: clientReports.filter(r => r.status === st.key).length })).filter(st => st.count > 0);
                      return (
                        <div key={client.id} style={{ ...S.card, padding: 0, overflow: "hidden", borderTop: `3px solid ${C.accent}` }}>
                          <div style={{ padding: "15px 16px 12px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                            <div style={{ display: "flex", gap: 11, alignItems: "center", minWidth: 0 }}>
                              <div style={{ width: 40, height: 40, minWidth: 40, borderRadius: 10, background: C.accentBg, color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                                {client.name?.slice(0, 2).toUpperCase()}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{client.name}</p>
                                <p style={{ margin: "3px 0 0", fontSize: 11, color: C.textMuted }}>{clientReports.length} report{clientReports.length === 1 ? "" : "s"}</p>
                              </div>
                            </div>
                            <button onClick={() => { setFilterClient(client.id); setView("tracker"); setSelectedReport(null); }} style={{ ...S.btn(), padding: "5px 9px", fontSize: 11 }}>View Reports</button>
                          </div>
                          <div style={{ padding: "10px 16px 14px", borderTop: `1px solid ${C.border}` }}>
                            {clientReports.length === 0 ? (
                              <p style={{ margin: 0, color: C.textMuted, fontSize: 12 }}>No reports assigned to this client yet.</p>
                            ) : (
                              <>
                                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 9 }}>
                                  {statusCounts.map(st => (
                                    <span key={st.key} style={{ fontSize: 10, padding: "3px 7px", borderRadius: 12, background: st.bg, color: st.text, border: `1px solid ${st.color}33`, fontWeight: 600 }}>
                                      {st.label}: {st.count}
                                    </span>
                                  ))}
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                  {clientReports.slice(0, 3).map(r => (
                                    <div key={r.id} onClick={() => { setSelectedReport(r); setView("tracker"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "7px 9px", borderRadius: 7, background: C.bg, cursor: "pointer" }}>
                                      <span style={{ fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                                      <StatusBadge statusKey={r.status} small />
                                    </div>
                                  ))}
                                  {clientReports.length > 3 && <span style={{ fontSize: 10, color: C.textMuted }}>+{clientReports.length - 3} more report{clientReports.length - 3 === 1 ? "" : "s"}</span>}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
                {[
                  { label: "Total Reports", value: stats.total, icon: "ti-file-description", color: C.accent, bg: "#EAF2FF" },
                  { label: "Backlog", value: stats.backlog, icon: "ti-stack", color: "#64748B", bg: "#F1F5F9" },
                  { label: "In Development", value: stats.inDev, icon: "ti-code", color: "#0B5FFF", bg: "#EAF2FF" },
                  { label: "Under Review", value: stats.review, icon: "ti-eye", color: "#D97706", bg: "#FFF7ED" },
                  { label: "Deployed Live", value: stats.deployed, icon: "ti-rocket", color: "#16A34A", bg: "#F0FDF4" },
                  { label: "Needs Clarification", value: stats.pending, icon: "ti-help", color: "#DC2626", bg: "#FEF2F2" },
                ].map(card => (
                  <div key={card.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", boxShadow: "0 1px 4px rgba(11,95,255,0.05)", borderTop: `3px solid ${card.color}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{card.label}</span>
                      <div style={{ width: 28, height: 28, background: card.bg, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <i className={`ti ${card.icon}`} style={{ fontSize: 15, color: card.color }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 28, fontWeight: 700, color: C.text }}>{card.value}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={S.card}>
                  <h3 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Status Distribution</h3>
                  {reports.length === 0 ? <p style={{ color: C.textMuted, fontSize: 13 }}>No data yet.</p> : (
                    <>
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ percent }) => percent > 0.07 ? `${Math.round(percent * 100)}%` : ""} labelLine={false}>
                            {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                          </Pie>
                          <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                        {pieData.map(d => (
                          <span key={d.name} style={{ fontSize: 10, color: C.textMuted, display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: d.color, display: "inline-block", flexShrink: 0 }} />{d.name} ({d.value})
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div style={S.card}>
                  <h3 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Reports by Module</h3>
                  {reports.length === 0 ? <p style={{ color: C.textMuted, fontSize: 13 }}>No data yet.</p> : (
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={barData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                        <XAxis dataKey="module" tick={{ fontSize: 10, fill: C.textMuted }} />
                        <YAxis tick={{ fontSize: 10, fill: C.textMuted }} />
                        <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
                        <Bar dataKey="count" fill="#072E55" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div style={S.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Recent Activity</h3>
                  <button onClick={() => setView("tracker")} style={S.btn()}>View all</button>
                </div>
                {reports.length === 0 ? (
                  <p style={{ color: C.textMuted, fontSize: 13 }}>No reports yet. Go to Report Tracker to add your first report.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {reports.slice(0, 6).map(r => (
                      <div key={r.id} onClick={() => { setSelectedReport(r); setView("tracker"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 8, background: C.bg, border: `1px solid ${C.border}`, cursor: "pointer", gap: 12, transition: "border-color 0.15s" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</p>
                          <p style={{ margin: "2px 0 0", fontSize: 12, color: C.textMuted }}>{r.module} · {r.owner}</p>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <StatusBadge statusKey={r.status} small />
                          <span style={{ fontSize: 11, color: C.textMuted }}>{timeAgo(r.updatedAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tracker */}
          {view === "tracker" && !selectedReport && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
                  <i className="ti ti-search" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.textMuted, fontSize: 15 }} />
                  <input style={{ ...S.input, paddingLeft: 34 }} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search reports, owners, modules..." />
                </div>
                <select style={{ ...S.input, width: "auto" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="all">All Statuses</option>
                  {STATUSES.map(st => <option key={st.key} value={st.key}>{st.label}</option>)}
                </select>
                <select style={{ ...S.input, width: "auto" }} value={filterModule} onChange={e => setFilterModule(e.target.value)}>
                  <option value="all">All Modules</option>
                  {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <button onClick={() => setKanbanMode(k => !k)} style={S.btn()}>
                  <i className={`ti ${kanbanMode ? "ti-list" : "ti-layout-kanban"}`} />
                  {kanbanMode ? "List View" : "Kanban"}
                </button>
              </div>

              {loading ? (
                <p style={{ color: C.textMuted, textAlign: "center", padding: "3rem" }}>Loading reports...</p>
              ) : !kanbanMode ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {filteredReports.length === 0 && (
                    <div style={{ textAlign: "center", padding: "3rem", color: C.textMuted }}>
                      <p style={{ fontSize: 32, margin: "0 0 8px" }}>📋</p>
                      <p style={{ fontSize: 14 }}>{reports.length === 0 ? "No reports yet. Click \"Add Report\" to get started." : "No reports match your filters."}</p>
                    </div>
                  )}
                  {filteredReports.map(r => {
                    const pendingClar = (r.remarks || []).filter(rm => rm.category === "clarification" && !rm.resolved).length;
                    return (
                      <div key={r.id} onClick={() => setSelectedReport(r)} style={{ ...S.card, display: "flex", alignItems: "center", gap: 14, cursor: "pointer", transition: "border-color 0.15s, box-shadow 0.15s" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.text }}>{r.name}</p>
                            <PriorityBadge priorityKey={r.priority} />
                            {pendingClar > 0 && <span style={{ fontSize: 11, background: "#FEF2F2", color: "#DC2626", padding: "2px 8px", borderRadius: 20, fontWeight: 600, border: "1px solid #FECACA" }}>⚠ {pendingClar} clarification{pendingClar > 1 ? "s" : ""}</span>}
                          </div>
                          <p style={{ margin: 0, fontSize: 13, color: C.textMuted }}>{r.clientName || "Unassigned"} · {r.module} · {r.owner} · Updated {timeAgo(r.updatedAt)}</p>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                          <span style={{ fontSize: 12, color: C.textMuted }}>{(r.remarks || []).length} remarks</span>
                          <StatusBadge statusKey={r.status} />
                          <i className="ti ti-chevron-right" style={{ color: C.textMuted, fontSize: 16 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
                  {STATUSES.map(st => {
                    const colReports = filteredReports.filter(r => r.status === st.key);
                    return (
                      <div key={st.key} onDragOver={e => e.preventDefault()} onDrop={() => handleDrop(st.key)} style={{ minWidth: 210, maxWidth: 210, background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: st.text, background: st.bg, padding: "3px 8px", borderRadius: 6, border: `1px solid ${st.color}33` }}>{st.label}</span>
                          <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 600 }}>{colReports.length}</span>
                        </div>
                        {colReports.map(r => (
                          <div key={r.id} draggable onDragStart={() => setDragItem(r.id)} onClick={() => setSelectedReport(r)} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", cursor: "grab", boxShadow: "0 1px 3px rgba(11,95,255,0.06)" }}>
                            <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600, color: C.text }}>{r.name}</p>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <PriorityBadge priorityKey={r.priority} />
                              <span style={{ fontSize: 11, color: C.textMuted }}>{r.owner?.split(" ")[0]}</span>
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
              C={C} S={S}
              currentUser={currentUser}
              handleStatusChange={handleStatusChange}
              handleDeleteReport={handleDeleteReport}
              setEditingReport={setEditingReport}
              setSelectedReport={setSelectedReport}
            />
          )}

          {/* Analytics */}
          {view === "analytics" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                <div style={S.card}>
                  <h3 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Pipeline Progress</h3>
                  {STATUSES.map(st => {
                    const count = reports.filter(r => r.status === st.key).length;
                    const pct = reports.length > 0 ? Math.round((count / reports.length) * 100) : 0;
                    return (
                      <div key={st.key} style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{st.label}</span>
                          <span style={{ fontSize: 12, color: C.textMuted }}>{count} ({pct}%)</span>
                        </div>
                        <div style={{ height: 6, background: C.bg, borderRadius: 3, overflow: "hidden", border: `1px solid ${C.border}` }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: st.color, borderRadius: 3, transition: "width 0.6s ease" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={S.card}>
                  <h3 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Priority Breakdown</h3>
                  {PRIORITIES.map(p => {
                    const count = reports.filter(r => r.priority === p.key).length;
                    const pct = reports.length > 0 ? Math.round((count / reports.length) * 100) : 0;
                    return (
                      <div key={p.key} style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{p.label}</span>
                          <span style={{ fontSize: 12, color: C.textMuted }}>{count} ({pct}%)</span>
                        </div>
                        <div style={{ height: 6, background: C.bg, borderRadius: 3, overflow: "hidden", border: `1px solid ${C.border}` }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: p.color, borderRadius: 3 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={S.card}>
                <h3 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Owner Workload</h3>
                {reports.length === 0 ? <p style={{ color: C.textMuted, fontSize: 13 }}>No data yet.</p> : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
                    {OWNERS.map(owner => {
                      const owned = reports.filter(r => r.owner === owner);
                      if (!owned.length) return null;
                      return (
                        <div key={owner} style={{ padding: "12px 14px", background: C.bg, borderRadius: 10, border: `1px solid ${C.border}` }}>
                          <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: C.text }}>{owner}</p>
                          <p style={{ margin: "0 0 8px", fontSize: 12, color: C.textMuted }}>{owned.length} report{owned.length > 1 ? "s" : ""}</p>
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

          {/* Activity */}
          {view === "activity" && (
            <div style={S.card}>
              <h3 style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>All Report Activity</h3>
              {reports.length === 0 ? <p style={{ color: C.textMuted, fontSize: 13 }}>No activity yet.</p> : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {reports.map((r, i) => (
                    <div key={r.id} onClick={() => { setSelectedReport(r); setView("tracker"); }} style={{ display: "flex", gap: 14, padding: "12px 0", borderBottom: i < reports.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer" }}>
                      <div style={{ width: 38, height: 38, minWidth: 38, borderRadius: "50%", background: C.accentBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: C.accent, border: `2px solid ${C.accent}22` }}>
                        {r.owner?.split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: "0 0 2px", fontSize: 14, color: C.text, fontWeight: 600 }}>{r.name}</p>
                        <p style={{ margin: 0, fontSize: 12, color: C.textMuted }}>
                          {r.owner} · {r.module} · {(r.remarks || []).length} remarks
                          {r.lastEditedBy && ` · Last edited by ${r.lastEditedBy}`}
                        </p>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                        <StatusBadge statusKey={r.status} small />
                        <span style={{ fontSize: 11, color: C.textMuted }}>{fmtDateTime(r.updatedAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {showClientModal && <ClientForm onSave={handleAddClient} onCancel={() => setShowClientModal(false)} saving={clientSaving} C={C} S={S} />}
      {showAddModal && <ReportForm title="Add New Report" onSave={handleAddReport} onCancel={() => setShowAddModal(false)} saving={saving} C={C} S={S} clients={clients} initial={filterClient !== "all" ? { clientId: filterClient } : undefined} />}
      {editingReport && <ReportForm title="Edit Report" initial={editingReport} onSave={handleEditReport} onCancel={() => setEditingReport(null)} saving={saving} C={C} S={S} clients={clients} />}
    </div>
  );
}
