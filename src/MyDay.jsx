import { useEffect, useMemo, useState } from "react";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp
} from "firebase/firestore";
import { db } from "./firebase";

const TASK_STATUSES = [
  { key:"todo", label:"To Do", color:"#64748B", bg:"#F1F5F9" },
  { key:"in_progress", label:"In Progress", color:"#0B5FFF", bg:"#EAF2FF" },
  { key:"blocked", label:"Blocked", color:"#DC2626", bg:"#FEF2F2" },
  { key:"done", label:"Done", color:"#16A34A", bg:"#F0FDF4" },
];

const PRIORITIES = [
  { key:"critical", label:"Critical", color:"#DC2626", bg:"#FEF2F2" },
  { key:"high", label:"High", color:"#EA580C", bg:"#FFF7ED" },
  { key:"medium", label:"Medium", color:"#D97706", bg:"#FEFCE8" },
  { key:"low", label:"Low", color:"#16A34A", bg:"#F0FDF4" },
];

const TASK_CATEGORIES = [
  { key:"development", label:"Development" },
  { key:"dax", label:"DAX" },
  { key:"sql", label:"SQL" },
  { key:"testing", label:"Testing" },
  { key:"uat", label:"UAT" },
  { key:"documentation", label:"Documentation" },
  { key:"meeting", label:"Meeting" },
  { key:"support", label:"Support" },
  { key:"learning", label:"Learning" },
];

const badge = (item) => ({
  display:"inline-block", padding:"3px 9px", borderRadius:20,
  background:item.bg, color:item.color, fontSize:11, fontWeight:700,
  border:`1px solid ${item.color}33`, whiteSpace:"nowrap"
});

const categoryBadge = {
  display:"inline-block", padding:"3px 8px", borderRadius:20,
  background:"#EEF6FF", color:"#0B5FFF", fontSize:10, fontWeight:700,
  border:"1px solid #CFE1FF", whiteSpace:"nowrap"
};

function dateKey(d=new Date()) {
  const value = d?.toDate ? d.toDate() : new Date(d);
  if (Number.isNaN(value.getTime())) return "";
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0")
  ].join("-");
}
function niceDate(value) {
  if (!value) return "—";
  const d = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
}
function localDateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return dateKey(d);
}
function parseQuickCapture(value, currentTask) {
  const raw = value.trim();
  if (!raw) return currentTask;
  let title = raw;
  let priority = currentTask.priority;
  let dueDate = currentTask.dueDate;

  const priorityMatch = title.match(/(?:^|\s)(critical|high|medium|low)(?:\s|$)/i);
  if (priorityMatch) {
    priority = priorityMatch[1].toLowerCase();
    title = title.replace(priorityMatch[0], " ").replace(/\s+/g, " ").trim();
  }

  if (/\btomorrow\b/i.test(title)) {
    dueDate = localDateOffset(1);
    title = title.replace(/\btomorrow\b/ig, " ").replace(/\s+/g, " ").trim();
  } else if (/\btoday\b/i.test(title)) {
    dueDate = localDateOffset(0);
    title = title.replace(/\btoday\b/ig, " ").replace(/\s+/g, " ").trim();
  }

  return {...currentTask, title, priority, dueDate};
}

