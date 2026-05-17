import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronRight, FileText, Folder, FolderGit2, LayoutDashboard, Settings, Users, X, Plus, Pencil, Trash2, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog as ShadcnDialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import "./styles.css";

type Project = any;
type Auth = { setupRequired: boolean; authenticated: boolean };
type Tab = "documents" | "git" | "notifications" | "general";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, ...init });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.json() as Promise<T>;
}

function App() {
  const [auth, setAuth] = useState<Auth>();
  const [route, setRoute] = useState(location.pathname + location.search);
  useEffect(() => { api<Auth>("/api/auth/status").then(setAuth); }, []);
  useEffect(() => {
    const onPop = () => setRoute(location.pathname + location.search);
    addEventListener("popstate", onPop); return () => removeEventListener("popstate", onPop);
  }, []);
  const navigate = (to: string) => { history.pushState({}, "", to); setRoute(to); };
  if (!auth) return <div className="splash">Loading</div>;
  if (auth.setupRequired) return <Setup onDone={() => setAuth({ setupRequired:false, authenticated:false })} />;
  if (!auth.authenticated) return <Login onDone={() => setAuth({ setupRequired:false, authenticated:true })} />;
  return <Shell route={route} navigate={navigate} onLogout={() => setAuth({ setupRequired:false, authenticated:false })} />;
}

function Setup({ onDone }: { onDone: () => void }) {
  return <AuthCard title="Create admin password" action="/api/setup" button="Create admin" onDone={onDone} confirm />;
}
function Login({ onDone }: { onDone: () => void }) {
  return <AuthCard title="Admin login" action="/api/login" button="Login" onDone={onDone} />;
}
function AuthCard({ title, action, button, onDone, confirm }: any) {
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = new FormData(e.currentTarget);
    try { await api(action, { method:"POST", body:JSON.stringify(Object.fromEntries(fd)) }); onDone(); } catch (err:any) { setError(err.message); }
  }
  return <main className="auth">
    <form className="auth-card" onSubmit={submit}>
      <div className="text-2xl font-bold text-primary">DocSyncHub</div>
      <h1 className="text-xl font-semibold text-foreground m-0">{title}</h1>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Field label="Password" name="password" type="password" />
      {confirm && <Field label="Confirm password" name="confirmPassword" type="password" />}
      <Button type="submit" className="w-full">{button}</Button>
    </form>
  </main>;
}

