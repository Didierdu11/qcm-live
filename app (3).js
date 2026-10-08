import{initializeApp}from"https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import{getAuth,signInAnonymously,onAuthStateChanged}from"https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import{getDatabase,ref,onValue,get,set,push,update,remove,runTransaction}from"https://www.gstatic.com/firebasejs/11.4.0/firebase-database.js";

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
let user=null,stop=null,editingId=null,draft=[];

signInAnonymously(auth).catch(e=>notify(e.code+': '+e.message));
onAuthStateChanged(auth,u=>{user=u;connectionState.textContent=u?'Connecté':'Erreur';if(u)route()});
addEventListener('hashchange',route);

/* ===================== ROUTAGE ===================== */
function route(){
  if(stop){stop();stop=null}
  let h=location.hash||'#home';
  if(h==='#library')return library();
  if(h.startsWith('#editor='))return editor(h.slice(8));
  if(h.startsWith('#host='))return host(norm(h.slice(6)));
  if(h.startsWith('#join='))return join(norm(h.slice(6)));
  home()
}

function home(){
  root.innerHTML=homeTemplate.innerHTML;
  /* getElementById : évite le conflit de nom avec la fonction showJoin() */
  document.getElementById('showJoin').onclick=()=>joinPanel.classList.toggle('hidden');
  joinCodeButton.onclick=()=>{
    let c=norm(joinCode.value);
    if(!/^[A-Z0-9]{6}$/.test(c))return notify('Code invalide');
    location.hash='#join='+c
  }
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
    quizList.innerHTML=Object.entries(qs).map(([id,q])=>`<div class="row"><span><strong>${safe(q.title)}</strong><br><small>${q.questions?.length||0} question(s)</small></span><span class="quiz-actions"><a class="button secondary" href="#editor=${id}">Modifier</a><button class="button secondary" data-ex="${id}">Exporter Excel</button><button class="button danger" data-del="${id}">Supprimer</button><button class="button primary" data-run="${id}">Lancer</button></span></div>`).join('')||'<p>Aucun QCM enregistré.</p>';
    document.querySelectorAll('[data-ex]').forEach(b=>b.onclick=()=>exportExcel(qs[b.dataset.ex]));
    document.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
      let q=qs[b.dataset.del];
      if(confirm(`Supprimer définitivement le QCM :\n\n${q.title} ?`)){
        await remove(ref(db,`quizzes/${user.uid}/${b.dataset.del}`));
        notify('QCM supprimé.')
      }
    });
    document.querySelectorAll('[data-run]').forEach(b=>b.onclick=()=>launch(qs[b.dataset.run]))
  })
}

async function importJson(e){
  try{
    let q=JSON.parse(await e.target.files[0].text()),id=push(ref(db,`quizzes/${user.uid}`)).key;
    await set(ref(db,`quizzes/${user.uid}/${id}`),{...q,createdAt:Date.now(),updatedAt:Date.now()});
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
    let id=push(ref(db,`quizzes/${user.uid}`)).key;
    await set(ref(db,`quizzes/${user.uid}/${id}`),{title,description,questions,createdAt:Date.now(),updatedAt:Date.now(),importedFrom:'Excel',sourceFileName:f.name});
    notify(`QCM Excel importé : ${questions.length} question(s).`)
  }catch(x){console.error(x);notify('Import Excel impossible : '+x.message)}
  e.target.value=''
}

/* ===================== ÉDITEUR ===================== */
async function editor(v){
  editingId=v==='new'?null:v;
  root.innerHTML=editorTemplate.innerHTML;
  if(editingId){
    let q=(await get(ref(db,`quizzes/${user.uid}/${editingId}`))).val();
    quizTitle.value=q.title;
    quizDescription.value=q.description||'';
    draft=q.questions||[blank()]
  }else draft=[blank()];
  addQuestion.onclick=()=>{draft.push(blank());draw()};
  /* getElementById : évite le conflit de nom avec la fonction saveQuiz() */
  document.getElementById('saveQuiz').onclick=saveQuiz;
  draw()
}

