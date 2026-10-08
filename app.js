import{initializeApp}from"https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import{getAuth,signInAnonymously,onAuthStateChanged}from"https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import{getDatabase,ref,onValue,get,set,push,update,remove}from"https://www.gstatic.com/firebasejs/11.4.0/firebase-database.js";

const firebaseConfig={
  apiKey:"AIzaSyDJUz9GZSfO60bImWbno7MXzSNo1WfPcE0",
  authDomain:"qcm-live-dd3ef.firebaseapp.com",
  databaseURL:"https://qcm-live-dd3ef-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:"qcm-live-dd3ef",
  storageBucket:"qcm-live-dd3ef.firebasestorage.app",
  messagingSenderId:"193182495104",
  appId:"1:193182495104:web:949a778f34d6cd262d5165"
};

const fb=initializeApp(firebaseConfig),
  auth=getAuth(fb),
  db=getDatabase(fb),
  root=document.querySelector('#app'),
  toast=document.querySelector('#toast'),
  L=['A','B','C','D'];
let user=null,stop=null,editingId=null,draft=[],seq=0,toastTimer=null,selfScoreCache=null;

signInAnonymously(auth).catch(e=>notify(e.code+': '+e.message));
onAuthStateChanged(auth,u=>{user=u;document.getElementById('connectionState').textContent=u?'Connecté':'Erreur';if(u)route()});
addEventListener('hashchange',route);

/* ===================== ROUTAGE ===================== */
function route(){
  if(stop){stop();stop=null}
  seq++;
  let h=location.hash||'#home';
  if(h==='#library')return library();
  if(h.startsWith('#editor='))return editor(h.slice(8));
  if(h.startsWith('#host='))return host(norm(h.slice(6)));
  if(h.startsWith('#join='))return join(norm(h.slice(6)));
  home()
}

function home(){
  root.innerHTML=homeTemplate.innerHTML;
  document.getElementById('showJoin').onclick=()=>joinPanel.classList.toggle('hidden');
  const go=()=>{
    let c=norm(joinCode.value);
    if(!/^[A-Z0-9]{6}$/.test(c))return notify('Code invalide');
    location.hash='#join='+c
  };
  joinCodeButton.onclick=go;
  joinCode.onkeydown=e=>{if(e.key==='Enter')go()}
}

/* Écoute plusieurs chemins et appelle cb quand tous ont répondu au moins une fois */
function watch(paths,cb){
  const vals={},seen=new Set();
  const offs=paths.map(p=>onValue(ref(db,p),s=>{
    vals[p]=s.val();seen.add(p);
    if(seen.size===paths.length)cb(vals)
  },e=>notify('Lecture refusée : '+e.message)));
  return()=>offs.forEach(f=>f())
}

/* ===================== BIBLIOTHÈQUE ===================== */
function library(){
  root.innerHTML=libraryTemplate.innerHTML;
  importJsonButton.onclick=()=>importJsonFile.click();
  importExcelButton.onclick=()=>importExcelFile.click();
  importJsonFile.onchange=importJson;
  importExcelFile.onchange=importExcel;
  stop=onValue(ref(db,`quizzes/${user.uid}`),s=>{
    let qs=s.val()||{};
    quizList.innerHTML=Object.entries(qs).map(([id,q])=>`<div class="row"><span><strong>${safe(q.title)}</strong><br><small>${q.questions?.length||0} question(s)</small></span><span class="quiz-actions"><a class="button secondary" href="#editor=${safe(id)}">Modifier</a><button class="button secondary" data-ex="${safe(id)}">Exporter Excel</button><button class="button danger" data-del="${safe(id)}">Supprimer</button><button class="button primary" data-run="${safe(id)}">Lancer</button></span></div>`).join('')||'<p>Aucun QCM enregistré.</p>';
    document.querySelectorAll('[data-ex]').forEach(b=>b.onclick=()=>exportExcel(qs[b.dataset.ex]));
    document.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
      let q=qs[b.dataset.del];
      if(confirm(`Supprimer définitivement le QCM :\n\n${q.title} ?`)){
        try{
          await remove(ref(db,`quizzes/${user.uid}/${b.dataset.del}`));
          notify('QCM supprimé.')
        }catch(e){notify('Suppression impossible : '+e.message)}
      }
    });
    document.querySelectorAll('[data-run]').forEach(b=>b.onclick=()=>launch(qs[b.dataset.run]))
  },e=>notify('Lecture refusée : '+e.message))
}

