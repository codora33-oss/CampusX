"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type User = { id:string; email:string; username:string; name:string; avatarUrl?:string|null; bio?:string|null; university:string; campus:string; program?:string|null; level?:string|null };
type Post = { id:string; body:string; courseCode?:string|null; createdAt:string; author:{id:string;name:string;username:string;avatarUrl?:string|null;program?:string|null}; _count:{comments:number;reactions:number;shares:number}; group?:{name:string}|null };
type Group = { id:string; name:string; description:string; campus:string; _count:{members:number;posts:number} };
type EventItem = { id:string; title:string; description:string; campus:string; location:string; startsAt:string; _count:{attendees:number}; organizer:{name:string} };
type Person = User;
type Item = {id:string;title:string;description:string;price:number;category:string;condition:string;campus:string;seller:{name:string}};
type Resource = {id:string;title:string;description:string;courseCode?:string|null;url:string;uploader:{name:string}};
type Question = {id:string;title:string;body:string;courseCode?:string|null;_count:{answers:number};author:{name:string}};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function api<T>(path:string, options:RequestInit={}) {
  const r=await fetch(API+path,{...options,credentials:"include",headers:{"Content-Type":"application/json",...(options.headers||{})}});
  if(!r.ok) throw new Error((await r.json().catch(()=>({}))).error || "Request failed");
  return r.status===204 ? undefined as T : await r.json() as T;
}

