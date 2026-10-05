import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import { getDatabase, ref, get, set, update, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-database.js";

/* IMPORTANT : remplace chaque valeur par la configuration de ton application Web Firebase. */
const firebaseConfig = {
  apiKey: "AIzaSyDJUz9GZSfO60bImWbno7MXzSNo1WfPcE0",
  authDomain: "qcm-live-dd3ef.firebaseapp.com",
  databaseURL: "https://qcm-live-dd3ef-default-rtdb.europe-west1.firebasedatabase.app/",
  projectId: "qcm-live-dd3ef",
  storageBucket: "qcm-live-dd3ef.firebasestorage.app",
  messagingSenderId: "193182495104",
  appId: "1:193182495104:web:949a778f34d6cd262d5165"
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getDatabase(fbApp);
const root = document.querySelector("#app");
const toast = document.querySelector("#toast");
const letters = ["A", "B", "C", "D"];
let user = null;
let stopRoomListener = null;
let draft = [blankQuestion()];

boot();
async function boot() {
  try { await signInAnonymously(auth); }
  catch (error) { console.error(error); notice("Connexion Firebase impossible. Vérifie la configuration et l'authentification anonyme."); }
  onAuthStateChanged(auth, value => {
    user = value;
    document.querySelector("#connectionState").textContent = value ? "Connecté" : "Non connecté";
    if (value) route();
  });
  window.addEventListener("hashchange", route);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}
function route() {
  if (!user) return;
  if (stopRoomListener) { stopRoomListener(); stopRoomListener = null; }
  const hash = location.hash || "#home";
  if (hash === "#create") return createPage();
  if (hash.startsWith("#host=")) return hostPage(code(hash.slice(6)));
  if (hash.startsWith("#join=")) return joinPage(code(hash.slice(6)));
  if (hash.startsWith("#results=")) return resultsPage(code(hash.slice(9)));
  homePage();
}
function homePage() {
  root.innerHTML = document.querySelector("#homeTemplate").innerHTML;
  const panel = document.querySelector("#joinPanel"), input = document.querySelector("#roomCodeInput");
  document.querySelector("#showJoinButton").onclick = () => { panel.classList.toggle("hidden"); input.focus(); };
  document.querySelector("#joinByCodeButton").onclick = () => {
    const roomCode = code(input.value);
    if (!validCode(roomCode)) return notice("Le code doit contenir 6 caractères.");
    location.hash = `#join=${roomCode}`;
  };
}
function createPage() {
  root.innerHTML = document.querySelector("#createTemplate").innerHTML;
  document.querySelector("#addQuestionButton").onclick = () => { draft.push(blankQuestion()); editor(); };
  document.querySelector("#createRoomButton").onclick = saveRoom;
  editor();
}
function editor() {
  const target = document.querySelector("#questionsEditor"); if (!target) return;
  target.innerHTML = draft.map((q, qi) => `<section class="question-editor"><h2>Question ${qi + 1}</h2><label>Énoncé<input class="q-text" data-q="${qi}" value="${safe(q.text)}" placeholder="Ex. Quelle est la tension nominale en monophasé ?"></label>${q.choices.map((c, ci) => `<label class="choice-editor"><input type="radio" name="correct-${qi}" value="${ci}" ${q.correctIndex === ci ? "checked" : ""}><input class="choice-text" data-q="${qi}" data-c="${ci}" value="${safe(c)}" placeholder="Réponse ${letters[ci]}"></label>`).join("")}<label>Temps de réponse (secondes)<input class="duration" data-q="${qi}" type="number" min="5" max="300" value="${q.durationSeconds}"></label></section>`).join("");
  document.querySelectorAll(".q-text").forEach(el => el.oninput = e => draft[e.target.dataset.q].text = e.target.value);
  document.querySelectorAll(".choice-text").forEach(el => el.oninput = e => draft[e.target.dataset.q].choices[e.target.dataset.c] = e.target.value);
  document.querySelectorAll('input[type="radio"]').forEach(el => el.onchange = e => draft[Number(e.target.name.replace("correct-", ""))].correctIndex = Number(e.target.value));
  document.querySelectorAll(".duration").forEach(el => el.oninput = e => draft[e.target.dataset.q].durationSeconds = Number(e.target.value) || 30);
}
async function saveRoom() {
  const title = document.querySelector("#quizTitle").value.trim();
  if (title.length < 3) return notice("Indique un titre d'au moins 3 caractères.");
  const questions = draft.map((q, i) => ({ id:`q${i + 1}`, text:q.text.trim(), choices:q.choices.map(x => x.trim()), correctIndex:q.correctIndex, durationSeconds:Math.max(5, Math.min(300, Number(q.durationSeconds) || 30)) }));
  if (questions.some(q => q.text.length < 3 || q.choices.some(c => !c))) return notice("Complète chaque question et les quatre réponses.");
  const roomCode = await newRoomCode();
  await set(ref(db, `rooms/${roomCode}`), { title, hostUid:user.uid, status:"WAITING", currentQuestionIndex:-1, createdAt:Date.now(), questions, players:{}, answers:{} });
  draft = [blankQuestion()]; location.hash = `#host=${roomCode}`;
}
function hostPage(roomCode) {
  root.innerHTML = document.querySelector("#hostTemplate").innerHTML;
  stopRoomListener = onValue(ref(db, `rooms/${roomCode}`), snap => { const room = snap.val(); if (!room) return missing("Cette salle n'existe plus."); updateHost(roomCode, room); });
}
function updateHost(roomCode, room) {
  document.querySelector("#hostQuizTitle").textContent = room.title;
  document.querySelector("#hostRoomCode").textContent = roomCode;
  const joinUrl = `${location.origin}${location.pathname}#join=${roomCode}`;
  const qr = document.querySelector("#qrCode");
  if (!qr.dataset.url) { qr.dataset.url = joinUrl; new QRCode(qr, { text:joinUrl, width:210, height:210, colorDark:"#0f172a", colorLight:"#ffffff", correctLevel:QRCode.CorrectLevel.M }); }
  document.querySelector("#copyJoinLinkButton").onclick = async () => { try { await navigator.clipboard.writeText(joinUrl); notice("Lien copié."); } catch { notice(joinUrl); } };
  const players = Object.values(room.players || {});
  document.querySelector("#playersCount").textContent = players.length;
  document.querySelector("#playersList").innerHTML = players.length ? players.sort((a,b) => a.name.localeCompare(b.name)).map(p => `<div class="player-chip">${safe(p.name)}</div>`).join("") : "<p>Aucun participant pour le moment.</p>";
  hostControls(roomCode, room); hostStats(room);
}
function hostControls(roomCode, room) {
  const box = document.querySelector("#hostControls"), qs = room.questions || [];
  if (room.status === "WAITING") { box.innerHTML = `<h2>Prêt à démarrer ?</h2><p>${qs.length} question(s) prêtes.</p><button id="start" class="button primary">Démarrer le QCM</button>`; document.querySelector("#start").onclick = () => update(ref(db,`rooms/${roomCode}`),{status:"QUESTION",currentQuestionIndex:0}); return; }
  if (room.status === "QUESTION") { const q = qs[room.currentQuestionIndex]; box.innerHTML = `<span class="eyebrow">Question ${room.currentQuestionIndex + 1} / ${qs.length}</span><h2>${safe(q.text)}</h2><p>Les joueurs répondent depuis leur téléphone.</p><button id="correct" class="button secondary">Fermer les réponses et afficher la correction</button>`; document.querySelector("#correct").onclick = () => update(ref(db,`rooms/${roomCode}`),{status:"CORRECTION"}); return; }
  if (room.status === "CORRECTION") { const last = room.currentQuestionIndex >= qs.length - 1; box.innerHTML = `<h2>Correction affichée</h2><p>${last ? "La dernière question est terminée." : "Passe à la question suivante quand tu es prêt."}</p><button id="next" class="button primary">${last ? "Afficher les résultats" : "Question suivante"}</button>`; document.querySelector("#next").onclick = () => update(ref(db,`rooms/${roomCode}`), last ? {status:"FINISHED"} : {status:"QUESTION",currentQuestionIndex:room.currentQuestionIndex + 1}); return; }
  box.innerHTML = `<h2>QCM terminé</h2><a class="button primary" href="#results=${roomCode}">Afficher les résultats finaux</a>`;
}
function hostStats(room) {
  const box = document.querySelector("#hostLiveStats");
  if (!["QUESTION","CORRECTION"].includes(room.status)) return box.classList.add("hidden");
  box.classList.remove("hidden"); const q = room.questions[room.currentQuestionIndex], answers = Object.values(room.answers?.[q.id] || {}), playerCount = Object.keys(room.players || {}).length;
  document.querySelector("#answerCount").textContent = `${answers.length} / ${playerCount}`;
  document.querySelector("#correctCount").textContent = answers.filter(a => a.selectedIndex === q.correctIndex).length;
  document.querySelector("#answerDistribution").innerHTML = q.choices.map((_, i) => { const n = answers.filter(a => a.selectedIndex === i).length; return `<div class="dist-row"><strong>${letters[i]}</strong><div class="track"><div class="fill" style="width:${(n / Math.max(1,playerCount))*100}%"></div></div><span>${n}</span></div>`; }).join("");
}
function joinPage(roomCode) {
  root.innerHTML = document.querySelector("#joinTemplate").innerHTML;
  const nameKey = `qcm-live-name-${roomCode}`, rememberedName = localStorage.getItem(nameKey) || "";
  stopRoomListener = onValue(ref(db, `rooms/${roomCode}`), snap => { const room = snap.val(); if (!room) return missing("Cette salle n'existe pas."); updateJoin(roomCode, room, rememberedName, nameKey); });
}
function updateJoin(roomCode, room, rememberedName, nameKey) {
  document.querySelector("#joinQuizTitle").textContent = room.title;
  const nameBox=document.querySelector("#nameCard"), waiting=document.querySelector("#waitingCard"), question=document.querySelector("#questionCard"), correction=document.querySelector("#correctionCard"), finished=document.querySelector("#finishedCard");
  [waiting,question,correction,finished].forEach(x => x.classList.add("hidden"));
  const player = room.players?.[user.uid]; nameBox.classList.toggle("hidden",!!player);
  if (!player) { const input=document.querySelector("#playerNameInput"); input.value=rememberedName; document.querySelector("#enterRoomButton").onclick=async()=>{const name=input.value.trim().slice(0,24);if(name.length<2)return notice("Le pseudo doit contenir au moins 2 caractères.");localStorage.setItem(nameKey,name);await set(ref(db,`rooms/${roomCode}/players/${user.uid}`),{name,joinedAt:Date.now()});}; return; }
  if (room.status === "WAITING") return waiting.classList.remove("hidden");
  if (room.status === "QUESTION") { question.classList.remove("hidden"); return playerQuestion(roomCode,room); }
  if (room.status === "CORRECTION") { correction.classList.remove("hidden"); return playerCorrection(room); }
  finished.classList.remove("hidden"); finished.innerHTML=`<h2>QCM terminé</h2><p>Ton score : <strong>${score(room,user.uid)} / ${room.questions.length}</strong></p><a class="button primary wide" href="#results=${roomCode}">Voir les résultats</a>`;
}
function playerQuestion(roomCode,room) { const box=document.querySelector("#questionCard"),q=room.questions[room.currentQuestionIndex],answer=room.answers?.[q.id]?.[user.uid]; box.innerHTML=`<span class="eyebrow">Question ${room.currentQuestionIndex+1} / ${room.questions.length}</span><h2 class="question-title">${safe(q.text)}</h2>${q.choices.map((c,i)=>`<button class="answer-button ${answer?.selectedIndex===i?"selected":""}" data-i="${i}" ${answer?"disabled":""}><span class="answer-letter">${letters[i]}</span><span>${safe(c)}</span></button>`).join("")}${answer?"<p>Réponse envoyée. Attente de la correction…</p>":""}`; if(!answer) document.querySelectorAll(".answer-button").forEach(b=>b.onclick=()=>answerQuestion(roomCode,q.id,Number(b.dataset.i))); }
function playerCorrection(room) { const q=room.questions[room.currentQuestionIndex],a=room.answers?.[q.id]?.[user.uid],ok=a?.selectedIndex===q.correctIndex; document.querySelector("#correctionCard").innerHTML=`<span class="eyebrow">Correction</span><h2>${ok?"Bonne réponse !":"Réponse enregistrée"}</h2><p>La bonne réponse était : <strong>${letters[q.correctIndex]} — ${safe(q.choices[q.correctIndex])}</strong></p><p>${a?(ok?"Tu gagnes 1 point.":"Tu ne gagnes pas de point."):"Tu n'as pas répondu à cette question."}</p>`; }
async function answerQuestion(roomCode,questionId,selectedIndex) { const answerRef=ref(db,`rooms/${roomCode}/answers/${questionId}/${user.uid}`); const result=await runTransaction(answerRef,current=>current===null?{selectedIndex,answeredAt:Date.now()}:undefined); if(!result.committed)notice("Une réponse a déjà été enregistrée."); }
function resultsPage(roomCode) { root.innerHTML=document.querySelector("#resultsTemplate").innerHTML; stopRoomListener=onValue(ref(db,`rooms/${roomCode}`),snap=>{const room=snap.val();if(!room)return missing("Cette salle n'existe pas.");document.querySelector("#resultsTitle").textContent=room.title;leaderboard(room);questionStats(room);}); }
function leaderboard(room) { const players=Object.entries(room.players||{}).map(([uid,p])=>({name:p.name,score:score(room,uid)})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)); document.querySelector("#leaderboard").innerHTML=players.length?players.map((p,i)=>`<div class="rank-row"><span>${i+1}. ${safe(p.name)}</span><strong>${p.score} / ${room.questions.length}</strong></div>`).join(""):"<p>Aucun participant.</p>"; }
function questionStats(room) {const total=Object.keys(room.players||{}).length;document.querySelector("#questionStats").innerHTML=room.questions.map((q,i)=>{const answers=Object.values(room.answers?.[q.id]||{}),n=answers.filter(a=>a.selectedIndex===q.correctIndex).length,p=answers.length?Math.round(n/answers.length*100):0;return `<div class="question-stat"><span>Q${i+1} — ${safe(q.text)}</span><strong>${n}/${total} correctes (${p} %)</strong></div>`;}).join("");}
function score(room,uid){return(room.questions||[]).reduce((sum,q)=>sum+(room.answers?.[q.id]?.[uid]?.selectedIndex===q.correctIndex?1:0),0)}
function blankQuestion(){return{text:"",choices:["","","",""],correctIndex:0,durationSeconds:30}}
async function newRoomCode(){let roomCode,exists=true;while(exists){roomCode=Array.from({length:6},()=>"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random()*32)]).join("");exists=(await get(ref(db,`rooms/${roomCode}`))).exists()}return roomCode}
function code(v){return v.trim().toUpperCase().replace(/[^A-Z0-9]/g,"")}
function validCode(v){return /^[A-Z0-9]{6}$/.test(v)}
function missing(message){root.innerHTML=`<section class="card"><h1>Erreur</h1><p>${safe(message)}</p><a class="button primary" href="#home">Retour à l'accueil</a></section>`}
function safe(v=""){const d=document.createElement("div");d.textContent=v;return d.innerHTML}
function notice(message){toast.textContent=message;toast.classList.remove("hidden");clearTimeout(notice.timer);notice.timer=setTimeout(()=>toast.classList.add("hidden"),3500)}