/* Valide et normalise un QCM (JSON importé, Excel, ou éditeur). Lance une Error si invalide. */
function normQuiz(q){
  if(!q||typeof q!=='object')throw Error('Le fichier ne contient pas un QCM valide.');
  const title=String(q.title??'').trim();
  if(title.length<3)throw Error('Le titre du QCM est manquant (3 caractères minimum).');
  if(!Array.isArray(q.questions)||!q.questions.length)throw Error('Le QCM ne contient aucune question.');
  const questions=q.questions.map((x,i)=>{
    const n=i+1;
    if(!x||typeof x!=='object')throw Error(`Question ${n} invalide.`);
    const text=String(x.text??'').trim();
    if(!text)throw Error(`Question ${n} : énoncé vide.`);
    if(!Array.isArray(x.choices)||x.choices.length!==4)throw Error(`Question ${n} : il faut exactement 4 réponses.`);
    const choices=x.choices.map(c=>String(c??'').trim());
    if(choices.some(c=>!c))throw Error(`Question ${n} : une réponse est vide.`);
    const correctIndexes=[...new Set((Array.isArray(x.correctIndexes)?x.correctIndexes:[]).map(Number).filter(v=>Number.isInteger(v)&&v>=0&&v<=3))];
    if(!correctIndexes.length)throw Error(`Question ${n} : aucune bonne réponse valide.`);
    const p=x.partial||{};
    return{
      id:'q'+n,text,choices,correctIndexes,
      partial:{enabled:!!p.enabled,requiredCorrectCount:num(p.requiredCorrectCount,2),points:num(p.points,.5)},
      explanation:String(x.explanation??'').trim()
    }
  });
  return{title,description:String(q.description??'').trim(),questions}
}

async function importJson(e){
  let f=e.target.files[0];
  if(!f)return;
  try{
    let q=normQuiz(JSON.parse(await f.text())),id=push(ref(db,`quizzes/${user.uid}`)).key;
    await set(ref(db,`quizzes/${user.uid}/${id}`),{...q,createdAt:Date.now(),updatedAt:Date.now(),importedFrom:'JSON',sourceFileName:f.name});
    notify('QCM JSON importé')
  }catch(x){notify('Import JSON impossible : '+x.message)}
  e.target.value=''
}

async function importExcel(e){
  let f=e.target.files[0];
  if(!f)return;
  try{
    if(!window.XLSX)throw Error('La bibliothèque Excel est indisponible.');
    let wb=XLSX.read(await f.arrayBuffer(),{type:'array'}),
      ws=wb.Sheets[wb.SheetNames[0]],
      rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
    if(!rows.length)throw Error('La première feuille ne contient aucune question.');
    let title=String(rows[0]['Titre du QCM']||'').trim(),
      description=String(rows[0]['Description']||'').trim();
    if(!title)throw Error('La colonne « Titre du QCM » doit être remplie sur la première ligne.');
    let questions=rows.map((r,i)=>{
      let text=String(r['Question']||'').trim(),
        choices=['Réponse A','Réponse B','Réponse C','Réponse D'].map(k=>String(r[k]||'').trim()),
        correctIndexes=parseAnswers(r['Bonnes réponses']);
      if(!text)throw Error(`Question vide à la ligne ${i+2}.`);
      if(choices.some(x=>!x))throw Error(`Une réponse A, B, C ou D est vide à la ligne ${i+2}.`);
      if(!correctIndexes.length)throw Error(`Bonnes réponses invalides à la ligne ${i+2}.`);
      return{
        id:'q'+(i+1),text,choices,correctIndexes,
        partial:{
          enabled:String(r['Note partielle']||'').trim().toUpperCase()==='OUI',
          requiredCorrectCount:num(r['Nombre bonnes réponses'],2),
          points:num(r['Points partiels'],.5)
        },
        explanation:String(r['Explication']||'').trim()
      }
    });
    let q=normQuiz({title,description,questions}),id=push(ref(db,`quizzes/${user.uid}`)).key;
    await set(ref(db,`quizzes/${user.uid}/${id}`),{...q,createdAt:Date.now(),updatedAt:Date.now(),importedFrom:'Excel',sourceFileName:f.name});
    notify(`QCM Excel importé : ${q.questions.length} question(s).`)
  }catch(x){console.error(x);notify('Import Excel impossible : '+x.message)}
  e.target.value=''
}

/* ===================== ÉDITEUR ===================== */
async function editor(v){
  const my=seq;
  editingId=v==='new'?null:v;
  root.innerHTML=editorTemplate.innerHTML;
  if(editingId){
    let q;
    try{q=(await get(ref(db,`quizzes/${user.uid}/${editingId}`))).val()}catch(e){notify('Lecture impossible : '+e.message)}
    if(my!==seq)return;
    if(!q){notify('QCM introuvable.');location.hash='#library';return}
    document.getElementById('editorHeading').textContent='Modifier le QCM';
    quizTitle.value=q.title||'';
    quizDescription.value=q.description||'';
    draft=(q.questions||[]).map(x=>({...blank(),...x,partial:{...blank().partial,...(x.partial||{})},correctIndexes:x.correctIndexes||[]}));
    if(!draft.length)draft=[blank()]
  }else draft=[blank()];
  addQuestion.onclick=()=>{draft.push(blank());draw()};
  document.getElementById('saveQuiz').onclick=saveQuizDraft;
  draw()
}