function Shell({ route, navigate, onLogout }: any) {
  const [projects, setProjects] = useState<Project[]>([]);
  const refresh = () => api<Project[]>("/api/projects").then(setProjects);
  useEffect(() => { refresh(); }, []);
  const match = route.match(/^\/projects\/([^/?]+)\/edit/);
  const active = route.startsWith("/projects") ? "projects" : route.startsWith("/users") ? "users" : route.startsWith("/settings") ? "settings" : "dashboard";
  return <div className="app">
    <aside>
      <div className="sidebar-logo">
        <FolderGit2 size={20} className="text-primary" />
        <span>DocSyncHub</span>
      </div>
      <Nav active={active} navigate={navigate} />
      <div className="sidebar-footer">
        <Button variant="ghost" className="w-full justify-start text-slate-400 hover:text-white hover:bg-slate-700" onClick={async()=>{await api("/api/logout",{method:"POST"});onLogout();}}>
          Logout
        </Button>
      </div>
    </aside>
    <section className="main">
      {match ? <ProjectEdit id={match[1]} refresh={refresh} navigate={navigate} /> :
       active==="projects" ? <Projects projects={projects} refresh={refresh} navigate={navigate} /> :
       active==="users" ? <Placeholder title="Users" text="User management comes next." /> :
       active==="settings" ? <SettingsPage /> :
       <Dashboard projects={projects} />}
    </section>
  </div>;
}
function Nav({ active, navigate }: any) {
  const items = [
    ["/dashboard","dashboard","Dashboard",LayoutDashboard],
    ["/projects","projects","Projects",FolderGit2],
    ["/users","users","Users",Users],
    ["/settings","settings","Settings",Settings],
  ];
  return <nav>{items.map(([to,key,lbl,Icon]:any)=>
    <a key={to} href={to} className={active===key?"active":""} onClick={(e)=>{e.preventDefault();navigate(to)}}>
      <Icon size={16}/>{lbl}
    </a>)
  }</nav>;
}
function Dashboard({ projects }: { projects: Project[] }) {
  return <>
    <div className="page-header"><div><h1>Dashboard</h1><p>Operational overview</p></div></div>
    <div className="metrics">
      <Metric label="Projects" value={projects.length}/>
      <Metric label="Mapped docs" value={projects.reduce((n,p)=>n+p.mappings.length,0)}/>
      <Metric label="Active" value={projects.filter(p=>p.mappings.length).length}/>
      <Metric label="Failed" value={projects.filter(p=>p.lastRunStatus==="failed").length}/>
    </div>
  </>;
}
function Projects({ projects, refresh, navigate }: any) {
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState("");
  async function create(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    await api("/api/projects",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});
    setOpen(false); refresh();
  }
  async function remove(id:string){
    if(!confirm("Delete this project?")) return;
    await api(`/api/projects/${id}`,{method:"DELETE"}); refresh();
  }
  const visible=projects.filter((p:any)=>[p.name,p.description,p.destination.provider].filter(Boolean).join(" ").toLowerCase().includes(query.toLowerCase()));
  return <>
    <div className="page-header">
      <div><h1>Projects</h1><p>Manage repository sync targets</p></div>
      <Button onClick={()=>setOpen(true)}><Plus className="mr-2 h-4 w-4" />New project</Button>
    </div>

    {open && <div className="panel">
      <h3 className="text-base font-semibold mb-4">New project</h3>
      <form className="form two" onSubmit={create}>
        <Field label="Name" name="name"/>
        <Field label="Description" name="description"/>
        <Button type="submit" className="self-end mt-2">Create</Button>
      </form>
    </div>}

    <div className="project-table">
      <div className="data-toolbar">
        <b className="text-sm font-semibold">All projects</b>
        <input aria-label="Search projects" placeholder="Search..." value={query} onChange={(e)=>setQuery(e.target.value)} className="w-64 h-9"/>
      </div>
      <div className="project-head"><span>Name</span><span>Provider</span><span>Documents</span><span>Schedule</span><span>Status</span><span></span></div>
      {visible.map((p:any)=><div className="project-row" key={p.id}>
        <div>
          <a className="primary-link" href={`/projects/${p.id}/edit`} onClick={(e)=>{e.preventDefault();navigate(`/projects/${p.id}/edit`)}}>{p.name}</a>
          <small>{p.description||"No description"}</small>
        </div>
        <span className="caps text-sm">{p.destination.provider}</span>
        <span className="text-sm">{p.mappings.length}</span>
        <span className="text-sm">{p.scheduleMinutes} min</span>
        <span><Status value={p.lastRunStatus ?? (p.mappings.length ? "ready" : "empty")} /></span>
        <div className="actions">
          <Button variant="ghost" size="sm" onClick={()=>navigate(`/projects/${p.id}/edit`)}>Edit</Button>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={()=>remove(p.id)}>Delete</Button>
        </div>
      </div>)}
      {!visible.length&&<div className="empty-row">No projects found.</div>}
    </div>
  </>;
}
function ProjectEdit({ id, refresh, navigate }: any) {
  const [p,setP]=useState<Project>();
  const [tab,setTab]=useState<"documents"|"settings">((new URLSearchParams(location.search).get("tab") as any) || "documents");
  useEffect(()=>{api<Project>(`/api/projects/${id}`).then(setP)},[id]);
  const save=(patch:any)=>api<Project>(`/api/projects/${id}`,{method:"PATCH",body:JSON.stringify(patch)}).then(x=>{setP(x);refresh();});
  if(!p)return <div className="splash">Loading</div>;
  return <>
    <div className="page-header">
      <div>
        <h1>{p.name}</h1>
        <p>{p.mappings.length} mappings · {p.destination.provider} · every {p.scheduleMinutes} min</p>
      </div>
      <Button variant="outline" onClick={()=>navigate("/projects")}>Back to projects</Button>
    </div>
    <div className="tabs">
      <button className={tab==="documents"?"active":""} onClick={()=>{setTab("documents");history.replaceState({},"","?tab=documents")}}>
        Document Mapping
      </button>
      <button className={tab==="settings"?"active":""} onClick={()=>{setTab("settings");history.replaceState({},"","?tab=settings")}}>
        Project Settings
      </button>
    </div>
    {tab==="documents"&&<Documents p={p} onChange={setP}/>}
    {tab==="settings"&&<ProjectSettings p={p} save={save}/>}
  </>;
}
function ProjectSettings({p,save}:any){
  const[section,setSection]=useState("general");
  const sections:[string,string][]=[["general","General"],["git","Git configuration"],["notifications","Notifications"]];
  return <div className="settings-layout">
    <nav className="subnav">
      <b>Project Settings</b>
      {sections.map(([key,lbl])=>
        <span key={key} className={section===key?"active":""} onClick={()=>setSection(key)} style={{cursor:"pointer"}}>{lbl}</span>
      )}
    </nav>
    <div className="flex flex-col gap-4">
      {section==="general"&&<GeneralForm p={p} save={save}/>}
      {section==="git"&&<GitForm p={p} save={save}/>}
      {section==="notifications"&&<NotificationsForm p={p} save={save}/>}
    </div>
  </div>;
}
function GitForm({p,save}:any){
  const[d,setD]=useState({...p.destination,github:p.destination.github??{owner:"",repo:""},gitlab:p.destination.gitlab??{projectId:"",baseUrl:"https://gitlab.com"}});
  const[saved,setSaved]=useState(false);
  const handleSave = async () => { await save({destination:d}); setSaved(true); setTimeout(()=>setSaved(false), 2000); };
  return <div className="panel stack-form">
    <h3 className="text-base font-semibold">Git configuration</h3>
    <div className="form two">
      <Select label="Git provider" value={d.provider} options={[["github","GitHub"],["gitlab","GitLab"]]} onChange={(e:any)=>setD({...d,provider:e.target.value})}/>
      <Field label="Sync branch" value={d.branch} onChange={(e:any)=>setD({...d,branch:e.target.value})}/>
      <Field label="Base branch" value={d.baseBranch} onChange={(e:any)=>setD({...d,baseBranch:e.target.value})}/>
    </div>
    {d.provider==="github"
      ? <div className="form two"><Field label="GitHub owner" value={d.github.owner} onChange={(e:any)=>setD({...d,github:{...d.github,owner:e.target.value}})}/><Field label="GitHub repo" value={d.github.repo} onChange={(e:any)=>setD({...d,github:{...d.github,repo:e.target.value}})}/></div>
      : <div className="form two"><Field label="GitLab project id" value={d.gitlab.projectId} onChange={(e:any)=>setD({...d,gitlab:{...d.gitlab,projectId:e.target.value}})}/><Field label="GitLab base URL" value={d.gitlab.baseUrl} onChange={(e:any)=>setD({...d,gitlab:{...d.gitlab,baseUrl:e.target.value}})}/></div>}
    <div className="flex items-center gap-3 mt-2">
      <Button className="w-fit" onClick={handleSave}>Save git configuration</Button>
      {saved&&<span className="ok text-sm text-green-600 font-medium">Saved</span>}
    </div>
  </div>;
}
function GeneralForm({p,save}:any){
  const[x,setX]=useState(p);
  const[saved,setSaved]=useState(false);
  const handleSave = async () => { await save(x); setSaved(true); setTimeout(()=>setSaved(false), 2000); };
  return <div className="panel stack-form">
    <h3 className="text-base font-semibold">General</h3>
    <div className="form two"><Field label="Name" value={x.name} onChange={(e:any)=>setX({...x,name:e.target.value})}/><Field label="Description" value={x.description??""} onChange={(e:any)=>setX({...x,description:e.target.value})}/></div>
    <div className="form three"><Field label="Output folder" value={x.folder} onChange={(e:any)=>setX({...x,folder:e.target.value})}/><Select label="Check frequency" value={x.scheduleMinutes} options={[[5,"Every 5 min"],[15,"Every 15 min"],[30,"Every 30 min"],[60,"Every 60 min"]]} onChange={(e:any)=>setX({...x,scheduleMinutes:Number(e.target.value)})}/><div><span className="label">Change handling</span><Segmented value={x.commitMode} options={["auto_commit","alert_only"]} onChange={(commitMode:any)=>setX({...x,commitMode})}/></div></div>
    <div className="flex items-center gap-3 mt-2">
      <Button className="w-fit" onClick={handleSave}>Save general</Button>
      {saved&&<span className="ok text-sm text-green-600 font-medium">Saved</span>}
    </div>
  </div>;
}
function NotificationsForm({p,save}:any){
  const[n,setN]=useState(p.notifications);
  const[saved,setSaved]=useState(false);
  const channels=[["telegram","Telegram"],["discord","Discord"],["whatsapp","WhatsApp"],["zalo","Zalo"]] as const;
  const [selected,setSelected]=useState("telegram");
  const toggle=(key:string, enabled:boolean)=>setN({...n,[key]:{...n[key],enabled}});
  const set=(key:string,field:string,value:string)=>setN({...n,[key]:{...n[key],[field]:value}});
  const handleSave = async () => { await save({notifications:n}); setSaved(true); setTimeout(()=>setSaved(false), 2000); };
  return <div className="panel stack-form">
    <h3 className="text-base font-semibold">Notifications</h3>
    <div className="form two">
      <Select label="Notification channel" value={selected} options={channels} onChange={(e:any)=>setSelected(e.target.value)}/>
      <label className="check switch"><input type="checkbox" checked={n[selected]?.enabled} onChange={(e)=>toggle(selected,e.target.checked)}/><b>Enabled</b></label>
    </div>
    <section className="channel-editor">
      <h3>{channels.find(([key])=>key===selected)?.[1]}</h3>
      <ChannelFields channel={selected} value={n[selected]} onChange={(field:string,value:string)=>set(selected,field,value)}/>
    </section>
    <div className="enabled-list">{channels.filter(([key])=>n[key]?.enabled).map(([,title])=><span key={title}>{title}</span>)}</div>
    <div className="flex items-center gap-3 mt-2">
      <Button className="w-fit" onClick={handleSave}>Save notification configuration</Button>
      {saved&&<span className="ok text-sm text-green-600 font-medium">Saved</span>}
    </div>
  </div>;
}