export default function Home() {
  const [user,setUser]=useState<User|null>(null);
  const [checking,setChecking]=useState(true);
  const [authMode,setAuthMode]=useState<"login"|"register">("login");
  const [authOpen,setAuthOpen]=useState(false);
  const [section,setSection]=useState("Feed");
  const [posts,setPosts]=useState<Post[]>([]);
  const [people,setPeople]=useState<Person[]>([]);
  const [groups,setGroups]=useState<Group[]>([]);
  const [events,setEvents]=useState<EventItem[]>([]);
  const [items,setItems]=useState<Item[]>([]);
  const [resources,setResources]=useState<Resource[]>([]);
  const [questions,setQuestions]=useState<Question[]>([]);
  const [message,setMessage]=useState("");
  const [composer,setComposer]=useState("");
  const [search,setSearch]=useState("");
  const [busy,setBusy]=useState(false);

  useEffect(()=>{api<{user:User}>("/api/v1/auth/me").then(x=>setUser(x.user)).catch(()=>{}).finally(()=>setChecking(false));},[]);
  useEffect(()=>{
    if(!user) return;
    const load=async()=>{
      try {
        if(section==="Feed"){const x=await api<{posts:Post[]}>("/api/v1/feed");setPosts(x.posts);}
        if(section==="People"){const x=await api<{people:Person[]}>("/api/v1/people"+(search?"?q="+encodeURIComponent(search):""));setPeople(x.people);}
        if(section==="Groups"){setGroups((await api<{groups:Group[]}>("/api/v1/groups")).groups);}
        if(section==="Events"){setEvents((await api<{events:EventItem[]}>("/api/v1/events")).events);}
        if(section==="Marketplace"){setItems((await api<{items:Item[]}>("/api/v1/marketplace")).items);}
        if(section==="Resources"){setResources((await api<{resources:Resource[]}>("/api/v1/resources")).resources);}
        if(section==="Questions"){setQuestions((await api<{questions:Question[]}>("/api/v1/questions")).questions);}
      } catch(e){setMessage(e instanceof Error?e.message:"Could not load data");}
    };
    load();
  },[user,section,search]);

  const nav=["Feed","People","Groups","Events","Messages","Marketplace","Resources","Questions"];
  const initials=useMemo(()=>user?.name.split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase()||"CC","[user]");
  const submitAuth=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();setBusy(true);setMessage("");
    const data=Object.fromEntries(new FormData(e.currentTarget).entries());
    try{
      const endpoint=authMode==="login"?"/api/v1/auth/login":"/api/v1/auth/register";
      const x=await api<{user:User}>(endpoint,{method:"POST",body:JSON.stringify(data)});
      setUser(x.user);setAuthOpen(false);
    }catch(e){setMessage(e instanceof Error?e.message:"Authentication failed");}finally{setBusy(false);}
  };
  const createPost=async()=>{
    if(!composer.trim())return;setBusy(true);
    try{const x=await api<{post:Post}>("/api/v1/posts",{method:"POST",body:JSON.stringify({body:composer,visibility:"UNIVERSITY"})});setPosts(p=>[x.post,...p]);setComposer("");}
    catch(e){setMessage(e instanceof Error?e.message:"Could not publish");}finally{setBusy(false);}
  };
  const react=async(id:string)=>{
    try{await api("/api/v1/posts/"+id+"/reaction",{method:"POST"});setPosts(p=>p.map(x=>x.id===id?{...x,_count:{...x._count,reactions:x._count.reactions+1}}:x));}catch(e){setMessage(e instanceof Error?e.message:"Could not react");}
  };
  const logout=async()=>{await api("/api/v1/auth/logout",{method:"POST"}).catch(()=>{});setUser(null);};
  const action=async(path:string,body?:unknown)=>{try{await api(path,{method:"POST",body:body?JSON.stringify(body):undefined});setMessage("Updated");}catch(e){setMessage(e instanceof Error?e.message:"Action failed");}};

  if(checking)return <div className="loading">Loading CampusConnect…</div>;
  if(!user)return <Landing openAuth={(mode)=>{setAuthMode(mode);setAuthOpen(true)}}/>;

  return <div className="app">
    <header className="topbar">
      <button className="brand" onClick={()=>setSection("Feed")}><span className="brandMark">C</span><span>CampusConnect</span></button>
      <div className="search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search students, groups, events…" /></div>
      <div className="topActions"><button className="iconBtn">♡</button><button className="avatar">{initials}</button><button className="profileName" onClick={logout}>{user.name.split(" ")[0]} · Sign out</button></div>
    </header>
    <div className="layout">
      <aside className="sidebar">
        <div className="miniProfile"><div className="avatar large">{initials}</div><strong>{user.name}</strong><span>@{user.username}</span><small>{user.program || "Student"} · {user.campus}</small></div>
        <nav>{nav.map((n,i)=><button key={n} className={section===n?"active":""} onClick={()=>setSection(n)}><span className="navIcon">{["⌂","◎","◈","◷","✉","◇","▣","?"][i]}</span>{n}</button>)}</nav>
        <div className="sideCard"><b>Campus spaces</b><span>Find your people, courses, clubs and study circles.</span></div>
      </aside>
      <main className="content">
        <div className="mobileNav">{nav.map(n=><button className={section===n?"active":""} key={n} onClick={()=>setSection(n)}>{n}</button>)}</div>
        {message&&<div className="notice" onClick={()=>setMessage("")}>{message} <span>×</span></div>}
        {section==="Feed"&&<Feed composer={composer} setComposer={setComposer} createPost={createPost} busy={busy} posts={posts} react={react}/>}
        {section==="People"&&<People people={people} search={search} action={action}/>}
        {section==="Groups"&&<Groups groups={groups} action={action}/>}
        {section==="Events"&&<Events events={events} action={action}/>}
        {section==="Marketplace"&&<Marketplace items={items}/>}
        {section==="Resources"&&<Resources resources={resources}/>}
        {section==="Questions"&&<Questions questions={questions}/>}
        {section==="Messages"&&<Messages people={people}/>}
      </main>
      <aside className="rightbar">
        <div className="card"><div className="cardTitle">Your campus</div><h3>{user.campus}</h3><p>{user.university}</p><div className="statRow"><span><b>Social</b><small>Feed & groups</small></span><span><b>Academic</b><small>Resources & Q&A</small></span></div></div>
        <div className="card"><div className="cardTitle">Make CampusConnect yours</div><p>Join course communities, find study partners, share resources and discover events.</p><button className="outline" onClick={()=>setSection("Groups")}>Explore communities</button></div>
      </aside>
    </div>
    {authOpen&&<AuthModal mode={authMode} setMode={setAuthMode} onClose={()=>setAuthOpen(false)} onSubmit={submitAuth} busy={busy} message={message}/>}
  </div>;
}