function draw(){
  questionsEditor.innerHTML=draft.map((q,i)=>`<section class="question-editor"><h2>Question ${i+1}</h2><label>Énoncé<input class="qt" data-q="${i}" value="${safe(q.text)}"></label>${q.choices.map((c,j)=>`<label class="choice-editor"><input class="ok" data-q="${i}" data-c="${j}" type="checkbox" ${q.correctIndexes.includes(j)?'checked':''}><input class="ct" data-q="${i}" data-c="${j}" value="${safe(c)}" placeholder="Réponse ${L[j]}"></label>`).join('')}<label><input class="partial" data-q="${i}" type="checkbox" ${q.partial?.enabled?'checked':''}> Note partielle</label><div class="partial-fields ${q.partial?.enabled?'':'hidden'}"><label>Nombre de bonnes réponses requis<input class="prc" data-q="${i}" type="number" min="1" max="4" value="${safe(q.partial?.requiredCorrectCount??2)}"></label><label>Points partiels (entre 0 et 1)<input class="ppt" data-q="${i}" type="number" min="0" max="1" step="0.25" value="${safe(q.partial?.points??.5)}"></label></div><label>Explication (colonne L Excel)<textarea class="explanation" data-q="${i}" placeholder="Explication de la bonne réponse, visible dans les supports formateur.">${safe(q.explanation||'')}</textarea></label>${draft.length>1?`<button type="button" class="button danger del-q" data-q="${i}">Supprimer cette question</button>`:''}</section>`).join('');
  document.querySelectorAll('.qt').forEach(x=>x.oninput=e=>draft[e.target.dataset.q].text=e.target.value);
  document.querySelectorAll('.ct').forEach(x=>x.oninput=e=>draft[e.target.dataset.q].choices[e.target.dataset.c]=e.target.value);
  document.querySelectorAll('.ok').forEach(x=>x.onchange=e=>{
    let q=draft[e.target.dataset.q],c=+e.target.dataset.c;
    q.correctIndexes=e.target.checked?[...new Set([...q.correctIndexes,c])]:q.correctIndexes.filter(v=>v!==c)
  });
  document.querySelectorAll('.partial').forEach(x=>x.onchange=e=>{
    draft[e.target.dataset.q].partial.enabled=e.target.checked;
    e.target.closest('.question-editor').querySelector('.partial-fields').classList.toggle('hidden',!e.target.checked)
  });
  document.querySelectorAll('.prc').forEach(x=>x.oninput=e=>draft[e.target.dataset.q].partial.requiredCorrectCount=num(e.target.value,2));
  document.querySelectorAll('.ppt').forEach(x=>x.oninput=e=>draft[e.target.dataset.q].partial.points=num(e.target.value,.5));
  document.querySelectorAll('.explanation').forEach(x=>x.oninput=e=>draft[e.target.dataset.q].explanation=e.target.value);
  document.querySelectorAll('.del-q').forEach(x=>x.onclick=e=>{
    if(confirm('Supprimer cette question ?')){draft.splice(+e.target.dataset.q,1);draw()}
  })
}

async function saveQuizDraft(){
  let quiz;
  try{
    quiz=normQuiz({title:quizTitle.value,description:quizDescription.value,questions:draft})
  }catch(e){return notify(e.message)}
  try{
    if(editingId){
      /* update : conserve createdAt, importedFrom, sourceFileName */
      await update(ref(db,`quizzes/${user.uid}/${editingId}`),{...quiz,updatedAt:Date.now()})
    }else{
      let id=push(ref(db,`quizzes/${user.uid}`)).key;
      await set(ref(db,`quizzes/${user.uid}/${id}`),{...quiz,createdAt:Date.now(),updatedAt:Date.now()})
    }
    location.hash='#library'
  }catch(e){notify('Enregistrement impossible : '+e.message)}
}

/* ===================== SESSION LIVE (FORMATEUR) ===================== */
/* Les solutions sont stockées dans roomKeys/{code} (lisible uniquement par l'hôte).
   Les participants ne reçoivent que l'énoncé et les 4 choix. */
async function launch(q){
  try{
    if(!q?.questions?.length)return notify('Ce QCM ne contient aucune question.');
    let c=await roomCode();
    const publicQs=q.questions.map(x=>({id:x.id,text:x.text,choices:x.choices}));
    const keys={};
    q.questions.forEach(x=>keys[x.id]={correctIndexes:x.correctIndexes||[],partial:x.partial||{enabled:false,requiredCorrectCount:2,points:.5}});
    await set(ref(db,`rooms/${c}`),{hostUid:user.uid,title:q.title,status:'OPEN',createdAt:Date.now(),questions:publicQs});
    await set(ref(db,`roomKeys/${c}`),keys);
    location.hash='#host='+c
  }catch(e){notify('Impossible de lancer la session : '+e.message)}
}