function ChannelFields({channel,value,onChange}:any){
  if(channel==="telegram")return <div className="mini-form"><Field label="Bot token" value={value.botToken||value.botTokenEnv||""} onChange={(e:any)=>onChange("botToken",e.target.value)}/><Field label="Chat id" value={value.chatId||value.chatIdEnv||""} onChange={(e:any)=>onChange("chatId",e.target.value)}/></div>;
  if(channel==="discord")return <div className="mini-form"><Field label="Webhook URL" value={value.webhookUrl||value.webhookUrlEnv||""} onChange={(e:any)=>onChange("webhookUrl",e.target.value)}/></div>;
  if(channel==="whatsapp")return <div className="mini-form"><Field label="Access token" value={value.accessToken||value.accessTokenEnv||""} onChange={(e:any)=>onChange("accessToken",e.target.value)}/><Field label="Phone number id" value={value.phoneNumberId||value.phoneNumberIdEnv||""} onChange={(e:any)=>onChange("phoneNumberId",e.target.value)}/></div>;
  return <div className="mini-form"><Field label="Access token" value={value.accessToken||value.accessTokenEnv||""} onChange={(e:any)=>onChange("accessToken",e.target.value)}/><Field label="Group id" value={value.groupId||value.groupIdEnv||""} onChange={(e:any)=>onChange("groupId",e.target.value)}/></div>;
}
function Documents({p,onChange}:any){
  const[editing,setEditing]=useState<any>(null);
  const[isAddDialogOpen,setIsAddDialogOpen]=useState(false);
  const[google,setGoogle]=useState<any>({connected:false});
  const[error,setError]=useState("");
  const[draft,setDraft]=useState<any>({name:"", sourceType:"google_doc", sourceId:"", outputFile:""});

  useEffect(()=>{api("/api/integrations/google/status").then(setGoogle)},[]);
  
  async function add(e:any){
    e.preventDefault();
    if(!draft.sourceId || !draft.outputFile) return;
    const x=await api<Project>(`/api/projects/${p.id}/mappings`,{method:"POST",body:JSON.stringify(draft)});
    onChange(x);
    setDraft({name:"", sourceType:draft.sourceType, sourceId:"", outputFile:""});
    setIsAddDialogOpen(false);
  }
  
  async function update(e:any){
    e.preventDefault();
    const x=await api<Project>(`/api/projects/${p.id}/mappings/${editing.id}`,{method:"PATCH",body:JSON.stringify(editing)});
    onChange(x);
    setEditing(null);
  }
  
  async function remove(id:string){
    if(!confirm("Are you sure you want to delete this mapping?")) return;
    const x=await api<Project>(`/api/projects/${p.id}/mappings/${id}`,{method:"DELETE"});
    onChange(x);
  }
  
  const[syncingMap,setSyncingMap]=useState<Record<string,boolean>>({});
  const[syncMessage,setSyncMessage]=useState<{type:"info"|"success"|"error",text:string}|null>(null);
  const timeoutRef = useRef<any>(null);

  async function syncOne(id:string){
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setSyncingMap(s => ({...s, [id]: true}));
    setSyncMessage({type: "info", text: "Processing: Fetching document and calculating changes..."});
    try {
      const x=await api<Project>(`/api/projects/${p.id}/mappings/${id}/sync`,{method:"POST"});
      onChange(x);
      if(x.lastRunStatus === "success") {
        setSyncMessage({type: "success", text: `Sync completed: ${x.lastRunMessage}`});
      } else {
        setSyncMessage({type: "error", text: `Sync failed: ${x.lastRunMessage}`});
      }
    } catch(err:any) {
      setSyncMessage({type: "error", text: `Error: ${err.message}`});
    } finally {
      setSyncingMap(s => ({...s, [id]: false}));
      timeoutRef.current = setTimeout(() => setSyncMessage(null), 10000);
    }
  }

  return <div className="relative">
    {syncMessage && (
      <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm font-medium border ${syncMessage.type === "info" ? "bg-blue-50 text-blue-700 border-blue-200" : syncMessage.type === "success" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
        {syncMessage.type === "info" && <Loader2 className="h-4 w-4 animate-spin" />}
        {syncMessage.text}
      </div>
    )}
    <div className="flex justify-between items-center mb-4">
      <h3 className="text-lg font-medium">Document Mappings</h3>
      <Button onClick={()=>setIsAddDialogOpen(true)}><Plus className="mr-2 h-4 w-4" /> Add mapping</Button>
    </div>

    <div className="rounded-md border bg-card text-card-foreground">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Source ID</TableHead>
            <TableHead>Output file</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {p.mappings.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No documents mapped yet.</TableCell>
            </TableRow>
          )}
          {p.mappings.map((m:any)=><TableRow key={m.id}>
            <TableCell className="font-medium">{m.name||"Untitled"}</TableCell>
            <TableCell><Badge variant="secondary">{sourceLabel(m.sourceType)}</Badge></TableCell>
            <TableCell><code className="bg-muted px-1.5 py-0.5 rounded text-xs">{m.sourceId||"-"}</code></TableCell>
            <TableCell><code className="bg-muted px-1.5 py-0.5 rounded text-xs">{m.outputFile||"-"}</code></TableCell>
            <TableCell className="text-right whitespace-nowrap">
              <Button variant="ghost" size="icon" title="Edit" onClick={()=>setEditing({...m})}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" title="Sync this document" disabled={syncingMap[m.id]} onClick={()=>syncOne(m.id)}>
                {syncingMap[m.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" title="Delete" className="text-destructive" disabled={syncingMap[m.id]} onClick={()=>remove(m.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
    </div>

    <ShadcnDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Add new document mapping</DialogTitle>
          <DialogDescription>Link a new Google Doc or Lark Doc to this project.</DialogDescription>
        </DialogHeader>
        
        <div className="flex justify-between items-center py-2 border-b">
          <span className="text-sm font-medium">Quick Add from Google Drive</span>
          {google.connected
            ? <GoogleDrivePicker onError={setError} onPick={(doc:any)=>setDraft({...draft, name:doc.name, sourceType:"google_doc", sourceId:doc.id, outputFile:`${slug(doc.name)}.md`})}/>
            : <Button variant="secondary" disabled={!google.configured} title={!google.configured ? "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first" : undefined} onClick={()=>location.href="/api/integrations/google/connect"}>{google.configured ? "Connect Google" : "Google OAuth not configured"}</Button>}
        </div>
        {error&&<p className="text-sm font-medium text-destructive mt-2">{error}</p>}
        
        <form onSubmit={add} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name" value={draft.name} onChange={(e:any)=>setDraft({...draft, name:e.target.value})}/>
            <Select label="Source type" value={draft.sourceType} options={[["google_doc","Google Docs"],["lark_doc","Lark Docs"]]} onChange={(e:any)=>setDraft({...draft, sourceType:e.target.value})}/>
            <Field label="Source id" value={draft.sourceId} onChange={(e:any)=>setDraft({...draft, sourceId:e.target.value})}/>
            <Field label="Output file" value={draft.outputFile} onChange={(e:any)=>setDraft({...draft, outputFile:e.target.value})}/>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={()=>setIsAddDialogOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={!draft.sourceId || !draft.outputFile}>Add mapping</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </ShadcnDialog>

    <ShadcnDialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Edit document mapping</DialogTitle>
        </DialogHeader>
        {editing && <form onSubmit={update} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name" value={editing.name} onChange={(e:any)=>setEditing({...editing,name:e.target.value})}/>
            <Select label="Source type" value={editing.sourceType} options={[["google_doc","Google Docs"],["lark_doc","Lark Docs"]]} onChange={(e:any)=>setEditing({...editing,sourceType:e.target.value})}/>
            <Field label="Source id" value={editing.sourceId} onChange={(e:any)=>setEditing({...editing,sourceId:e.target.value})}/>
            <Field label="Output file" value={editing.outputFile} onChange={(e:any)=>setEditing({...editing,outputFile:e.target.value})}/>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={()=>setEditing(null)}>Cancel</Button>
            <Button type="submit">Save changes</Button>
          </DialogFooter>
        </form>}
      </DialogContent>
    </ShadcnDialog>
  </div>
}
function GoogleDrivePicker({onPick,onError}:any){
  const[open,setOpen]=useState(false);
  const[items,setItems]=useState<any[]>([]);
  const[stack,setStack]=useState<any[]>([{id:"root",name:"My Drive"}]);
  const[current,setCurrent]=useState<any>({id:"root",name:"My Drive"});
  const[loading,setLoading]=useState(false);
  const[search,setSearch]=useState("");
  async function load(folder:any){try{setLoading(true);onError("");setItems(await api(`/api/google/drive/children?parentId=${encodeURIComponent(folder.id)}`));setCurrent(folder)}catch(err:any){onError(err.message)}finally{setLoading(false)}}
  async function performSearch(q:string){try{setLoading(true);onError("");setItems(await api(`/api/google/docs?q=${encodeURIComponent(q)}`));}catch(err:any){onError(err.message)}finally{setLoading(false)}}
  useEffect(()=>{if(!open)return;if(search.trim().length>0){const timer=setTimeout(()=>performSearch(search.trim()),500);return ()=>clearTimeout(timer);}else{void load(current);}},[search,open]);
  async function enter(folder:any){setSearch("");setStack([...stack,folder]);await load(folder)}
  async function jump(index:number){setSearch("");const next=stack.slice(0,index+1);setStack(next);await load(next[next.length-1])}
  function choose(file:any){onPick(file);setOpen(false)}
  return <Dialog.Root open={open} onOpenChange={(next)=>{setOpen(next);if(next&&!search)void load(current)}}>
    <Dialog.Trigger asChild><button className="secondary">Choose Google Doc</button></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay"/>
      <Dialog.Content className="dialog-content">
        <div className="dialog-head"><div><Dialog.Title>Choose Google Doc</Dialog.Title><Dialog.Description>Select a document from Google Drive</Dialog.Description></div><Dialog.Close asChild><button className="icon-button" aria-label="Close"><X size={18}/></button></Dialog.Close></div>
        <div className="toolbar search-toolbar"><input type="search" placeholder="Search docs..." value={search} onChange={(e)=>setSearch(e.target.value)} /></div>
        {!search && <div className="breadcrumbs">{stack.map((folder:any,index:number)=><button key={folder.id} onClick={()=>jump(index)}>{folder.name}{index<stack.length-1&&<ChevronRight size={14}/>}</button>)}</div>}
        <div className={`drive-list ${search ? 'searching' : ''}`}>
          {loading&&<div className="empty-row">Loading...</div>}
          {!loading&&items.map((item:any)=>item.mimeType==="application/vnd.google-apps.folder"
            ? <button className="drive-row" key={item.id} onClick={()=>enter({id:item.id,name:item.name})}><Folder size={18}/><span>{item.name}</span><ChevronRight size={16}/></button>
            : <button className="drive-row doc" key={item.id} onClick={()=>choose(item)}><FileText size={18}/><span>{item.name}</span><small>{new Date(item.modifiedTime).toLocaleString()}</small></button>)}
          {!loading&&!items.length&&<div className="empty-row">{search ? "No docs found." : "No folders or Google Docs in this folder."}</div>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
function SettingsPage(){
  const[section,setSection]=useState("google");
  const sections:[string,string][]=[["google","Google"],["gitlab","GitLab"]];
  return <>
    <div className="page-header"><div><h1>Settings</h1><p>Global integrations</p></div></div>
    <div className="settings-layout">
      <nav className="subnav">
        <b>Integrations</b>
        {sections.map(([key,lbl])=><span key={key} className={section===key?"active":""} onClick={()=>setSection(key)} style={{cursor:"pointer"}}>{lbl}</span>)}
      </nav>
      <div>
        {section==="google"&&<GoogleSettings/>}
        {section==="gitlab"&&<GitLabSettings/>}
      </div>
    </div>
  </>;
}
function GoogleSettings(){
  const[form,setForm]=useState<any>();
  const[saved,setSaved]=useState(false);
  const[status,setStatus]=useState<any>({connected:false});
  useEffect(()=>{api("/api/settings/integrations/google").then(setForm);api("/api/integrations/google/status").then(setStatus)},[]);
  async function save(e:React.FormEvent){e.preventDefault();setForm(await api("/api/settings/integrations/google",{method:"PUT",body:JSON.stringify(form)}));setSaved(true)}
  async function disconnect(){await api("/api/integrations/google/disconnect",{method:"POST"});setStatus({connected:false})}
  if(!form)return <div className="splash">Loading</div>;
  return <div className="flex flex-col gap-4">
    <div className="panel stack-form">
      <h3 className="text-base font-semibold">Google OAuth App</h3>
      <div className="panel" style={{background:"hsl(var(--muted))",padding:"12px 16px"}}>
        <p className="text-sm text-muted-foreground m-0">
          Create an OAuth 2.0 app at <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-primary underline">Google Cloud Console</a>.
          Set the redirect URI to: <code className="bg-card px-1.5 py-0.5 rounded text-xs">{form.appUrl}/api/integrations/google/callback</code>
        </p>
      </div>
      <form onSubmit={save} className="stack-form">
        <div className="form two-wide">
          <Field label="Client ID" value={form.clientId} onChange={(e:any)=>setForm({...form,clientId:e.target.value})}/>
          <Field label="Client secret" type="password" placeholder="Leave blank to keep current secret" value={form.clientSecret} onChange={(e:any)=>setForm({...form,clientSecret:e.target.value})}/>
        </div>
        <Field label="App URL" hint="The public URL users open in the browser" value={form.appUrl} onChange={(e:any)=>setForm({...form,appUrl:e.target.value})}/>
        <div className="flex items-center gap-3">
          <Button type="submit">Save</Button>
          {saved&&<span className="ok">Saved</span>}
        </div>
      </form>
    </div>
    <div className="panel">
      <h3 className="text-base font-semibold mb-3">Connection status</h3>
      {status.connected
        ? <div className="flex items-center justify-between">
            <div>
              <span className="status success">Connected</span>
              {status.email&&<span className="text-sm text-muted-foreground ml-3">{status.email}</span>}
            </div>
            <Button variant="outline" onClick={disconnect}>Disconnect</Button>
          </div>
        : <div className="flex items-center justify-between">
            <span className="status empty">Not connected</span>
            <Button disabled={!status.configured} onClick={()=>location.href="/api/integrations/google/connect"}>
              {status.configured?"Connect Google Account":"Configure OAuth first"}
            </Button>
          </div>}
    </div>
  </div>;
}
function GitLabSettings(){
  const[form,setForm]=useState<any>();
  const[saved,setSaved]=useState(false);
  const[status,setStatus]=useState<any>({connected:false,configured:false});
  useEffect(()=>{api("/api/settings/integrations/gitlab").then(setForm);api("/api/integrations/gitlab/status").then(setStatus)},[]);
  async function save(e:React.FormEvent){e.preventDefault();setForm(await api("/api/settings/integrations/gitlab",{method:"PUT",body:JSON.stringify(form)}));setSaved(true);api("/api/integrations/gitlab/status").then(setStatus)}
  async function disconnect(){await api("/api/integrations/gitlab/disconnect",{method:"POST"});setStatus((s:any)=>({...s,connected:false}))}
  if(!form)return <div className="splash">Loading</div>;
  return <div className="flex flex-col gap-4">
    <div className="panel stack-form">
      <h3 className="text-base font-semibold">GitLab OAuth Application</h3>
      <div className="panel" style={{background:"hsl(var(--muted))",padding:"12px 16px"}}>
        <p className="text-sm text-muted-foreground m-0">
          Create an OAuth app at <a href={`${form.gitlabUrl||"https://gitlab.com"}/-/profile/applications`} target="_blank" rel="noreferrer" className="text-primary underline">GitLab → Profile → Applications</a>.
          Set scopes: <code className="bg-card px-1.5 py-0.5 rounded text-xs">api read_user read_repository write_repository</code>.
          Redirect URI: <code className="bg-card px-1.5 py-0.5 rounded text-xs">{form.appUrl}/api/integrations/gitlab/callback</code>
        </p>
      </div>
      <form onSubmit={save} className="stack-form">
        <div className="form two-wide">
          <Field label="Application ID" value={form.appId} onChange={(e:any)=>setForm({...form,appId:e.target.value})}/>
          <Field label="Application secret" type="password" placeholder="Leave blank to keep current secret" value={form.appSecret} onChange={(e:any)=>setForm({...form,appSecret:e.target.value})}/>
        </div>
        <div className="form two-wide">
          <Field label="App URL" hint="Public URL of this DocSyncHub instance" value={form.appUrl} onChange={(e:any)=>setForm({...form,appUrl:e.target.value})}/>
          <Field label="GitLab URL" hint="Default: https://gitlab.com (change for self-hosted)" value={form.gitlabUrl} onChange={(e:any)=>setForm({...form,gitlabUrl:e.target.value})}/>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit">Save</Button>
          {saved&&<span className="ok">Saved</span>}
        </div>
      </form>
    </div>
    <div className="panel">
      <h3 className="text-base font-semibold mb-3">Connection status</h3>
      {status.connected
        ? <div className="flex items-center justify-between">
            <div>
              <span className="status success">Connected</span>
              {status.username&&<span className="text-sm text-muted-foreground ml-3">@{status.username}</span>}
              {status.email&&<span className="text-sm text-muted-foreground ml-2">({status.email})</span>}
            </div>
            <Button variant="outline" onClick={disconnect}>Disconnect</Button>
          </div>
        : <div className="flex items-center justify-between">
            <span className="status empty">Not connected</span>
            <Button disabled={!status.configured} onClick={()=>location.href="/api/integrations/gitlab/connect"}>
              {status.configured?"Connect GitLab Account":"Configure OAuth App first"}
            </Button>
          </div>}
    </div>
  </div>;
}

function Metric({label,value}:any){return <div className="metric"><span>{label}</span><b>{value}</b></div>}
function Status({value}:any){return <span className={`status ${value}`}>{value}</span>}
function Placeholder({title,text}:any){return <><div className="page-header"><div><h1>{title}</h1><p>{text}</p></div></div><div className="panel empty-row">{text}</div></>}
function tabLabel(t:Tab){return ({documents:"Document mapping",git:"Git configuration",notifications:"Notification configuration",general:"General"} as any)[t]}
function sourceLabel(value:string){return value==="lark_doc"?"Lark Docs":"Google Docs"}
function slug(value:string){return value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}
function Field({label,hint,...props}:any){return <label className="block"><span className="block text-sm font-medium text-foreground mb-1.5">{label}</span><input {...props}/>{hint&&<small className="hint">{hint}</small>}</label>}
function Select({label,options,...props}:any){return <label className="block"><span className="block text-sm font-medium text-foreground mb-1.5">{label}</span><select {...props}>{options.map(([value,text]:any)=><option key={value} value={value}>{text}</option>)}</select></label>}
function Segmented({value,options,onChange}:any){return <div className="segmented">{options.map((o:string)=><button type="button" className={value===o?"active":""} onClick={()=>onChange(o)}>{o.replace("_"," ")}</button>)}</div>}
createRoot(document.getElementById("root")!).render(<App/>);