function draw(){
  questionsEditor.innerHTML=draft.map((q,i)=>`<section class="question-editor"><h2>Question ${i+1}</h2><label>Énoncé<input class="qt" data-q="${i}" value="${safe(q.text)}"></label>${q.choices.map((c,j)=>`<label class="choice-editor"><input class="ok" data-q="${i}" data-c="${j}" type="checkbox" ${q.correctIndexes.includes(j)?'checked':''}><input class="ct" data-q="${i}" data-c="${j}" value="${safe(c)}" placeholder="Réponse ${L[j]}"></label>`).join('')}<label><input class="partial" data-q="${i}" type="checkbox" ${q.partial?.enabled?'checked':''}> Note partielle</label><label>Explication (colonne L Excel)<textarea class="explanation" data-q="${i}" placeholder="Explication de la bonne réponse, visible dans les supports formateur.">${safe(q.explanation||'')}</textarea></label></section>`).join('');
  document.querySelectorAll('.qt').forEach(x=>x.oninput=e=>draft[e.target.dataset.q].text=e.target.value);
  document.querySelectorAll('.ct').forEach(x=>x.oninput=e=>draft[e.target.dataset.q].choices[e.target.dataset.c]=e.target.value);
  document.querySelectorAll('.ok').forEach(x=>x.onchange=e=>{
    let q=draft[e.target.dataset.q],c=+e.target.dataset.c;
    q.correctIndexes=e.target.checked?[...new Set([...q.correctIndexes,c])]:q.correctIndexes.filter(v=>v!==c)
  });
  document.querySelectorAll('.partial').forEach(x=>x.onchange=e=>draft[e.target.dataset.q].partial.enabled=e.target.checked);
  document.querySelectorAll('.explanation').forEach(x=>x.oninput=e=>draft[e.target.dataset.q].explanation=e.target.value)
}

async function saveQuiz(){
  let title=quizTitle.value.trim(),
    questions=draft.map((q,i)=>({
      ...q,
      id:'q'+(i+1),
      text:q.text.trim(),
      choices:q.choices.map(x=>x.trim()),
      partial:q.partial||{enabled:false,requiredCorrectCount:2,points:.5},
      explanation:(q.explanation||'').trim()
    }));
  if(title.length<3||questions.some(q=>q.text.length<3||q.choices.some(x=>!x)||!q.correctIndexes.length))return notify('Complète toutes les questions.');
  let id=editingId||push(ref(db,`quizzes/${user.uid}`)).key;
  await set(ref(db,`quizzes/${user.uid}/${id}`),{title,description:quizDescription.value.trim(),questions,updatedAt:Date.now()});
  location.hash='#library'
}

/* ===================== SESSION LIVE (FORMATEUR) ===================== */
async function launch(q){
  let c=await roomCode();
  await set(ref(db,`rooms/${c}`),{hostUid:user.uid,title:q.title,status:'OPEN',createdAt:Date.now(),questions:q.questions,players:{},answers:{}});
  location.hash='#host='+c
}

function host(c){
  root.innerHTML=hostTemplate.innerHTML;
  stop=onValue(ref(db,`rooms/${c}`),s=>{
    let r=s.val();
    if(!r)return;
    hostTitle.textContent=r.title;
    hostCode.textContent=c;
    let url=location.origin+location.pathname+'#join='+c;
    if(!qrBox.dataset.url){qrBox.dataset.url=url;new QRCode(qrBox,{text:url,width:210,height:210})}
    copyJoinLink.onclick=()=>navigator.clipboard.writeText(url).then(()=>notify('Lien copié')).catch(()=>prompt('Copier le lien :',url));
    closeRoom.onclick=()=>update(ref(db,`rooms/${c}`),{status:'CLOSED'});
    let ps=Object.entries(r.players||{}).map(([uid,p])=>({uid,...p}));
    completedCount.textContent=ps.filter(p=>p.completed).length;
    completedLabel.textContent=`terminé(s) sur ${ps.length}`;
    downloadPdf.onclick=()=>reportPdf(r,ps);
    downloadBlankPdf.onclick=()=>blankPdf(r);
    progressTable.innerHTML=`<thead><tr><th>Participant</th>${r.questions.map((_,i)=>`<th>Q${i+1}</th>`).join('')}<th>Score</th></tr></thead><tbody>${ps.map(p=>`<tr><td>${safe(p.name)}</td>${r.questions.map(q=>`<td>${p.evaluations?.[q.id]??'—'}</td>`).join('')}<td>${fmt(p.score)}/${r.questions.length}</td></tr>`).join('')}</tbody>`
  })
}