async function host(c){
  const my=seq;
  root.innerHTML=hostTemplate.innerHTML;
  let off=()=>{};
  stop=()=>off();
  let keys,hostUid;
  try{
    hostUid=(await get(ref(db,`rooms/${c}/hostUid`))).val();
    if(my!==seq)return;
    if(!hostUid){root.innerHTML='<section class="card"><h2>Salle introuvable</h2></section>';return}
    if(hostUid!==user.uid){root.innerHTML='<section class="card"><h2>Accès refusé</h2><p>Cette session appartient à un autre présentateur.</p></section>';return}
    keys=(await get(ref(db,`roomKeys/${c}`))).val()||{};
    if(my!==seq)return
  }catch(e){return notify('Lecture impossible : '+e.message)}

  const url=location.origin+location.pathname+'#join='+c,
    pending=new Set();
  let current=null;
  hostCode.textContent=c;
  new QRCode(qrBox,{text:url,width:210,height:210});
  copyJoinLink.onclick=()=>navigator.clipboard.writeText(url).then(()=>notify('Lien copié')).catch(()=>prompt('Copier le lien :',url));
  closeRoom.onclick=()=>update(ref(db,`rooms/${c}`),{status:'CLOSED'}).catch(e=>notify('Fermeture impossible : '+e.message));
  downloadPdf.onclick=()=>current&&reportPdf(current.r,current.ps);
  downloadBlankPdf.onclick=()=>current&&blankPdf(current.r);

  off=onValue(ref(db,`rooms/${c}`),s=>{
    let r=s.val();
    if(!r)return;
    hostTitle.textContent=r.title;
    closeRoom.disabled=r.status==='CLOSED';
    closeRoom.textContent=r.status==='CLOSED'?'Session fermée':'Fermer la session';

    /* Correction côté présentateur : une note n'est écrite que par l'hôte */
    const up={};
    Object.entries(r.answers||{}).forEach(([uid,qa])=>Object.entries(qa||{}).forEach(([qid,a])=>{
      const id=uid+'/'+qid;
      if(r.grades?.[uid]?.[qid]!==undefined||pending.has(id)||!keys[qid])return;
      up[`rooms/${c}/grades/${uid}/${qid}`]=mark(keys[qid],a.selectedIndexes||[]);
      pending.add(id)
    }));
    if(Object.keys(up).length)update(ref(db),up).catch(e=>{
      Object.keys(up).forEach(k=>pending.delete(k.replace(`rooms/${c}/grades/`,'')));
      notify('Correction impossible : '+e.message)
    });

    const full={...r,questions:(r.questions||[]).map(q=>({...q,...(keys[q.id]||{})}))};
    const ps=Object.entries(r.players||{}).map(([uid,p])=>{
      const g=r.grades?.[uid]||{};
      return{uid,...p,evaluations:g,score:Object.values(g).reduce((a,b)=>a+(+b||0),0)}
    });
    current={r:full,ps};
    completedCount.textContent=ps.filter(p=>p.completed).length;
    completedLabel.textContent=`terminé(s) sur ${ps.length}`;
    progressTable.innerHTML=`<thead><tr><th>Participant</th>${full.questions.map((_,i)=>`<th>Q${i+1}</th>`).join('')}<th>Score</th></tr></thead><tbody>${ps.map(p=>`<tr><td>${safe(p.name)}</td>${full.questions.map(q=>`<td>${p.evaluations?.[q.id]??'—'}</td>`).join('')}<td>${fmt(p.score)}/${full.questions.length}</td></tr>`).join('')}</tbody>`
  },e=>notify('Lecture refusée : '+e.message))
}

/* ===================== PARTICIPANT ===================== */
function join(c){
  selfScoreCache=null;
  root.innerHTML=joinTemplate.innerHTML;
  /* Le participant n'écoute que ce qui le concerne (pas les autres joueurs ni leurs réponses) */
  stop=watch([
    `rooms/${c}/hostUid`,`rooms/${c}/title`,`rooms/${c}/status`,`rooms/${c}/questions`,
    `rooms/${c}/players/${user.uid}`,`rooms/${c}/grades/${user.uid}`
  ],v=>renderJoin(c,{
    exists:!!v[`rooms/${c}/hostUid`],
    title:v[`rooms/${c}/title`],
    status:v[`rooms/${c}/status`],
    questions:v[`rooms/${c}/questions`]||[],
    p:v[`rooms/${c}/players/${user.uid}`],
    grades:v[`rooms/${c}/grades/${user.uid}`]||{}
  }))
}

