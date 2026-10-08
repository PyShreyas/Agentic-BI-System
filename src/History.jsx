import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

const RANGES = [
  { key: "day", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
];

const dateKey = (d) => {
  const x = d?.toDate ? d.toDate() : new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  return [x.getFullYear(), String(x.getMonth()+1).padStart(2,"0"), String(x.getDate()).padStart(2,"0")].join("-");
};
const startOfWeek = (d) => {
  const x = new Date(d); const day = x.getDay();
  x.setDate(x.getDate() - (day === 0 ? 6 : day - 1)); x.setHours(0,0,0,0); return x;
};
const niceDate = (v) => {
  if (!v) return "—"; const d = v?.toDate ? v.toDate() : new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
};
const niceDateTime = (v) => {
  if (!v) return "—"; const d = v?.toDate ? v.toDate() : new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
};

export default function History({ C, S, reports }) {
  const [tasks,setTasks] = useState([]);
  const [updates,setUpdates] = useState([]);
  const [range,setRange] = useState("day");
  const [customStart,setCustomStart] = useState("");
  const [customEnd,setCustomEnd] = useState("");
  const [category,setCategory] = useState("all");

  useEffect(() => onSnapshot(collection(db,"tasks"), s => setTasks(s.docs.map(d => ({id:d.id,...d.data()})))), []);
  useEffect(() => onSnapshot(collection(db,"dailyUpdates"), s => setUpdates(s.docs.map(d => ({id:d.id,...d.data()})))), []);

  const filtered = useMemo(() => {
    const now = new Date(); now.setHours(23,59,59,999);
    let start = new Date(); start.setHours(0,0,0,0);
    if (range === "week") start = startOfWeek(new Date());
    if (range === "month") start = new Date(now.getFullYear(),now.getMonth(),1);
    if (range === "custom" && customStart) start = new Date(customStart+"T00:00:00");
    let end = now;
    if (range === "custom" && customEnd) end = new Date(customEnd+"T23:59:59");
    return tasks.filter(t => {
      if (t.status !== "done" || !t.completedAt) return false;
      const completed = t.completedAt?.toDate ? t.completedAt.toDate() : new Date(t.completedAt);
      if (completed < start || completed > end) return false;
      return category === "all" || (t.category || "general") === category;
    }).sort((a,b) => new Date(b.completedAt?.toDate ? b.completedAt.toDate() : b.completedAt) - new Date(a.completedAt?.toDate ? a.completedAt.toDate() : a.completedAt));
  }, [tasks,range,customStart,customEnd,category]);

  const categories = [...new Set(tasks.map(t => t.category).filter(Boolean))].sort();
  const hours = filtered.reduce((sum,t) => sum + Number(t.actualHours || 0),0);
  const high = filtered.filter(t => ["critical","high"].includes(t.priority)).length;
  const reportCount = new Set(filtered.map(t => t.reportId).filter(Boolean)).size;
  const updateHistory = useMemo(() => updates.filter(u => u.completedTasks?.length || u.text).sort((a,b) => String(b.date).localeCompare(String(a.date))).slice(0,10), [updates]);

  return <div style={{display:"flex",flexDirection:"column",gap:16}}>
    <div style={{...S.card,background:"linear-gradient(135deg,"+C.accent+" 0%,#0B5FFF 100%)",border:"none",color:"#fff"}}>
      <div style={{fontSize:10,fontWeight:700,opacity:.72,textTransform:"uppercase",letterSpacing:".08em"}}>Work History</div>
      <h2 style={{margin:"5px 0 3px",fontSize:25}}>Task History</h2>
      <p style={{margin:0,fontSize:13,opacity:.82}}>Review completed BI work by day, week, month or custom period.</p>
    </div>

    <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
      {RANGES.map(r => <button key={r.key} onClick={()=>setRange(r.key)} style={{...S.btn(),background:range===r.key?C.accent:C.surface,color:range===r.key?"#fff":C.text}}>{r.label}</button>)}
      <button onClick={()=>setRange("custom")} style={{...S.btn(),background:range==="custom"?C.accent:C.surface,color:range==="custom"?"#fff":C.text}}>Custom</button>
      {range==="custom" && <>
        <input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)} style={{...S.input,width:"auto"}}/>
        <span style={{color:C.textMuted}}>to</span>
        <input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} style={{...S.input,width:"auto"}}/>
      </>}
      <select value={category} onChange={e=>setCategory(e.target.value)} style={{...S.input,width:"auto",marginLeft:"auto"}}>
        <option value="all">All Categories</option>{categories.map(c=><option key={c}>{c}</option>)}
      </select>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:12}}>
      {[["Completed",filtered.length,"ti-circle-check","#16A34A"],["Hours",hours.toFixed(1),"ti-clock","#0B5FFF"],["High / Critical",high,"ti-flame","#EA580C"],["Reports Worked",reportCount,"ti-report-analytics",C.accent]].map(([label,value,icon,color]) =>
        <div key={label} style={{...S.card,borderTop:"3px solid "+color}}>
          <div style={{fontSize:10,color:C.textMuted,fontWeight:700,textTransform:"uppercase"}}>{label}</div>
          <div style={{fontSize:27,fontWeight:700,color:C.text,marginTop:5}}>{value}</div>
          <i className={"ti "+icon} style={{color,fontSize:16}}/>
        </div>
      )}
    </div>

    <div style={S.card}>
      <h3 style={{margin:"0 0 12px",fontSize:14,color:C.text}}>Completed Tasks</h3>
      {filtered.length===0 ? <div style={{padding:28,textAlign:"center",color:C.textMuted,fontSize:13}}>No completed tasks for this period.</div> :
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {filtered.map(t => {
          const report=reports.find(r=>r.id===t.reportId);
          return <div key={t.id} style={{padding:"11px 12px",border:"1px solid "+C.border,borderRadius:9,background:C.bg,display:"flex",justifyContent:"space-between",gap:12}}>
            <div style={{minWidth:0}}><div style={{fontSize:13,fontWeight:650,color:C.text}}>{t.title}</div><div style={{fontSize:11,color:C.textMuted,marginTop:4}}>{report?.name||"Unlinked task"} · {t.category||"General"}{t.actualHours ? " · "+t.actualHours+"h" : ""}</div></div>
            <div style={{fontSize:11,color:C.textMuted,whiteSpace:"nowrap"}}>{niceDateTime(t.completedAt)}</div>
          </div>;
        })}
      </div>}
    </div>

    <div style={S.card}>
      <h3 style={{margin:"0 0 12px",fontSize:14,color:C.text}}>Daily Work Log</h3>
      {updateHistory.length===0 ? <p style={{color:C.textMuted,fontSize:12}}>Daily snapshots will appear here as work is completed.</p> :
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {updateHistory.map(u => <div key={u.id} style={{padding:"11px 12px",border:"1px solid "+C.border,borderRadius:9,background:C.bg}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:10}}><strong style={{fontSize:12,color:C.text}}>{niceDate(u.date)}</strong><span style={{fontSize:10,color:C.textMuted}}>{u.completedTasks?.length||0} completed · {u.pendingTasks?.length||0} pending</span></div>
          {u.text && <pre style={{whiteSpace:"pre-wrap",fontFamily:"inherit",fontSize:11,lineHeight:1.5,color:C.textMuted,margin:"7px 0 0"}}>{u.text}</pre>}
        </div>)}
      </div>}
    </div>
  </div>;
}