function Landing({openAuth}:{openAuth:(m:"login"|"register")=>void}){return <main className="landing"><div className="landingNav"><button className="brand"><span className="brandMark">C</span>CampusConnect</button><div><button className="linkBtn" onClick={()=>openAuth("login")}>Sign in</button><button className="primary small" onClick={()=>openAuth("register")}>Join CampusConnect</button></div></div><section className="landingHero"><div className="eyebrow">BUILT FOR STUDENT LIFE</div><h1>Your campus has a social layer.</h1><p>Connect with classmates. Join communities. Share what matters. Find study partners, resources, events and opportunities — all in one student-first network.</p><div className="heroActions"><button className="primary" onClick={()=>openAuth("register")}>Create your student profile</button><button className="ghost" onClick={()=>openAuth("login")}>I already have an account →</button></div><div className="featureStrip"><span>◉ Student profiles</span><span>◈ Communities</span><span>✉ Messaging</span><span>▣ Resources</span><span>◷ Events</span></div></section><div className="landingGrid"><div><b>One connected campus graph.</b><span>People, posts, groups, courses, events and opportunities reinforce each other.</span></div><div><b>Social first.</b><span>University context lives inside the experience instead of turning it into an administrative dashboard.</span></div><div><b>Private by design.</b><span>Visibility, blocking and moderation controls are built into the product model.</span></div></div></main>}

function Feed({composer,setComposer,createPost,busy,posts,react}:{composer:string;setComposer:(x:string)=>void;createPost:()=>void;busy:boolean;posts:Post[];react:(id:string)=>void}){return <><PageHead title="Campus feed" sub="What’s happening across your student community."/><div className="composer card"><div className="avatar">CC</div><div className="composerBody"><textarea value={composer} onChange={e=>setComposer(e.target.value)} placeholder="Share something with your campus…" /><div className="composerFoot"><span>Everyone at your university can see this.</span><button className="primary" disabled={busy||!composer.trim()} onClick={createPost}>Post</button></div></div></div><div className="feed">{posts.length?posts.map(p=><article className="post card" key={p.id}><div className="postHead"><div className="avatar">{p.author.name.split(" ").map(x=>x[0]).join("").slice(0,2)}</div><div><b>{p.author.name}</b><span>@{p.author.username} · {timeAgo(p.createdAt)}</span>{p.author.program&&<small>{p.author.program}</small>}</div><button className="more">•••</button></div>{p.group&&<div className="context">Posted in {p.group.name}</div>}<p className="postText">{p.body}</p>{p.courseCode&&<span className="tag">{p.courseCode}</span>}<div className="postActions"><button onClick={()=>react(p.id)}>♡ {p._count.reactions}</button><button>◌ {p._count.comments}</button><button>↗ {p._count.shares}</button><button>🔖</button></div></article>):<Empty title="Your feed is waiting" text="Publish the first post for your campus community."/>}</div></>}

function People({people,action}:{people:Person[];search:string;action:(p:string,b?:unknown)=>void}){return <><PageHead title="People" sub="Discover students in your university and find your people."/><div className="gridCards">{people.map(p=><div className="person card" key={p.id}><div className="avatar large">{p.name.split(" ").map(x=>x[0]).join("").slice(0,2)}</div><h3>{p.name}</h3><span>@{p.username}</span><p>{p.program||"Student"} · {p.level||"Campus"}</p><button className="outline" onClick={()=>action("/api/v1/people/"+p.id+"/follow")}>Connect</button></div>)}</div></>}

function Groups({groups,action}:{groups:Group[];action:(p:string,b?:unknown)=>void}){return <><PageHead title="Communities" sub="Course circles, clubs, societies, study groups and campus communities."/><div className="gridCards">{groups.map(g=><div className="group card" key={g.id}><div className="groupCover">◈</div><h3>{g.name}</h3><p>{g.description}</p><span>{g.campus} · {g._count.members} members</span><button className="outline" onClick={()=>action("/api/v1/groups/"+g.id+"/join")}>Join community</button></div>)}</div></>}