function renderJoin(c,r){
  if(!r.exists){
    joinTitle.textContent='Salle introuvable';
    nameCard.classList.add('hidden');questionCard.classList.add('hidden');resultCard.classList.add('hidden');
    return
  }
  joinTitle.textContent=r.title;
  const p=r.p,n=r.questions.length;
  nameCard.classList.toggle('hidden',!!p||r.status==='CLOSED');
  if(!p){
    questionCard.dataset.idx='';
    resultCard.classList.add('hidden');
    if(r.status==='CLOSED'){
      questionCard.classList.remove('hidden');
      questionCard.innerHTML='<h2>Session fermée</h2><p>Le présentateur a fermé cette session.</p>'
    }else questionCard.classList.add('hidden');
    enterRoom.onclick=async()=>{
      let name=playerName.value.trim().replace(/\s+/g,' ');
      if(name.length<2||!name.includes(' '))return notify('Saisis ton nom et prénom');
      try{
        await set(ref(db,`rooms/${c}/players/${user.uid}`),{name,currentQuestionIndex:0,answeredCount:0,completed:false})
      }catch(e){notify('Impossible de rejoindre : '+e.message)}
    };
    return
  }

  if(p.completed){
    questionCard.classList.add('hidden');questionCard.dataset.idx='';
    resultCard.classList.remove('hidden');
    /* Résultat calculé localement : chaque solution n'est lisible qu'après avoir répondu à la question */
    if(selfScoreCache?.c!==c||selfScoreCache.busy){
      resultCard.innerHTML=`<h2>Merci ${safe(p.name)} !</h2><p>Calcul de votre résultat…</p>`;
      if(selfScoreCache?.c!==c){
        selfScoreCache={c,busy:true};
        const my=seq;
        selfScore(c,r.questions).then(s=>{
          selfScoreCache={c,score:s};
          if(my===seq)renderJoin(c,r)
        }).catch(e=>{selfScoreCache=null;notify('Calcul du résultat impossible : '+e.message)})
      }
      return
    }
    const score=selfScoreCache.score;
    resultCard.innerHTML=`<section class="certificate"><div class="certificate-ribbon">QCM LIVE</div><div class="certificate-icon">★</div><p class="certificate-label">ATTESTATION DE PARTICIPATION</p><h2>Félicitations !</h2><p>Participant : <strong>${safe(p.name)}</strong></p><p>Vous avez terminé le QCM :</p><h3>${safe(r.title)}</h3><div class="certificate-score"><span>Résultat obtenu</span><strong>${fmt(score)} / ${n}</strong><small>bonne(s) réponse(s)</small></div></section>`;
    return
  }

  resultCard.classList.add('hidden');
  if(r.status==='CLOSED'){
    questionCard.classList.remove('hidden');questionCard.dataset.idx='';
    questionCard.innerHTML='<h2>Session fermée</h2><p>Le présentateur a fermé la session avant la fin de votre QCM.</p>';
    return
  }
  const idx=p.currentQuestionIndex||0,q=r.questions[idx];
  if(!q)return;
  /* Ne pas reconstruire le formulaire si la question affichée est la même (évite de décocher les cases) */
  if(questionCard.dataset.idx===String(idx)&&!questionCard.classList.contains('hidden'))return;
  questionCard.dataset.idx=String(idx);
  questionCard.classList.remove('hidden');
  questionCard.innerHTML=`<div class="progress-track"><div class="progress-fill" style="width:${idx/n*100}%"></div></div><p><small>Question ${idx+1} / ${n}</small></p><h2>${safe(q.text)}</h2>${q.choices.map((x,i)=>`<label class="answer"><input type="checkbox" value="${i}"><span class="letter">${L[i]}</span><span>${safe(x)}</span></label>`).join('')}<button id="validateAnswer" class="button primary wide">Valider ma réponse</button>`;
  const btn=document.getElementById('validateAnswer');
  btn.onclick=async()=>{
    let a=[...questionCard.querySelectorAll('input:checked')].map(x=>+x.value);
    if(!a.length)return notify('Sélectionne une réponse');
    btn.disabled=true;
    const next=idx+1,u=user.uid;
    try{
      /* Écriture atomique : réponse + progression (la règle refuse un second envoi) */
      await update(ref(db),{
        [`rooms/${c}/answers/${u}/${q.id}`]:{selectedIndexes:a},
        [`rooms/${c}/players/${u}/currentQuestionIndex`]:next,
        [`rooms/${c}/players/${u}/answeredCount`]:(p.answeredCount||0)+1,
        [`rooms/${c}/players/${u}/completed`]:next>=n
      })
    }catch(e){
      btn.disabled=false;
      notify('Réponse refusée ('+(e.code||e.message)+') : déjà envoyée, session fermée ou règles non publiées.')
    }
  }
}

async function selfScore(c,questions){
  const a=(await get(ref(db,`rooms/${c}/answers/${user.uid}`))).val()||{};
  const parts=await Promise.all(questions.map(async q=>{
    if(!a[q.id])return 0;
    const k=(await get(ref(db,`roomKeys/${c}/${q.id}`))).val();
    return k?mark(k,a[q.id].selectedIndexes||[]):0
  }));
  return parts.reduce((x,y)=>x+y,0)
}

/* ===================== EXPORTS ===================== */
function exportExcel(q){
  if(!window.XLSX)return notify('Bibliothèque Excel absente');
  let rows=q.questions.map((x,i)=>({
    'Question':x.text,
    'Réponse A':x.choices[0],
    'Réponse B':x.choices[1],
    'Réponse C':x.choices[2],
    'Réponse D':x.choices[3],
    'Bonnes réponses':(x.correctIndexes||[]).map(i=>L[i]).join(','),
    'Note partielle':x.partial?.enabled?'OUI':'NON',
    'Nombre bonnes réponses':x.partial?.requiredCorrectCount??2,
    'Points partiels':x.partial?.points??.5,
    'Titre du QCM':i===0?q.title:'',
    'Description':i===0?(q.description||''):'',
    'Explication':x.explanation||''
  }));
  let ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'QCM');
  XLSX.writeFile(wb,slug(q.title)+'.xlsx');
  notify('Export Excel lancé.')
}