/* ===================== PARTICIPANT ===================== */
function join(c){
  root.innerHTML=joinTemplate.innerHTML;
  stop=onValue(ref(db,`rooms/${c}`),s=>showJoin(c,s.val()))
}

function showJoin(c,r){
  if(!r)return;
  joinTitle.textContent=r.title;
  let p=r.players?.[user.uid];
  nameCard.classList.toggle('hidden',!!p);
  questionCard.classList.add('hidden');
  resultCard.classList.add('hidden');
  if(!p){
    enterRoom.onclick=()=>{
      let n=playerName.value.trim();
      if(n.length<2||!n.includes(' '))return notify('Saisis ton nom et prénom');
      set(ref(db,`rooms/${c}/players/${user.uid}`),{name:n,currentQuestionIndex:0,answeredCount:0,score:0,completed:false,evaluations:{}})
    };
    return
  }
  if(p.completed){
    resultCard.classList.remove('hidden');
    resultCard.innerHTML=`<section class="certificate"><div class="certificate-ribbon">QCM LIVE</div><div class="certificate-icon">★</div><p class="certificate-label">ATTESTATION DE PARTICIPATION</p><h2>Félicitations !</h2><p>Participant : <strong>${safe(p.name)}</strong></p><p>Vous avez terminé le QCM :</p><h3>${safe(r.title)}</h3><div class="certificate-score"><span>Résultat obtenu</span><strong>${fmt(p.score)} / ${r.questions.length}</strong><small>bonne(s) réponse(s)</small></div></section>`;
    return
  }
  let q=r.questions[p.currentQuestionIndex];
  questionCard.classList.remove('hidden');
  questionCard.innerHTML=`<div class="progress-track"><div class="progress-fill" style="width:${p.currentQuestionIndex/r.questions.length*100}%"></div></div><h2>${safe(q.text)}</h2>${q.choices.map((x,i)=>`<label class="answer"><input type="checkbox" value="${i}"><span class="letter">${L[i]}</span><span>${safe(x)}</span></label>`).join('')}<button id="validateAnswer" class="button primary wide">Valider ma réponse</button>`;
  validateAnswer.onclick=async()=>{
    let a=[...questionCard.querySelectorAll('input:checked')].map(x=>+x.value);
    if(!a.length)return notify('Sélectionne une réponse');
    let score=mark(q,a),
      tx=await runTransaction(ref(db,`rooms/${c}/answers/${user.uid}/${q.id}`),v=>v===null?{selectedIndexes:a,score}:undefined);
    if(!tx.committed)return notify('Déjà répondu');
    let next=p.currentQuestionIndex+1;
    await update(ref(db,`rooms/${c}/players/${user.uid}`),{
      currentQuestionIndex:next,
      answeredCount:p.answeredCount+1,
      score:p.score+score,
      completed:next>=r.questions.length,
      evaluations:{...(p.evaluations||{}),[q.id]:score}
    })
  }
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
    'Bonnes réponses':x.correctIndexes.map(i=>L[i]).join(','),
    'Note partielle':x.partial?.enabled?'OUI':'NON',
    'Nombre bonnes réponses':x.partial?.requiredCorrectCount||2,
    'Points partiels':x.partial?.points||.5,
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
  const ans=(x,q)=>r.answers?.[x.uid]?.[q.id];
  const section=t=>{
    need(16);
    p.setFont('helvetica','bold');p.setFontSize(13);p.setTextColor(31,78,120);
    p.text(t,M,y);
    p.setDrawColor(31,78,120);p.setLineWidth(.4);p.line(M,y+2,M+TW,y+2);
    p.setTextColor(0);y+=10
  };

  /* ===== 1. Liste des participants ===== */
  p.setFont('helvetica','bold');p.setFontSize(16);p.setTextColor(0);
  p.text(r.title,M,y);y+=10;
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

    /* Synthèse globale */
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

    /* Histogramme de répartition des scores (tranches de 10 %) */
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

    /* Calculs par question */
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

    /* Tableau par question */
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

    /* Questions à revoir */
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

    /* Plus / moins réussie */
    const byS=[...qs.keys()].sort((a,b)=>qs[b].succ-qs[a].succ);
    need(20);y+=3;
    p.setFont('helvetica','bold');p.setTextColor(0);
    p.text(`Plus réussie : Q${byS[0]+1} (${pc(qs[byS[0]].succ)})   |   Moins réussie : Q${byS[byS.length-1]+1} (${pc(qs[byS[byS.length-1]].succ)})`,M,y)
  }

  /* ===== 3. Une section par participant : questions, solutions, réponses, points ===== */
  ps.forEach(x=>{
    p.addPage();y=18;
    p.setTextColor(0);p.setFont('helvetica','bold');p.setFontSize(14);
    p.text(r.title,M,y);y+=8;
    p.setFontSize(12);
    p.text(`Participant : ${x.name}`,M,y);y+=6;
    p.text(`Score : ${fmt(x.score)} / ${NQ}`,M,y);y+=6;
    p.setFont('helvetica','normal');p.setFontSize(9);p.setTextColor(90);
    p.text('Vert en gras = bonne réponse   |   Cadre = réponse(s) cochée(s) par le participant',M,y);y+=8;

    Q.forEach((q,i)=>{
      const a=ans(x,q),
        sel=a?.selectedIndexes||[],
        pts=a?.score??x.evaluations?.[q.id]??0,
        good=q.correctIndexes||[];

      /* Mesure du bloc pour ne pas couper une question entre deux pages */
      p.setFontSize(11);p.setFont('helvetica','bold');
      const ql=p.splitTextToSize(`Q${i+1}. ${q.text}`,TW);
      const cl=q.choices.map((c,j)=>{
        p.setFont('helvetica',good.includes(j)?'bold':'normal');
        return p.splitTextToSize(`${L[j]}. ${c}`,TW-10)
      });
      const h=ql.length*LH+3+cl.reduce((s,l)=>s+l.length*LH+3,0)+9;
      if(y+h>282){p.addPage();y=18}

      /* Énoncé */
      p.setFont('helvetica','bold');p.setTextColor(0);
      ql.forEach((l,k)=>p.text(l,M,y+k*LH));
      y+=ql.length*LH+3;

      /* Réponses : bonnes en gras vert, cochées encadrées */
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

      /* Points obtenus */
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
  let{jsPDF}=window.jspdf,p=new jsPDF(),y=18;
  p.text(r.title,14,y);y+=10;
  p.text('Nom et prénom : __________________________',14,y);y+=12;
  r.questions.forEach((q,i)=>{
    p.text(`Q${i+1}. ${q.text}`,14,y);y+=8;
    q.choices.forEach((x,j)=>{p.text(`[ ] ${L[j]}. ${x}`,20,y);y+=7});
    y+=5;
    if(y>275){p.addPage();y=18}
  });
  p.save('questionnaire-'+slug(r.title)+'.pdf')
}

/* ===================== UTILITAIRES ===================== */
function mark(q,a){
  let g=q.correctIndexes||[],
    all=a.length===g.length&&g.every(i=>a.includes(i)),
    wrong=a.some(i=>!g.includes(i));
  if(all)return 1;
  return q.partial?.enabled&&!wrong&&a.filter(i=>g.includes(i)).length==q.partial.requiredCorrectCount?+(q.partial.points||.5):0
}

function parseAnswers(v){
  let map={A:0,B:1,C:2,D:3};
  return [...new Set(String(v||'').toUpperCase().replace(/;/g,',').split(/[, ]+/).map(x=>x.trim()).filter(x=>x in map).map(x=>map[x]))]
}

function num(v,f){let n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:f}
function blank(){return{text:'',choices:['','','',''],correctIndexes:[],partial:{enabled:false,requiredCorrectCount:2,points:.5},explanation:''}}

async function roomCode(){
  let c,e=true;
  while(e){
    c=Array.from({length:6},()=>"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random()*32)]).join('');
    e=(await get(ref(db,`rooms/${c}`))).exists()
  }
  return c
}

function norm(x){return x.trim().toUpperCase().replace(/[^A-Z0-9]/g,'')}
function fmt(x){return Number(x||0).toFixed(1).replace('.0','').replace('.',',')}
function safe(x=''){let d=document.createElement('div');d.textContent=x;return d.innerHTML}
function slug(x){return x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-')}
function notify(x){toast.textContent=x;toast.classList.remove('hidden');setTimeout(()=>toast.classList.add('hidden'),4000)}