function Events({events,action}:{events:EventItem[];action:(p:string,b?:unknown)=>void}){return <><PageHead title="Events" sub="See what’s happening around campus."/><div className="list">{events.map(e=><div className="event card" key={e.id}><div className="date"><b>{new Date(e.startsAt).toLocaleDateString(undefined,{day:"2-digit"})}</b><span>{new Date(e.startsAt).toLocaleDateString(undefined,{month:"short"})}</span></div><div><h3>{e.title}</h3><p>{e.description}</p><span>{e.location} · {e.campus} · {e._count.attendees} going</span></div><button className="outline" onClick={()=>action("/api/v1/events/"+e.id+"/rsvp")}>RSVP</button></div>)}</div></>}

function Marketplace({items}:{items:Item[]}){return <><PageHead title="Student marketplace" sub="Buy and sell useful student-to-student items on your campus."/><div className="gridCards">{items.map(i=><div className="market card" key={i.id}><div className="marketIcon">◇</div><h3>{i.title}</h3><b className="price">{i.price.toLocaleString()} FCFA</b><p>{i.description}</p><span>{i.condition} · {i.category} · {i.campus}</span><button className="outline">Message seller</button></div>)}</div></>}

function Resources({resources}:{resources:Resource[]}){return <><PageHead title="Academic resources" sub="Notes, links and study material shared by students."/><div className="list">{resources.map(r=><div className="resource card" key={r.id}><div className="resourceIcon">▣</div><div><h3>{r.title}</h3><p>{r.description}</p><span>{r.courseCode||"General"} · Shared by {r.uploader.name}</span></div><a className="outline" href={r.url} target="_blank">Open</a></div>)}</div></>}

function Questions({questions}:{questions:Question[]}){return <><PageHead title="Campus Q&A" sub="Ask questions and learn from other students."/><div className="list">{questions.map(q=><div className="question card" key={q.id}><span className="tag">{q.courseCode||"Campus"}</span><h3>{q.title}</h3><p>{q.body}</p><span>{q.author.name} · {q._count.answers} answers</span><button className="outline">View discussion</button></div>)}</div></>}

function Messages({people}:{people:Person[]}){return <><PageHead title="Messages" sub="Private conversations with classmates and study partners."/><div className="emptyChat card"><div className="chatIcon">✉</div><h2>Start a conversation</h2><p>Open a student profile from People and start building your campus network.</p>{people.slice(0,4).map(p=><div className="chatPerson" key={p.id}><div className="avatar">{p.name[0]}</div><span>{p.name}</span><button className="outline">Message</button></div>)}</div></>}

function PageHead({title,sub}:{title:string;sub:string}){return <div className="pageHead"><div><h1>{title}</h1><p>{sub}</p></div><button className="filter">⌄</button></div>}
function Empty({title,text}:{title:string;text:string}){return <div className="empty card"><div>✦</div><h2>{title}</h2><p>{text}</p></div>}
function AuthModal({mode,setMode,onClose,onSubmit,busy,message}:{mode:"login"|"register";setMode:(m:"login"|"register")=>void;onClose:()=>void;onSubmit:(e:FormEvent<HTMLFormElement>)=>void;busy:boolean;message:string}){return <div className="modalBackdrop"><form className="modal" onSubmit={onSubmit}><button type="button" className="close" onClick={onClose}>×</button><div className="brand"><span className="brandMark">C</span>CampusConnect</div><h2>{mode==="login"?"Welcome back":"Join your campus"}</h2><p>{mode==="login"?"Sign in to your student community.":"Create a profile and start connecting."}</p>{mode==="register"&&<><input name="name" required placeholder="Full name"/><input name="username" required placeholder="Username"/><input name="university" required placeholder="University"/><input name="campus" required placeholder="Campus"/></>}<input name="email" type="email" required placeholder="Email address"/><input name="password" type="password" minLength={8} required placeholder="Password"/>{message&&<div className="error">{message}</div>}<button className="primary full" disabled={busy}>{busy?"Working…":mode==="login"?"Sign in":"Create account"}</button><button type="button" className="switch" onClick={()=>setMode(mode==="login"?"register":"login")}>{mode==="login"?"Need an account? Join CampusConnect":"Already registered? Sign in"}</button></form></div>}
function timeAgo(value:string){const s=Math.floor((Date.now()-new Date(value).getTime())/1000);if(s<60)return"now";if(s<3600)return Math.floor(s/60)+"m";if(s<86400)return Math.floor(s/3600)+"h";return Math.floor(s/86400)+"d";}