/* ---------- Rapport PDF : liste, statistiques avancées, 1 section par participant ---------- */
function reportPdf(r,ps){
  let{jsPDF}=window.jspdf,p=new jsPDF(),M=14,TW=182,LH=5,y=20,Q=r.questions,n=ps.length,NQ=Q.length;
  const need=h=>{if(y+h>282){p.addPage();y=18}};
  const f2=v=>Number(v||0).toFixed(2).replace('.',',');
  const pc=v=>Math.round((v||0)*100)+' %';
  /* La note provient des grades écrits par l'hôte */
  const ans=(x,q)=>{
    const a=r.answers?.[x.uid]?.[q.id];
    return a?{...a,score:+(r.grades?.[x.uid]?.[q.id]??0)}:undefined
  };
  const section=t=>{
    need(16);
    p.setFont('helvetica','bold');p.setFontSize(13);p.setTextColor(31,78,120);
    p.text(t,M,y);
    p.setDrawColor(31,78,120);p.setLineWidth(.4);p.line(M,y+2,M+TW,y+2);
    p.setTextColor(0);y+=10
  };

  /* ===== 1. Liste des participants ===== */
  p.setFont('helvetica','bold');p.setFontSize(16);p.setTextColor(0);
  p.text(p.splitTextToSize(r.title,TW),M,y);y+=10;
  p.setFont('helvetica','normal');p.setFontSize(12);
  ps.forEach(x=>{
    p.text(`${x.name} : ${fmt(x.score)} / ${NQ}`,M,y);y+=8;
    if(y>280){p.addPage();y=20}
  });

  /* ===== 2. Statistiques avancées ===== */
  if(n){
    p.addPage();y=18;
    p.setFont('helvetica','bold');p.setFontSize(16);p.setTextColor(0);
    p.text('Statistiques avancées',M,y);y+=10;

    const scores=ps.map(x=>x.score||0),
      sorted=[...scores].sort((a,b)=>a-b),
      avg=scores.reduce((a,b)=>a+b,0)/n,
      med=n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2,
      sd=Math.sqrt(scores.reduce((a,s)=>a+(s-avg)**2,0)/n),
      done=ps.filter(x=>x.completed).length,
      passN=scores.filter(s=>s>=NQ/2).length,
      rank=[...ps].sort((a,b)=>(b.score||0)-(a.score||0));

    section('Synthèse globale');
    const kv=[
      ['Participants',String(n)],
      ['Ont terminé',`${done} (${pc(done/n)})`],
      ['Score moyen',`${f2(avg)} / ${NQ}  (${pc(avg/NQ)})`],
      ['Médiane',`${f2(med)} / ${NQ}`],
      ['Écart-type',f2(sd)],
      ['Score minimum / maximum',`${fmt(sorted[0])} / ${fmt(sorted[n-1])}`],
      ['Taux de réussite (>= 50 %)',`${pc(passN/n)}  (${passN} participant(s))`],
      ['Podium',rank.slice(0,3).map((x,i)=>`${i+1}. ${x.name} (${fmt(x.score)})`).join('   ')]
    ];
    p.setFontSize(10);
    kv.forEach(([k,v])=>{
      need(7);
      p.setFont('helvetica','bold');p.setTextColor(60);p.text(k,M,y);
      p.setFont('helvetica','normal');p.setTextColor(0);p.text(p.splitTextToSize(v,115),M+62,y);
      y+=6.5
    });
    y+=4;

    section('Répartition des scores');
    need(55);
    const bins=Array(10).fill(0);
    scores.forEach(s=>bins[Math.min(9,Math.floor(s/NQ*10))]++);
    const mx=Math.max(...bins,1),bw=TW/10,ch=32,base=y+ch;
    p.setDrawColor(150);p.setLineWidth(.3);p.line(M,base,M+TW,base);
    bins.forEach((c,i)=>{
      const h=c/mx*ch,x=M+i*bw+2;
      p.setFillColor(31,78,120);
      if(c)p.rect(x,base-h,bw-4,h,'F');
      p.setFont('helvetica','bold');p.setFontSize(8);p.setTextColor(0);
      if(c)p.text(String(c),x+(bw-4)/2,base-h-1.5,{align:'center'});
      p.setFont('helvetica','normal');p.setFontSize(7);p.setTextColor(90);
      p.text(`${i*10}-${(i+1)*10}%`,x+(bw-4)/2,base+4,{align:'center'})
    });
    p.setTextColor(0);y=base+12;

    const k=Math.max(1,Math.round(n*.27)),top=rank.slice(0,k),low=rank.slice(-k);
    const sc=(x,q)=>ans(x,q)?.score||0;
    const qs=Q.map(q=>{
      const given=ps.map(x=>ans(x,q)).filter(Boolean),cnt=[0,0,0,0];
      given.forEach(a=>(a.selectedIndexes||[]).forEach(i=>cnt[i]++));
      const succ=ps.filter(x=>sc(x,q)>=1).length/n,
        mean=ps.reduce((a,x)=>a+sc(x,q),0)/n,
        disc=n>=4?top.reduce((a,x)=>a+sc(x,q),0)/k-low.reduce((a,x)=>a+sc(x,q),0)/k:null,
        good=q.correctIndexes||[],
        wrong=[0,1,2,3].filter(j=>!good.includes(j)).sort((a,b)=>cnt[b]-cnt[a])[0],
        level=succ>=.8?'Facile':succ>=.5?'Moyenne':succ>=.3?'Difficile':'Très difficile';
      return{q,cnt,len:given.length,succ,mean,disc,good,wrong,level,flag:succ<.3||(disc!==null&&disc<0)}
    });

    section('Détail par question');
    const X=[M,M+13,M+27,M+41,M+55,M+72,M+95,M+118,M+146];
    const head=()=>{
      p.setFillColor(230,236,243);p.rect(M,y-4.5,TW,7,'F');
      p.setFont('helvetica','bold');p.setFontSize(8);p.setTextColor(0);
      ['Q','A','B','C','D','Réussite','Pts moy.','Discrim.','Niveau'].forEach((t,i)=>p.text(t,X[i],y));
      y+=7
    };
    head();
    qs.forEach((s,i)=>{
      if(y+7>282){p.addPage();y=18;head()}
      p.setFont('helvetica','bold');p.setFontSize(8);p.setTextColor(0);
      p.text(`Q${i+1}`,X[0],y);
      s.cnt.forEach((c,j)=>{
        const g=s.good.includes(j);
        p.setFont('helvetica',g?'bold':'normal');
        g?p.setTextColor(0,140,0):p.setTextColor(0);
        p.text(`${s.len?Math.round(c/s.len*100):0} %${g?' *':''}`,X[1+j],y)
      });
      p.setFont('helvetica','normal');p.setTextColor(0);
      p.text(pc(s.succ),X[5],y);
      p.text(f2(s.mean),X[6],y);
      p.text(s.disc===null?'n/a':f2(s.disc),X[7],y);
      s.flag?p.setTextColor(200,0,0):p.setTextColor(0);
      p.text(s.level+(s.flag?' !':''),X[8],y);
      p.setDrawColor(225);p.setLineWidth(.2);p.line(M,y+2,M+TW,y+2);
      y+=6.5
    });
    need(16);
    p.setTextColor(90);p.setFont('helvetica','italic');p.setFontSize(7.5);
    p.text(p.splitTextToSize('A-D : % de répondants ayant coché chaque réponse (* = bonne réponse, plusieurs réponses possibles). '+
      'Discrim. : différence de score entre les 27 % meilleurs et les 27 % derniers (proche de 1 = discrimine bien ; négatif = question à revoir). '+
      'Niveau : Facile >= 80 %, Moyenne >= 50 %, Difficile >= 30 %, sinon Très difficile. ! = question à revoir.',TW),M,y+2);
    y+=14;p.setTextColor(0);

    const fl=qs.map((s,i)=>({s,i})).filter(o=>o.s.flag);
    section('Questions à revoir');
    p.setFontSize(10);
    if(!fl.length){p.setFont('helvetica','normal');p.text('Aucune question problématique détectée.',M,y);y+=8}
    fl.forEach(({s,i})=>{
      const why=[];
      if(s.succ<.3)why.push(`seulement ${pc(s.succ)} de réussite`);
      if(s.disc!==null&&s.disc<0)why.push('indice de discrimination négatif');
      if(s.wrong!==undefined&&s.cnt[s.wrong])why.push(`réponse erronée la plus choisie : ${L[s.wrong]} (${Math.round(s.cnt[s.wrong]/Math.max(s.len,1)*100)} %)`);
      const t=p.splitTextToSize(`Q${i+1} - ${s.q.text} : ${why.join(' ; ')}`,TW);
      need(t.length*LH+3);
      p.setFont('helvetica','normal');p.setTextColor(0);
      p.text(t,M,y);y+=t.length*LH+3
    });

    const byS=[...qs.keys()].sort((a,b)=>qs[b].succ-qs[a].succ);
    need(20);y+=3;
    p.setFont('helvetica','bold');p.setTextColor(0);
    p.text(`Plus réussie : Q${byS[0]+1} (${pc(qs[byS[0]].succ)})   |   Moins réussie : Q${byS[byS.length-1]+1} (${pc(qs[byS[byS.length-1]].succ)})`,M,y)
  }

  /* ===== 3. Une section par participant ===== */
  ps.forEach(x=>{
    p.addPage();y=18;
    p.setTextColor(0);p.setFont('helvetica','bold');p.setFontSize(14);
    p.text(p.splitTextToSize(r.title,TW),M,y);y+=8;
    p.setFontSize(12);
    p.text(`Participant : ${x.name}`,M,y);y+=6;
    p.text(`Score : ${fmt(x.score)} / ${NQ}`,M,y);y+=6;
    p.setFont('helvetica','normal');p.setFontSize(9);p.setTextColor(90);
    p.text('Vert en gras = bonne réponse   |   Cadre = réponse(s) cochée(s) par le participant',M,y);y+=8;

    Q.forEach((q,i)=>{
      const a=ans(x,q),
        sel=a?.selectedIndexes||[],
        pts=a?.score??0,
        good=q.correctIndexes||[];

      p.setFontSize(11);p.setFont('helvetica','bold');
      const ql=p.splitTextToSize(`Q${i+1}. ${q.text}`,TW);
      const cl=q.choices.map((c,j)=>{
        p.setFont('helvetica',good.includes(j)?'bold':'normal');
        return p.splitTextToSize(`${L[j]}. ${c}`,TW-10)
      });
      const h=ql.length*LH+3+cl.reduce((s,l)=>s+l.length*LH+3,0)+9;
      if(y+h>282){p.addPage();y=18}

      p.setFont('helvetica','bold');p.setTextColor(0);
      ql.forEach((l,k)=>p.text(l,M,y+k*LH));
      y+=ql.length*LH+3;

      q.choices.forEach((c,j)=>{
        const isGood=good.includes(j),lines=cl[j];
        p.setFont('helvetica',isGood?'bold':'normal');
        isGood?p.setTextColor(0,140,0):p.setTextColor(0);
        lines.forEach((l,k)=>p.text(l,M+6,y+k*LH));
        if(sel.includes(j)){
          p.setDrawColor(0);p.setLineWidth(.5);
          p.rect(M+3,y-LH+0.8,TW-3,lines.length*LH+1.4)
        }
        y+=lines.length*LH+3
      });

      p.setFont('helvetica','bold');p.setFontSize(10);
      pts>0?p.setTextColor(0,140,0):p.setTextColor(200,0,0);
      p.text(sel.length?`Points obtenus : ${fmt(pts)} / 1`:'Pas de réponse - Points obtenus : 0 / 1',M,y+1);
      p.setLineWidth(.2);p.setDrawColor(200);p.line(M,y+4,M+TW,y+4);
      y+=9
    })
  });

  p.save('rapport-'+slug(r.title)+'.pdf')
}

