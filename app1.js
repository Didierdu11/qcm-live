import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import { getDatabase, ref, onValue, get, set, push, update, runTransaction } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDJUz9GZSfO60bImWbno7MXzSNo1WfPcE0",
  authDomain: "qcm-live-dd3ef.firebaseapp.com",
  databaseURL: "https://qcm-live-dd3ef-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "qcm-live-dd3ef",
  storageBucket: "qcm-live-dd3ef.firebasestorage.app",
  messagingSenderId: "193182495104",
  appId: "1:193182495104:web:949a778f34d6cd262d5165"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const root = document.querySelector("#app");
const toast = document.querySelector("#toast");
const letters = ["A", "B", "C", "D"];

let user = null;
let stop = null;
let activeFilter = "all";
let currentHost = null;

signInAnonymously(auth)
  .catch(error => {
    console.error("Erreur Firebase :", error);
    setConnectionState("Erreur Firebase");
    notify(`${error.code || "Erreur"} : ${error.message}`);
  });

onAuthStateChanged(auth, currentUser => {
  user = currentUser;
  setConnectionState(currentUser ? "Connecté" : "Non connecté");
  if (currentUser) route();
});

window.addEventListener("hashchange", route);

function setConnectionState(text) {
  const state = document.querySelector("#connectionState");
  if (state) state.textContent = text;
}

function route() {
  if (!user) return;

  if (stop) {
    stop();
    stop = null;
  }

  const hash = location.hash || "#home";

  if (hash === "#library") return library();
  if (hash.startsWith("#join=")) return join(normalizeCode(hash.slice(6)));
  if (hash.startsWith("#host=")) return host(normalizeCode(hash.slice(6)));

  home();
}

function home() {
  root.innerHTML = document.querySelector("#homeTemplate").innerHTML;

  const showJoinButton = document.querySelector("#showJoin");
  const joinPanel = document.querySelector("#joinPanel");
  const joinCode = document.querySelector("#joinCode");
  const joinCodeButton = document.querySelector("#joinCodeButton");

  showJoinButton.onclick = () => {
    joinPanel.classList.toggle("hidden");
    joinCode.focus();
  };

  joinCodeButton.onclick = () => {
    const code = normalizeCode(joinCode.value);

    if (!/^[A-Z0-9]{6}$/.test(code)) {
      return notify("Code de salle invalide.");
    }

    location.hash = `#join=${code}`;
  };
}

function library() {
  root.innerHTML = document.querySelector("#libraryTemplate").innerHTML;

  const importButton = document.querySelector("#importButton");
  const importFile = document.querySelector("#importFile");
  const quizList = document.querySelector("#quizList");

  importButton.onclick = () => importFile.click();

  importFile.onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const quiz = JSON.parse(await file.text());

      if (!quiz.title || !Array.isArray(quiz.questions)) {
        throw new Error("Format JSON invalide.");
      }

      const id = push(ref(db, `quizzes/${user.uid}`)).key;

      await set(ref(db, `quizzes/${user.uid}/${id}`), {
        ...quiz,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      notify("QCM importé.");
    } catch (error) {
      notify(`Import impossible : ${error.message}`);
    }

    event.target.value = "";
  };

  stop = onValue(ref(db, `quizzes/${user.uid}`), snapshot => {
    const quizzes = snapshot.val() || {};
    const entries = Object.entries(quizzes);

    quizList.innerHTML = entries.length
      ? entries.map(([id, quiz]) => `
          <div class="row">
            <span>
              <strong>${escapeHtml(quiz.title)}</strong><br>
              ${quiz.questions?.length || 0} question(s)
            </span>
            <button class="button primary" data-id="${id}">Lancer</button>
          </div>
        `).join("")
      : "<p>Aucun QCM enregistré.</p>";

    document.querySelectorAll("[data-id]").forEach(button => {
      button.onclick = async () => {
        try {
          const code = await roomCode();
          const quiz = quizzes[button.dataset.id];

          await set(ref(db, `rooms/${code}`), {
            hostUid: user.uid,
            title: quiz.title,
            description: quiz.description || "",
            status: "OPEN",
            createdAt: Date.now(),
            defaultDuration: quiz.defaultDuration || 0,
            questions: quiz.questions,
            players: {},
            answers: {}
          });

          location.hash = `#host=${code}`;
        } catch (error) {
          notify(`Création de salle impossible : ${error.message}`);
        }
      };
    });
  }, error => notify(`Lecture impossible : ${error.message}`));
}