export default function MyDay({ C, S, reports, currentUser }) {
  const [tasks,setTasks]=useState([]);
  const [updates,setUpdates]=useState([]);
  const [blockers,setBlockers]=useState([]);
  const [showTask,setShowTask]=useState(false);
  const [showBlocker,setShowBlocker]=useState(false);
  const [quickCapture,setQuickCapture]=useState("");
  const [task,setTask]=useState({title:"",reportId:"",priority:"medium",status:"todo",dueDate:"",estimatedHours:"",category:"development"});
  const [blocker,setBlocker]=useState("");
  const [dailyText,setDailyText]=useState("");
  const [workView,setWorkView]=useState("today");
  const [showCarryover,setShowCarryover]=useState(false);
  const [carryoverTasks,setCarryoverTasks]=useState([]);
  const [carryoverChecked,setCarryoverChecked]=useState(false);

  const today=dateKey();
  const yesterday=localDateOffset(-1);
  useEffect(()=>onSnapshot(collection(db,"tasks"),s=>setTasks(s.docs.map(d=>({id:d.id,...d.data()})))),[]);
  useEffect(()=>onSnapshot(collection(db,"dailyUpdates"),s=>setUpdates(s.docs.map(d=>({id:d.id,...d.data()})))),[]);
  useEffect(()=>onSnapshot(collection(db,"blockers"),s=>setBlockers(s.docs.map(d=>({id:d.id,...d.data()})))),[]);

  const todayUpdate=updates.find(x=>x.date===today);

  useEffect(()=>{
    if(carryoverChecked || !tasks.length) return;
    const pending=tasks.filter(t=>{
      if(t.status==="done") return false;
      const taskDate=t.dueDate || dateKey(t.createdAt);
      return taskDate===yesterday;
    });
    setCarryoverTasks(pending);
    const key=`agenticBiCarryover:${today}`;
    if(pending.length && !localStorage.getItem(key)) setShowCarryover(true);
    setCarryoverChecked(true);
  },[tasks,carryoverChecked,today,yesterday]);

  const buildDailySnapshot=()=>{
    const completedTasks=tasks.filter(t=>t.status==="done" && t.completedAt && dateKey(t.completedAt)===today);
    const pendingTasks=tasks.filter(t=>t.status!=="done" && (t.dueDate===today || dateKey(t.createdAt)===today));
    const blockedTasks=tasks.filter(t=>t.status==="blocked");
    const completedLines=completedTasks.length ? completedTasks.map(t=>`• ${t.title}`).join("\\n") : "• None";
    const pendingLines=pendingTasks.length ? pendingTasks.map(t=>`• ${t.title}`).join("\\n") : "• None";
    const blockedLines=blockedTasks.length ? blockedTasks.slice(0,8).map(t=>`• ${t.title}`).join("\\n") : "• None";
    return {
      completedTaskIds:completedTasks.map(t=>t.id),
      completedTasks:completedTasks.map(t=>t.title),
      pendingTaskIds:pendingTasks.map(t=>t.id),
      pendingTasks:pendingTasks.map(t=>t.title),
      blockedTaskIds:blockedTasks.map(t=>t.id),
      blockedTasks:blockedTasks.map(t=>t.title),
      generatedText:`Completed:\\n${completedLines}\\n\\nPending / Next Focus:\\n${pendingLines}\\n\\nBlocked:\\n${blockedLines}`
    };
  };
  useEffect(()=>{ if(todayUpdate) setDailyText(todayUpdate.text||""); },[todayUpdate?.id,todayUpdate?.text]);

  useEffect(()=>{
    if(!tasks.length) return;
    const snapshot=buildDailySnapshot();
    const timer=setTimeout(async()=>{
      const payload={...snapshot,updatedAt:serverTimestamp(),updatedBy:currentUser};
      if(todayUpdate) await updateDoc(doc(db,"dailyUpdates",todayUpdate.id),payload).catch(()=>{});
      else await addDoc(collection(db,"dailyUpdates"),{date:today,text:snapshot.generatedText,createdAt:serverTimestamp(),...payload}).catch(()=>{});
    },700);
    return ()=>clearTimeout(timer);
  },[tasks.length, tasks.map(t=>`${t.id}:${t.status}:${t.completedAt||""}`).join("|"),todayUpdate?.id]);

  const metrics=useMemo(()=>{
    const completed=tasks.filter(t=>t.status==="done" && t.completedAt && dateKey(t.completedAt)===today).length;
    const blocked=tasks.filter(t=>t.status==="blocked").length;
    const overdue=tasks.filter(t=>t.status!=="done" && t.dueDate && t.dueDate<today).length;
    const high=tasks.filter(t=>t.status!=="done" && ["critical","high"].includes(t.priority)).length;
    return { completed,blocked,overdue,high };
  },[tasks,today]);

  const activeTasks=tasks.filter(t=>t.status!=="done");
  const todayTasks=activeTasks.filter(t=>t.dueDate===today || dateKey(t.createdAt)===today);
  const backlogTasks=activeTasks.filter(t=>!todayTasks.some(x=>x.id===t.id));
  const displayedTasks=(workView==="today"?todayTasks:backlogTasks).slice().sort((a,b)=>{
    const rank={critical:0,high:1,medium:2,low:3};
    return (rank[a.priority]??2)-(rank[b.priority]??2) || String(a.dueDate||"9999").localeCompare(String(b.dueDate||"9999"));
  });
  const dailyTotal=todayTasks.length+metrics.completed;
  const completionPct=dailyTotal ? Math.round((metrics.completed/dailyTotal)*100) : 0;
  const openBlockers=blockers.filter(b=>b.status!=="resolved");
  const staleReports=reports.filter(r=>{
    if(!r.updatedAt || r.status==="deployed_live") return false;
    const d=r.updatedAt?.toDate ? r.updatedAt.toDate() : new Date(r.updatedAt);
    return Date.now()-d.getTime()>3*86400000;
  });

  const resetTask=()=>setTask({title:"",reportId:"",priority:"medium",status:"todo",dueDate:"",estimatedHours:"",category:"development"});
  const closeTaskModal=()=>{ setShowTask(false); setQuickCapture(""); resetTask(); };
  const applyQuickCapture=()=>{
    setTask(current=>parseQuickCapture(quickCapture,current));
  };
  const setDueDate=(value)=>setTask(current=>({...current,dueDate:value}));

  const createTask=async()=>{
    if(!task.title.trim()) return;
    await addDoc(collection(db,"tasks"),{
      ...task,title:task.title.trim(),owner:currentUser,actualHours:"",
      category:task.category||"development",
      createdDate:new Date().toISOString(),createdAt:serverTimestamp(),updatedAt:serverTimestamp()
    });
    closeTaskModal();
  };
  const updateTask=async(id,data)=>{
    const payload={...data,updatedAt:serverTimestamp()};
    if(data.status==="in_progress" && !data.startedAt) payload.startedAt=new Date().toISOString();
    if(data.status==="done" && !data.completedAt) payload.completedAt=new Date().toISOString();
    await updateDoc(doc(db,"tasks",id),payload);
  };
  const removeTask=async(id)=>{
    if(window.confirm("Delete this task?")) await deleteDoc(doc(db,"tasks",id));
  };
  const saveDaily=async()=>{
    const snapshot=buildDailySnapshot();
    const text=dailyText.trim() || snapshot.generatedText;
    const payload={...snapshot,text,updatedAt:serverTimestamp(),updatedBy:currentUser};
    if(todayUpdate) await updateDoc(doc(db,"dailyUpdates",todayUpdate.id),payload);
    else await addDoc(collection(db,"dailyUpdates"),{date:today,createdAt:serverTimestamp(),...payload});
  };
  const createBlocker=async()=>{
    if(!blocker.trim()) return;
    await addDoc(collection(db,"blockers"),{title:blocker.trim(),status:"open",severity:"medium",createdBy:currentUser,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    setBlocker(""); setShowBlocker(false);
  };
  const resolveBlocker=async(id)=>updateDoc(doc(db,"blockers",id),{status:"resolved",resolvedBy:currentUser,resolvedAt:serverTimestamp(),updatedAt:serverTimestamp()});

  const smartBrief = metrics.overdue || metrics.blocked || staleReports.length
    ? `Attention needed: ${metrics.overdue} overdue task(s), ${metrics.blocked} blocked task(s) and ${staleReports.length} stale report(s).`
    : "No urgent issues detected. Focus on your highest-value task and keep today's update current.";

  return <div style={{display:"flex",flexDirection:"column",gap:18}}>
    <div style={{...S.card,background:`linear-gradient(135deg,${C.accent} 0%,#0B5FFF 100%)`,border:"none",color:"#fff"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:14,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:11,fontWeight:700,opacity:.72,textTransform:"uppercase",letterSpacing:".08em"}}>Personal BI Operating System</div>
          <h2 style={{margin:"5px 0 3px",fontSize:25}}>My Day</h2>
          <div style={{fontSize:13,opacity:.82}}>{new Date().toLocaleDateString("en-GB",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})}</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setShowTask(true)} style={{...S.btn(),background:"#fff",color:C.accent,border:"none"}}><i className="ti ti-plus"/> New Task</button>
          <button onClick={()=>setShowBlocker(true)} style={{...S.btn(),background:"#ffffff18",color:"#fff",border:"1px solid #ffffff55"}}><i className="ti ti-alert-triangle"/> Add Blocker</button>
        </div>
      </div>
      <div style={{marginTop:16,padding:"12px 14px",borderRadius:10,background:"#ffffff16",border:"1px solid #ffffff25"}}>
        <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",opacity:.72,marginBottom:4}}>Smart Daily Briefing</div>
        <div style={{fontSize:14,lineHeight:1.5}}>{smartBrief}</div>
      </div>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:12}}>
      {[
        ["Today's Tasks",todayTasks.length,"ti-list-check",C.accent],
        ["Completed Today",metrics.completed,"ti-circle-check","#16A34A"],
        ["Blocked",metrics.blocked,"ti-alert-triangle","#DC2626"],
        ["Overdue",metrics.overdue,"ti-clock-exclamation","#EA580C"],
        ["High Priority",metrics.high,"ti-flame","#D97706"]
      ].map(([label,value,icon,color])=><div key={label} style={{...S.card,padding:"13px 15px",borderTop:`3px solid ${color}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:10,color:C.textMuted,fontWeight:700,textTransform:"uppercase"}}>{label}</span><i className={`ti ${icon}`} style={{color,fontSize:17}}/></div>
        <div style={{fontSize:27,fontWeight:700,color:C.text,marginTop:5}}>{value}</div>
      </div>)}
    </div>

    <div style={S.card}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
        <div><div style={{fontSize:10,fontWeight:700,color:C.textMuted,textTransform:"uppercase"}}>Daily Progress</div><div style={{fontSize:13,color:C.text,marginTop:3}}>{metrics.completed} of {dailyTotal} planned tasks completed</div></div>
        <div style={{fontSize:20,fontWeight:750,color:C.accent}}>{completionPct}%</div>
      </div>
      <div style={{height:7,background:C.bg,borderRadius:6,marginTop:9,overflow:"hidden",border:"1px solid "+C.border}}><div style={{height:"100%",width:completionPct+"%",background:C.accent,borderRadius:6}} /></div>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.6fr) minmax(280px,1fr)",gap:16}}>
      <div style={S.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{display:"flex",gap:6}}><button onClick={()=>setWorkView("today")} style={{...S.btn(),padding:"5px 9px",fontSize:10,background:workView==="today"?C.accent:C.surface,color:workView==="today"?"#fff":C.text}}>Today {todayTasks.length}</button><button onClick={()=>setWorkView("backlog")} style={{...S.btn(),padding:"5px 9px",fontSize:10,background:workView==="backlog"?C.accent:C.surface,color:workView==="backlog"?"#fff":C.text}}>Backlog {backlogTasks.length}</button></div>
          <div><h3 style={{margin:0,fontSize:14,color:C.text}}>{workView==="today"?"Today's Work":"Task Backlog"}</h3><p style={{margin:"3px 0 0",fontSize:11,color:C.textMuted}}>Tasks, deadlines and next actions</p></div>
          <button onClick={()=>setShowTask(true)} style={S.btn("primary")}><i className="ti ti-plus"/> Task</button>
        </div>
        {displayedTasks.length===0?<div style={{padding:28,textAlign:"center",color:C.textMuted,fontSize:13}}>{workView==="today"?"No tasks planned for today.":"No backlog tasks."}</div>:
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {displayedTasks.slice(0,12).map(t=>{
              const report=reports.find(r=>r.id===t.reportId);
              const st=TASK_STATUSES.find(x=>x.key===t.status)||TASK_STATUSES[0];
              const pr=PRIORITIES.find(x=>x.key===t.priority)||PRIORITIES[2];
              const cat=TASK_CATEGORIES.find(x=>x.key===t.category);
              return <div key={t.id} style={{padding:"10px 11px",border:`1px solid ${C.border}`,borderRadius:9,background:C.bg}}>
                <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"flex-start"}}>
                  <div style={{minWidth:0,flex:1}}>
                    <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:13,fontWeight:650,color:C.text}}>{t.title}</span><span style={categoryBadge}>{cat?.label||"General"}</span><span style={badge(st)}>{st.label}</span><span style={badge(pr)}>{pr.label}</span></div>
                    <div style={{fontSize:11,color:C.textMuted,marginTop:5}}>{report?.name||"Unlinked task"}{t.dueDate?` · Due ${niceDate(t.dueDate)}`:""}{t.estimatedHours?` · ${t.estimatedHours}h est.`:""}</div>
                  </div>
                  <select value={t.status||"todo"} onChange={e=>updateTask(t.id,{status:e.target.value,...(e.target.value==="done"?{completedAt:new Date().toISOString()}:{})})} style={{...S.input,width:"auto",padding:"5px 8px",fontSize:11}}>
                    {TASK_STATUSES.map(x=><option key={x.key} value={x.key}>{x.label}</option>)}
                  </select>
                </div>
                <div style={{display:"flex",justifyContent:"flex-end",marginTop:7}}><button onClick={()=>removeTask(t.id)} style={{...S.btn(),padding:"3px 8px",fontSize:10,color:"#DC2626"}}>Delete</button></div>
              </div>;
            })}
          </div>}
      </div>

      <div style={S.card}>
        <h3 style={{margin:"0 0 10px",fontSize:14,color:C.text}}>Action Center</h3>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {metrics.overdue>0 && <div style={{padding:"9px 10px",borderRadius:8,background:"#FEF2F2",border:"1px solid #FECACA",fontSize:12,color:"#991B1B"}}><b>{metrics.overdue}</b> overdue task(s) need attention.</div>}
          {metrics.blocked>0 && <div style={{padding:"9px 10px",borderRadius:8,background:"#FEF2F2",border:"1px solid #FECACA",fontSize:12,color:"#991B1B"}}><b>{metrics.blocked}</b> task(s) are blocked.</div>}
          {staleReports.slice(0,3).map(r=><div key={r.id} style={{padding:"9px 10px",borderRadius:8,background:"#FFF7ED",border:"1px solid #FED7AA",fontSize:12,color:"#9A3412"}}><b>Stale:</b> {r.name}</div>)}
          {openBlockers.slice(0,3).map(b=><div key={b.id} style={{padding:"9px 10px",borderRadius:8,background:"#FFF7ED",border:"1px solid #FED7AA",fontSize:12,color:"#9A3412"}}><b>Blocker:</b> {b.title}</div>)}
          {!metrics.overdue&&!metrics.blocked&&!staleReports.length&&!openBlockers.length&&<div style={{padding:18,textAlign:"center",color:"#16A34A",fontSize:12}}>✓ No urgent actions detected.</div>}
        </div>
      </div>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.4fr) minmax(280px,1fr)",gap:16}}>
      <div style={S.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div><h3 style={{margin:0,fontSize:14,color:C.text}}>Daily Update</h3><p style={{margin:"3px 0 0",fontSize:11,color:C.textMuted}}>Capture completed work, blockers and tomorrow's plan.</p></div><button onClick={saveDaily} style={S.btn("primary")}>Save Update</button></div>
        <textarea style={{...S.input,minHeight:145,resize:"vertical"}} value={dailyText} onChange={e=>setDailyText(e.target.value)} placeholder={"Completed:\n• ...\n\nIn Progress:\n• ...\n\nBlockers:\n• ...\n\nTomorrow:\n• ..."}/>
        {todayUpdate&&<div style={{fontSize:10,color:C.textMuted,marginTop:6}}>Last saved by {todayUpdate.updatedBy||currentUser}</div>}
      </div>

      <div style={S.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div><h3 style={{margin:0,fontSize:14,color:C.text}}>Open Blockers</h3><p style={{margin:"3px 0 0",fontSize:11,color:C.textMuted}}>Items preventing progress</p></div><button onClick={()=>setShowBlocker(true)} style={S.btn()}>+ Blocker</button></div>
        {openBlockers.length===0?<div style={{padding:16,textAlign:"center",color:C.textMuted,fontSize:12}}>No open blockers.</div>:openBlockers.slice(0,6).map(b=><div key={b.id} style={{padding:"9px 10px",border:`1px solid ${C.border}`,borderRadius:8,marginBottom:6}}>
          <div style={{fontSize:12,fontWeight:600,color:C.text}}>{b.title}</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:5}}><span style={{fontSize:10,color:C.textMuted}}>Raised {niceDate(b.createdAt)}</span><button onClick={()=>resolveBlocker(b.id)} style={{...S.btn(),padding:"2px 7px",fontSize:10,color:"#16A34A"}}>Resolve</button></div>
        </div>)}
      </div>
    </div>

    {showCarryover && (
      <div style={S.modal} onClick={e=>e.target===e.currentTarget&&setShowCarryover(false)}>
        <div style={{...S.modalContent,maxWidth:620}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:16}}>
            <div style={{width:42,height:42,borderRadius:11,background:"#FFF7ED",color:"#EA580C",display:"flex",alignItems:"center",justifyContent:"center",fontSize:21}}>↻</div>
            <div>
              <h2 style={{margin:0,fontSize:18,color:C.text}}>Pending from yesterday</h2>
              <p style={{margin:"4px 0 0",fontSize:12,color:C.textMuted}}>You have {carryoverTasks.length} unfinished task{carryoverTasks.length===1?"":"s"} carried over from {niceDate(yesterday)}.</p>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:7,maxHeight:300,overflowY:"auto"}}>
            {carryoverTasks.map(t=>{
              const pr=PRIORITIES.find(p=>p.key===t.priority)||PRIORITIES[2];
              return (
                <div key={t.id} style={{padding:"10px 12px",border:`1px solid ${C.border}`,borderRadius:9,background:C.bg,display:"flex",justifyContent:"space-between",gap:10,alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:650,color:C.text}}>{t.title}</div>
                    <div style={{fontSize:10,color:C.textMuted,marginTop:3}}>{t.category||"General"} · {pr.label}</div>
                  </div>
                  <span style={badge(pr)}>{pr.label}</span>
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:18}}>
            <button onClick={()=>{localStorage.setItem(`agenticBiCarryover:${today}`,"dismissed");setShowCarryover(false);}} style={S.btn()}>Review Later</button>
            <button onClick={async()=>{
              for(const t of carryoverTasks) await updateDoc(doc(db,"tasks",t.id),{dueDate:today,carriedOverFrom:yesterday,updatedAt:serverTimestamp()});
              localStorage.setItem(`agenticBiCarryover:${today}`,"carried");
              setShowCarryover(false);
            }} style={S.btn("primary")}>Carry All to Today</button>
          </div>
        </div>
      </div>
    )}

    {showTask&&<div style={S.modal} onClick={e=>e.target===e.currentTarget&&closeTaskModal()}><div style={S.modalContent}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div><h2 style={{margin:0,fontSize:17,color:C.text}}>New Daily Task</h2><div style={{fontSize:11,color:C.textMuted,marginTop:3}}>Capture the task quickly, then review before saving.</div></div><button onClick={closeTaskModal} style={{background:"transparent",border:0,fontSize:22,cursor:"pointer",color:C.textMuted}}>×</button></div>

      <label style={S.label}>Quick Capture</label>
      <div style={{display:"flex",gap:8}}>
        <input autoFocus style={{...S.input,flex:1}} value={quickCapture} onChange={e=>setQuickCapture(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();applyQuickCapture();}}} placeholder="e.g. Validate PO Sent Date - High - Today"/>
        <button onClick={applyQuickCapture} style={S.btn("primary")}>Parse</button>
      </div>
      <div style={{fontSize:10,color:C.textMuted,marginTop:5}}>Recognizes <b>Critical / High / Medium / Low</b> and <b>Today / Tomorrow</b>.</div>

      <div style={{marginTop:14}}><label style={S.label}>Task *</label><input style={S.input} value={task.title} onChange={e=>setTask({...task,title:e.target.value})} placeholder="e.g. Validate PO Sent Date logic"/></div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:12}}>
        <div><label style={S.label}>Category</label><select style={S.input} value={task.category} onChange={e=>setTask({...task,category:e.target.value})}>{TASK_CATEGORIES.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
        <div><label style={S.label}>Linked Report</label><select style={S.input} value={task.reportId} onChange={e=>setTask({...task,reportId:e.target.value})}><option value="">None</option>{reports.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
        <div><label style={S.label}>Priority</label><select style={S.input} value={task.priority} onChange={e=>setTask({...task,priority:e.target.value})}>{PRIORITIES.map(p=><option key={p.key} value={p.key}>{p.label}</option>)}</select></div>
        <div>
          <label style={S.label}>Due Date</label>
          <div style={{display:"flex",gap:5,marginBottom:6}}>
            <button type="button" onClick={()=>setDueDate(today)} style={{...S.btn(),padding:"4px 7px",fontSize:10,background:task.dueDate===today?C.accent:C.surface,color:task.dueDate===today?"#fff":C.text}}>Today</button>
            <button type="button" onClick={()=>setDueDate(localDateOffset(1))} style={{...S.btn(),padding:"4px 7px",fontSize:10,background:task.dueDate===localDateOffset(1)?C.accent:C.surface,color:task.dueDate===localDateOffset(1)?"#fff":C.text}}>Tomorrow</button>
            <button type="button" onClick={()=>setDueDate("")} style={{...S.btn(),padding:"4px 7px",fontSize:10}}>None</button>
          </div>
          <input type="date" style={S.input} value={task.dueDate} onChange={e=>setDueDate(e.target.value)}/>
        </div>
        <div><label style={S.label}>Estimated Hours</label><input type="number" min="0" step="0.5" style={S.input} value={task.estimatedHours} onChange={e=>setTask({...task,estimatedHours:e.target.value})} placeholder="e.g. 2"/></div>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:18}}><button onClick={closeTaskModal} style={S.btn()}>Cancel</button><button onClick={createTask} style={S.btn("primary")}>Create Task</button></div>
    </div></div>}

    {showBlocker&&<div style={S.modal} onClick={e=>e.target===e.currentTarget&&setShowBlocker(false)}><div style={S.modalContent}>
      <h2 style={{margin:"0 0 14px",fontSize:17,color:C.text}}>Add Blocker</h2><label style={S.label}>Blocker *</label><textarea autoFocus style={{...S.input,minHeight:90}} value={blocker} onChange={e=>setBlocker(e.target.value)} placeholder="What is preventing progress?"/>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:16}}><button onClick={()=>setShowBlocker(false)} style={S.btn()}>Cancel</button><button onClick={createBlocker} style={S.btn("primary")}>Save Blocker</button></div>
    </div></div>}
  </div>;
}