function blankPdf(r){
  let{jsPDF}=window.jspdf,p=new jsPDF(),M=14,TW=182,LH=6,y=18;
  const need=h=>{if(y+h>280){p.addPage();y=18}};
  p.setFont('helvetica','bold');p.setFontSize(14);
  p.splitTextToSize(r.title,TW).forEach(l=>{p.text(l,M,y);y+=7});
  y+=3;
  p.setFont('helvetica','normal');p.setFontSize(11);
  p.text('Nom et prénom : __________________________',M,y);y+=12;
  r.questions.forEach((q,i)=>{
    p.setFont('helvetica','bold');
    const ql=p.splitTextToSize(`Q${i+1}. ${q.text}`,TW);
    p.setFont('helvetica','normal');
    const cl=q.choices.map((x,j)=>p.splitTextToSize(`[  ] ${L[j]}. ${x}`,TW-6));
    need(ql.length*LH+cl.reduce((s,l)=>s+l.length*LH+1,0)+8);
    p.setFont('helvetica','bold');
    ql.forEach(l=>{p.text(l,M,y);y+=LH});
    y+=1;
    p.setFont('helvetica','normal');
    cl.forEach(lines=>{lines.forEach(l=>{p.text(l,M+6,y);y+=LH});y+=1});
    y+=5
  });
  p.save('questionnaire-'+slug(r.title)+'.pdf')
}