function host(code) {
  root.innerHTML = document.querySelector("#hostTemplate").innerHTML;

  const filterAll = document.querySelector("#filterAll");
  const filterOpen = document.querySelector("#filterOpen");
  const filterDone = document.querySelector("#filterDone");

  if (filterAll) filterAll.onclick = () => {
    activeFilter = "all";
    renderCurrentHost();
  };

  if (filterOpen) filterOpen.onclick = () => {
    activeFilter = "open";
    renderCurrentHost();
  };

  if (filterDone) filterDone.onclick = () => {
    activeFilter = "done";
    renderCurrentHost();
  };

  stop = onValue(ref(db, `rooms/${code}`), snapshot => {
    const room = snapshot.val();

    if (!room) {
      notify("Salle introuvable.");
      return;
    }

    if (room.hostUid !== user.uid) {
      notify("Cette salle appartient à un autre présentateur.");
      return;
    }

    currentHost = { code, room };
    renderHost(code, room);
  }, error => notify(`Lecture de la salle impossible : ${error.message}`));
}

function renderCurrentHost() {
  if (currentHost) renderHost(currentHost.code, currentHost.room);
}

function renderHost(code, room) {
  const hostTitle = document.querySelector("#hostTitle");
  const hostCode = document.querySelector("#hostCode");
  const qrBox = document.querySelector("#qrBox");
  const copyButton = document.querySelector("#copyJoinLink");
  const completedCount = document.querySelector("#completedCount");
  const completedLabel = document.querySelector("#completedLabel");
  const closeButton = document.querySelector("#closeRoom");
  const reportButton = document.querySelector("#downloadPdf");
  const blankPdfButton = document.querySelector("#downloadBlankPdf");
  const progressTable = document.querySelector("#progressTable");

  hostTitle.textContent = room.title;
  hostCode.textContent = code;

  const joinUrl = `${location.origin}${location.pathname}#join=${code}`;

  if (!qrBox.dataset.url) {
    qrBox.dataset.url = joinUrl;
    qrBox.innerHTML = "";

    new QRCode(qrBox, {
      text: joinUrl,
      width: 210,
      height: 210,
      colorDark: "#0f172a",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  copyButton.onclick = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      notify("Lien de participation copié.");
    } catch (error) {
      window.prompt("Copie ce lien de participation :", joinUrl);
    }
  };

  closeButton.onclick = async () => {
    try {
      await update(ref(db, `rooms/${code}`), { status: "CLOSED" });
      notify("Session fermée.");
    } catch (error) {
      notify(`Fermeture impossible : ${error.message}`);
    }
  };

  const allPlayers = Object.entries(room.players || {})
    .map(([uid, player]) => ({ uid, ...player }));

  reportButton.onclick = () => {
    try {
      makePdf(room, allPlayers);
    } catch (error) {
      console.error(error);
      notify(`PDF impossible : ${error.message}`);
    }
  };

  blankPdfButton.onclick = () => {
    try {
      makeBlankPdf(room);
    } catch (error) {
      console.error(error);
      notify(`PDF vierge impossible : ${error.message}`);
    }
  };

  const completed = allPlayers.filter(player => player.completed).length;
  completedCount.textContent = completed;
  completedLabel.textContent = `terminé(s) sur ${allPlayers.length} participant(s)`;

  const players = allPlayers.filter(player => {
    if (activeFilter === "done") return player.completed;
    if (activeFilter === "open") return !player.completed;
    return true;
  });

  progressTable.innerHTML = `
    <thead>
      <tr>
        <th>Participant</th>
        ${room.questions.map((_, index) => `<th>Q${index + 1}</th>`).join("")}
        <th>Score</th>
        <th>Progression</th>
        <th>Statut</th>
      </tr>
    </thead>
    <tbody>
      ${players.map(player => `
        <tr>
          <td>${escapeHtml(player.name)}</td>
          ${room.questions.map(question => {
            const score = player.evaluations?.[question.id];
            const css = score === 1 ? "score-1" : score === 0.5 ? "score-half" : score === 0 ? "score-0" : "score-none";
            return `<td class="${css}">${score === undefined ? "—" : formatScore(score)}</td>`;
          }).join("")}
          <td>${formatScore(player.score)} / ${room.questions.length}</td>
          <td>${player.answeredCount || 0} / ${room.questions.length}</td>
          <td>${player.completed ? "Terminé" : "En cours"}</td>
        </tr>
      `).join("")}
    </tbody>
  `;
}

function join(code) {
  root.innerHTML = document.querySelector("#joinTemplate").innerHTML;

  stop = onValue(ref(db, `rooms/${code}`), snapshot => {
    showJoinRoom(code, snapshot.val());
  }, error => notify(`Lecture de la salle impossible : ${error.message}`));
}

function showJoinRoom(code, room) {
  if (!room) return notify("Salle introuvable.");

  const joinTitle = document.querySelector("#joinTitle");
  const nameCard = document.querySelector("#nameCard");
  const questionCard = document.querySelector("#questionCard");
  const resultCard = document.querySelector("#resultCard");
  const playerName = document.querySelector("#playerName");
  const enterRoom = document.querySelector("#enterRoom");

  joinTitle.textContent = room.title;

  const player = room.players?.[user.uid];

  nameCard.classList.toggle("hidden", Boolean(player));
  questionCard.classList.add("hidden");
  resultCard.classList.add("hidden");

  if (!player) {
    enterRoom.onclick = async () => {
      const name = playerName.value.trim();

      if (name.length < 2 || !name.includes(" ")) {
        return notify("Saisis ton nom et ton prénom.");
      }

      try {
        await set(ref(db, `rooms/${code}/players/${user.uid}`), {
          name: name.slice(0, 60),
          joinedAt: Date.now(),
          currentQuestionIndex: 0,
          answeredCount: 0,
          score: 0,
          completed: false,
          evaluations: {}
        });
      } catch (error) {
        notify(`Connexion impossible : ${error.message}`);
      }
    };

    return;
  }

  if (player.completed) {
    resultCard.classList.remove("hidden");
    resultCard.innerHTML = `
      <section class="certificate">
        <div class="certificate-ribbon">QCM LIVE</div>
        <div class="certificate-icon">★</div>
        <p class="certificate-label">ATTESTATION DE PARTICIPATION</p>
        <h2>Félicitations !</h2>
        <p>Participant : <strong>${escapeHtml(player.name)}</strong></p>
        <p>Vous avez terminé le QCM :</p>
        <h3>${escapeHtml(room.title)}</h3>
        <div class="certificate-score">
          <span>Résultat obtenu</span>
          <strong>${formatScore(player.score)} / ${room.questions.length}</strong>
          <small>bonne(s) réponse(s)</small>
        </div>
        <p class="certificate-date">${new Date().toLocaleDateString("fr-FR")}</p>
      </section>
    `;
    return;
  }

  if (room.status !== "OPEN") {
    resultCard.classList.remove("hidden");
    resultCard.innerHTML = "<h2>Session fermée</h2><p>Le présentateur a fermé le QCM.</p>";
    return;
  }

  const question = room.questions[player.currentQuestionIndex];

  questionCard.classList.remove("hidden");
  questionCard.innerHTML = `
    <div class="progress-wrap">
      <div class="progress-label">
        <span>Progression</span>
        <strong>Question ${player.currentQuestionIndex + 1} / ${room.questions.length}</strong>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${player.currentQuestionIndex / room.questions.length * 100}%"></div>
      </div>
    </div>

    <h2 class="question-title">${escapeHtml(question.text)}</h2>

    ${question.choices.map((choice, index) => `
      <label class="answer">
        <input type="checkbox" value="${index}">
        <span class="letter">${letters[index]}</span>
        <span>${escapeHtml(choice)}</span>
      </label>
    `).join("")}

    <button id="validateAnswer" class="button primary wide">
      Valider ma réponse
    </button>
  `;

  const validateAnswer = document.querySelector("#validateAnswer");

  validateAnswer.onclick = async () => {
    const selected = [...questionCard.querySelectorAll("input:checked")]
      .map(input => Number(input.value));

    if (!selected.length) return notify("Sélectionne au moins une réponse.");

    validateAnswer.disabled = true;
    validateAnswer.textContent = "Enregistrement…";

    try {
      const score = calculateScore(question, selected);

      const transaction = await runTransaction(
        ref(db, `rooms/${code}/answers/${user.uid}/${question.id}`),
        currentValue => currentValue === null ? {
          selectedIndexes: selected,
          score,
          answeredAt: Date.now()
        } : undefined
      );

      if (!transaction.committed) {
        throw new Error("Réponse déjà enregistrée.");
      }

      const next = player.currentQuestionIndex + 1;
      const completed = next >= room.questions.length;

      await update(ref(db, `rooms/${code}/players/${user.uid}`), {
        currentQuestionIndex: next,
        answeredCount: (player.answeredCount || 0) + 1,
        score: (player.score || 0) + score,
        completed,
        evaluations: {
          ...(player.evaluations || {}),
          [question.id]: score
        }
      });
    } catch (error) {
      validateAnswer.disabled = false;
      validateAnswer.textContent = "Valider ma réponse";
      notify(`Erreur : ${error.message}`);
    }
  };
}

function calculateScore(question, selected) {
  const correct = question.correctIndexes || [];
  const hasWrong = selected.some(index => !correct.includes(index));
  const allCorrect = selected.length === correct.length && correct.every(index => selected.includes(index));

  if (allCorrect) return 1;

  const correctCount = selected.filter(index => correct.includes(index)).length;

  if (
    question.partial?.enabled &&
    !hasWrong &&
    correctCount === Number(question.partial.requiredCorrectCount)
  ) {
    return Number(question.partial.points || 0.5);
  }

  return 0;
}

function makePdf(room, players) {
  if (!window.jspdf) throw new Error("jsPDF n'est pas chargé.");

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const width = pdf.internal.pageSize.getWidth();

  players.forEach((player, playerIndex) => {
    if (playerIndex) pdf.addPage();

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text(room.title, 14, 16);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(`Participant : ${player.name}`, 14, 25);
    pdf.text(`Date : ${new Date(room.createdAt).toLocaleString("fr-FR")}`, 14, 31);
    pdf.text(`Note : ${formatScore(player.score)} / ${room.questions.length}`, 14, 37);

    let y = 48;

    room.questions.forEach((question, questionIndex) => {
      const answer = room.answers?.[player.uid]?.[question.id];
      const selected = answer?.selectedIndexes || [];
      const score = answer?.score || 0;
      const lines = pdf.splitTextToSize(`Question ${questionIndex + 1} — ${question.text}`, width - 28);

      if (y + lines.length * 6 + 50 > 280) {
        pdf.addPage();
        y = 16;
      }

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text(lines, 14, y);
      y += lines.length * 6 + 4;

      question.choices.forEach((choice, choiceIndex) => {
        const correct = question.correctIndexes.includes(choiceIndex);
        const chosen = selected.includes(choiceIndex);

        pdf.setFont("helvetica", correct ? "bold" : "normal");

        if (chosen) {
          pdf.setDrawColor(37, 99, 235);
          pdf.roundedRect(18, y - 4, width - 36, 7, 1, 1, "S");
        }

        pdf.text(`${letters[choiceIndex]}. ${choice}`, 20, y);
        y += 8;
      });

      pdf.setFont("helvetica", "normal");
      pdf.text(`Note obtenue : ${formatScore(score)} / 1`, 20, y);
      y += 11;
    });
  });

  pdf.addPage();
  pdf.setFontSize(18);
  pdf.text("Synthèse de la session", 14, 16);

  const headers = [
    "Participant",
    ...room.questions.map((_, index) => `Q${index + 1}`),
    "Score",
    "Statut"
  ];

  const rows = players.map(player => [
    player.name,
    ...room.questions.map(question => formatScore(player.evaluations?.[question.id] || 0)),
    `${formatScore(player.score)} / ${room.questions.length}`,
    player.completed ? "Terminé" : "En cours"
  ]);

  if (typeof pdf.autoTable === "function") {
    pdf.autoTable({ startY: 24, head: [headers], body: rows });
  }

  pdf.save(`rapport-${slugify(room.title)}.pdf`);
}

function makeBlankPdf(room) {
  if (!window.jspdf) throw new Error("jsPDF n'est pas chargé.");

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const width = pdf.internal.pageSize.getWidth();

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text(room.title, 14, 16);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text("Nom et prénom : ______________________________________", 14, 26);
  pdf.text(`Date : ${new Date().toLocaleDateString("fr-FR")}`, 14, 33);

  let y = 45;

  room.questions.forEach((question, questionIndex) => {
    const lines = pdf.splitTextToSize(`Question ${questionIndex + 1} — ${question.text}`, width - 28);

    if (y + lines.length * 6 + 45 > 280) {
      pdf.addPage();
      y = 16;
    }

    pdf.setFont("helvetica", "bold");
    pdf.text(lines, 14, y);
    y += lines.length * 6 + 4;

    pdf.setFont("helvetica", "normal");
    question.choices.forEach((choice, choiceIndex) => {
      pdf.text(`[ ] ${letters[choiceIndex]}. ${choice}`, 20, y);
      y += 8;
    });

    y += 7;
  });

  pdf.save(`questionnaire-${slugify(room.title)}.pdf`);
}

async function roomCode() {
  let code;
  let exists = true;

  while (exists) {
    code = Array.from(
      { length: 6 },
      () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]
    ).join("");

    exists = (await get(ref(db, `rooms/${code}`))).exists();
  }

  return code;
}

function normalizeCode(value) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function formatScore(value) {
  return Number(value || 0).toFixed(1).replace(".0", "").replace(".", ",");
}

function escapeHtml(value = "") {
  const element = document.createElement("div");
  element.textContent = value;
  return element.innerHTML;
}

function slugify(value = "") {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function notify(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");

  clearTimeout(notify.timeout);
  notify.timeout = setTimeout(() => {
    toast.classList.add("hidden");
  }, 4000);
}