/* ===================== UTILITAIRES ===================== */
function mark(q,a){
  let g=q.correctIndexes||[],
    all=a.length===g.length&&g.every(i=>a.includes(i)),
    wrong=a.some(i=>!g.includes(i));
  if(all)return 1;
  return q.partial?.enabled&&!wrong&&a.filter(i=>g.includes(i)).length===Number(q.partial.requiredCorrectCount)?+(q.partial.points??.5):0
}

function parseAnswers(v){
  let map={A:0,B:1,C:2,D:3};
  return [...new Set(String(v||'').toUpperCase().replace(/;/g,',').split(/[, ]+/).map(x=>x.trim()).filter(x=>x in map).map(x=>map[x]))]
}

function num(v,f){let n=Number(String(v??'').replace(',','.'));return String(v??'').trim()!==''&&Number.isFinite(n)?n:f}
function blank(){return{text:'',choices:['','','',''],correctIndexes:[],partial:{enabled:false,requiredCorrectCount:2,points:.5},explanation:''}}

async function roomCode(){
  let c,e=true;
  while(e){
    c=Array.from({length:6},()=>"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random()*32)]).join('');
    e=(await get(ref(db,`rooms/${c}/hostUid`))).exists()
  }
  return c
}

function norm(x){return x.trim().toUpperCase().replace(/[^A-Z0-9]/g,'')}
function fmt(x){return Number(x||0).toFixed(1).replace('.0','').replace('.',',')}
/* Échappe aussi les guillemets : sûr dans le texte ET dans les attributs value="..." */
function safe(x=''){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function slug(x){return String(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'qcm'}
function notify(x){
  toast.textContent=x;toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.add('hidden'),4000)
}
