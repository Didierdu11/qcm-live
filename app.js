import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";

import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";

import {
  getDatabase,
  ref,
  onValue,
  get,
  set,
  push,
  update,
  runTransaction
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDJUz9GZSfO60bImWbno7MXzSNo1WfPcE0",
  authDomain: "qcm-live-dd3ef.firebaseapp.com",
  databaseURL: "https://qcm-live-dd3ef-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "qcm-live-dd3ef",
  storageBucket: "qcm-live-dd3ef.firebasestorage.app",
  messagingSenderId: "193182495104",
  appId: "1:193182495104:web:949a778f34d6cd262d5165"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);

const appRoot = document.querySelector("#app");
const toast = document.querySelector("#toast");
const letters = ["A", "B", "C", "D"];

let user = null;
let activeListener = null;
let timer = null;
let editingId = null;
let draftQuestions = [];
let activeFilter = "all";
let currentHost = null;

signInAnonymously(auth)
  .then(result => {
    console.log("Authentification Firebase réussie :", result.user.uid);
  })
  .catch(error => {
    console.error("Erreur Firebase Authentication :", error);
    setConnectionState("Erreur Firebase");
    notice(`${error.code || "Erreur"} : ${error.message}`);
  });

onAuthStateChanged(auth, currentUser => {
  user = currentUser;
  setConnectionState(currentUser ? "Connecté" : "Non connecté");

  if (currentUser) {
    renderRoute();
  }
});

window.addEventListener("hashchange", renderRoute);

function setConnectionState(text) {
  const element = document.querySelector("#connectionState");
  if (element) element.textContent = text;
}

function renderRoute() {
  if (!user) return;

  if (activeListener) {
    activeListener();
    activeListener = null;
  }

  clearInterval(timer);

  const hash = window.location.hash || "#home";

  if (hash === "#library") return renderLibrary();
  if (hash.startsWith("#editor=")) return renderEditor(hash.slice(8));
  if (hash.startsWith("#host=")) return renderHostPage(normalizeCode(hash.slice(6)));
  if (hash.startsWith("#join=")) return renderJoinPage(normalizeCode(hash.slice(6)));

  renderHome();
}

function renderHome() {
  appRoot.innerHTML = document.querySelector("#homeTemplate").innerHTML;

  const panel = document.querySelector("#joinPanel");
  const input = document.querySelector("#joinCode");
  const showJoin = document.querySelector("#showJoin");
  const joinButton = document.querySelector("#joinCodeButton");

  showJoin.addEventListener("click", () => {
    panel.classList.toggle("hidden");
    input.focus();
  });

  joinButton.addEventListener("click", () => {
    const code = normalizeCode(input.value);

    if (!/^[A-Z0-9]{6}$/.test(code)) {
      notice("Le code de salle doit contenir 6 caractères.");
      return;
    }

    window.location.hash = `#join=${code}`;
  });
}

function renderLibrary() {
  appRoot.innerHTML = document.querySelector("#libraryTemplate").innerHTML;

  const importButton = document.querySelector("#importButton");
  const importFile = document.querySelector("#importFile");
  const excelButton = document.querySelector("#importExcelButton");
  const excelFile = document.querySelector("#importExcelFile");

  importButton.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", importJsonFile);

  excelButton.addEventListener("click", () => excelFile.click());
  excelFile.addEventListener("change", () => {
    notice("L'import Excel nécessite d'ajouter SheetJS dans index.html.");
  });

  activeListener = onValue(
    ref(db, `quizzes/${user.uid}`),
    snapshot => {
      const quizzes = snapshot.val() || {};
      const entries = Object.entries(quizzes);
      const list = document.querySelector("#quizList");

      if (!entries.length) {
        list.innerHTML = "<p>Aucun QCM enregistré.</p>";
        return;
      }

      list.innerHTML = entries
        .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
        .map(([id, quiz]) => `
          <div class="row">
            <span>
              <strong>${escapeHtml(quiz.title)}</strong><br>
              <small>${quiz.questions?.length || 0} question(s)</small>
            </span>
            <span>
              <a class="button secondary" href="#editor=${id}">Modifier</a>
              <button class="button primary" data-launch="${id}">Lancer</button>
            </span>
          </div>
        `)
        .join("");

      document.querySelectorAll("[data-launch]").forEach(button => {
        button.addEventListener("click", () => {
          launchRoom(button.dataset.launch, quizzes[button.dataset.launch]);
        });
      });
    },
    error => notice(`Lecture des QCM impossible : ${error.message}`)
  );
}

async function importJsonFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const quiz = JSON.parse(await file.text());

    if (!quiz.title || !Array.isArray(quiz.questions)) {
      throw new Error("Format JSON invalide.");
    }

    const quizId = push(ref(db, `quizzes/${user.uid}`)).key;

    await set(ref(db, `quizzes/${user.uid}/${quizId}`), {
      ...quiz,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    notice("QCM importé avec succès.");
  } catch (error) {
    console.error(error);
    notice(`Import impossible : ${error.message}`);
  }

  event.target.value = "";
}

async function renderEditor(value) {
  editingId = value === "new" ? null : value;
  appRoot.innerHTML = document.querySelector("#editorTemplate").innerHTML;

  if (editingId) {
    const snapshot = await get(ref(db, `quizzes/${user.uid}/${editingId}`));
    const quiz = snapshot.val();

    if (!quiz) {
      renderRoute();
      return;
    }

    document.querySelector("#editorHeading").textContent = "Modifier le QCM";
    document.querySelector("#quizTitle").value = quiz.title || "";
    document.querySelector("#quizDescription").value = quiz.description || "";
    document.querySelector("#defaultDuration").value = quiz.defaultDuration || 0;
    draftQuestions = quiz.questions || [blankQuestion()];
  } else {
    draftQuestions = [blankQuestion()];
  }

  document.querySelector("#addQuestion").addEventListener("click", () => {
    draftQuestions.push(blankQuestion());
    drawEditor();
  });

  document.querySelector("#saveQuiz").addEventListener("click", saveQuiz);
  drawEditor();
}

function drawEditor() {
  const editor = document.querySelector("#questionsEditor");

  editor.innerHTML = draftQuestions
    .map((question, questionIndex) => `
      <section class="question-editor">
        <h2>Question ${questionIndex + 1}</h2>

        <label>
          Énoncé
          <input class="question-text" data-question="${questionIndex}" value="${escapeHtml(question.text)}">
        </label>

        ${question.choices.map((choice, choiceIndex) => `
          <label class="choice-editor">
            <input
              class="correct-choice"
              data-question="${questionIndex}"
              data-choice="${choiceIndex}"
              type="checkbox"
              ${question.correctIndexes.includes(choiceIndex) ? "checked" : ""}
            >
            <input
              class="choice-text"
              data-question="${questionIndex}"
              data-choice="${choiceIndex}"
              value="${escapeHtml(choice)}"
              placeholder="Réponse ${letters[choiceIndex]}"
            >
          </label>
        `).join("")}

        <label>
          <input
            class="partial-enabled"
            data-question="${questionIndex}"
            type="checkbox"
            ${question.partial.enabled ? "checked" : ""}
          >
          Autoriser une note partielle
        </label>

        <label>
          Bonnes réponses pour le demi-point
          <input
            class="partial-count"
            data-question="${questionIndex}"
            type="number"
            min="1"
            max="3"
            value="${question.partial.requiredCorrectCount}"
          >
        </label>

        <label>
          Points partiels
          <input
            class="partial-points"
            data-question="${questionIndex}"
            type="number"
            min="0"
            max="1"
            step="0.5"
            value="${question.partial.points}"
          >
        </label>

        <label>
          Durée de la question en secondes, 0 = durée par défaut
          <input
            class="question-duration"
            data-question="${questionIndex}"
            type="number"
            min="0"
            max="3600"
            value="${question.duration || 0}"
          >
        </label>
      </section>
    `)
    .join("");

  document.querySelectorAll(".question-text").forEach(input => {
    input.addEventListener("input", event => {
      draftQuestions[event.target.dataset.question].text = event.target.value;
    });
  });

  document.querySelectorAll(".choice-text").forEach(input => {
    input.addEventListener("input", event => {
      const questionIndex = Number(event.target.dataset.question);
      const choiceIndex = Number(event.target.dataset.choice);
      draftQuestions[questionIndex].choices[choiceIndex] = event.target.value;
    });
  });

  document.querySelectorAll(".correct-choice").forEach(input => {
    input.addEventListener("change", event => {
      const questionIndex = Number(event.target.dataset.question);
      const choiceIndex = Number(event.target.dataset.choice);
      const question = draftQuestions[questionIndex];

      question.correctIndexes = event.target.checked
        ? [...new Set([...question.correctIndexes, choiceIndex])]
        : question.correctIndexes.filter(value => value !== choiceIndex);
    });
  });

  document.querySelectorAll(".partial-enabled").forEach(input => {
    input.addEventListener("change", event => {
      draftQuestions[event.target.dataset.question].partial.enabled = event.target.checked;
    });
  });

  document.querySelectorAll(".partial-count").forEach(input => {
    input.addEventListener("input", event => {
      draftQuestions[event.target.dataset.question].partial.requiredCorrectCount =
        Number(event.target.value) || 2;
    });
  });

  document.querySelectorAll(".partial-points").forEach(input => {
    input.addEventListener("input", event => {
      draftQuestions[event.target.dataset.question].partial.points =
        Number(event.target.value) || 0.5;
    });
  });

  document.querySelectorAll(".question-duration").forEach(input => {
    input.addEventListener("input", event => {
      draftQuestions[event.target.dataset.question].duration =
        Number(event.target.value) || 0;
    });
  });
}

async function saveQuiz() {
  const title = document.querySelector("#quizTitle").value.trim();
  const description = document.querySelector("#quizDescription").value.trim();
  const defaultDuration = Number(document.querySelector("#defaultDuration").value) || 0;

  const questions = draftQuestions.map((question, index) => ({
    ...question,
    id: `q${index + 1}`,
    text: question.text.trim(),
    choices: question.choices.map(choice => choice.trim())
  }));

  if (
    title.length < 3 ||
    questions.some(question =>
      question.text.length < 3 ||
      question.choices.some(choice => !choice) ||
      !question.correctIndexes.length
    )
  ) {
    notice("Complète toutes les questions, les 4 réponses et les bonnes réponses.");
    return;
  }

  const quizId = editingId || push(ref(db, `quizzes/${user.uid}`)).key;

  await set(ref(db, `quizzes/${user.uid}/${quizId}`), {
    title,
    description,
    defaultDuration,
    questions,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });

  window.location.hash = "#library";
}

async function launchRoom(quizId, quiz) {
  try {
    const code = await generateRoomCode();

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

    window.location.hash = `#host=${code}`;
  } catch (error) {
    notice(`Création de salle impossible : ${error.message}`);
  }
}

function renderHostPage(roomCode) {
  appRoot.innerHTML = document.querySelector("#hostTemplate").innerHTML;

  document.querySelector("#filterAll").addEventListener("click", () => {
    activeFilter = "all";
    renderCurrentHost();
  });

  document.querySelector("#filterOpen").addEventListener("click", () => {
    activeFilter = "open";
    renderCurrentHost();
  });

  document.querySelector("#filterDone").addEventListener("click", () => {
    activeFilter = "done";
    renderCurrentHost();
  });

  activeListener = onValue(
    ref(db, `rooms/${roomCode}`),
    snapshot => {
      const room = snapshot.val();

      if (!room) {
        notice("Salle introuvable.");
        return;
      }

      if (room.hostUid !== user.uid) {
        notice("Cette salle appartient à un autre présentateur.");
        return;
      }

      currentHost = {
        code: roomCode,
        room
      };

      renderHost(roomCode, room);
    },
    error => notice(`Lecture de la salle impossible : ${error.message}`)
  );
}

function renderCurrentHost() {
  if (!currentHost) return;
  renderHost(currentHost.code, currentHost.room);
}

function renderHost(roomCode, room) {
  const titleElement = document.querySelector("#hostTitle");
  const codeElement = document.querySelector("#hostCode");
  const qrElement = document.querySelector("#qrBox");
  const copyButton = document.querySelector("#copyJoinLink");
  const completedCount = document.querySelector("#completedCount");
  const completedLabel = document.querySelector("#completedLabel");
  const closeButton = document.querySelector("#closeRoom");
  const pdfButton = document.querySelector("#downloadPdf");
  const blankPdfButton = document.querySelector("#downloadBlankPdf");
  const table = document.querySelector("#progressTable");

  titleElement.textContent = room.title;
  codeElement.textContent = roomCode;

  const joinUrl = `${window.location.origin}${window.location.pathname}#join=${roomCode}`;

  if (!qrElement.dataset.url) {
    qrElement.dataset.url = joinUrl;

    new QRCode(qrElement, {
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
      notice("Lien copié.");
    } catch {
      notice(joinUrl);
    }
  };

  closeButton.onclick = async () => {
    try {
      await update(ref(db, `rooms/${roomCode}`), {
        status: "CLOSED"
      });
      notice("Session fermée.");
    } catch (error) {
      notice(`Fermeture impossible : ${error.message}`);
    }
  };

  const allPlayers = Object.entries(room.players || {})
    .map(([uid, player]) => ({ uid, ...player }));

  const visiblePlayers = allPlayers.filter(player => {
    if (activeFilter === "done") return player.completed === true;
    if (activeFilter === "open") return player.completed !== true;
    return true;
  });

  const finished = allPlayers.filter(player => player.completed).length;
  completedCount.textContent = finished;
  completedLabel.textContent =
    `terminé(s) sur ${allPlayers.length} participant(s)`;

  pdfButton.onclick = () => makePdf(room, allPlayers);
  blankPdfButton.onclick = () => makeBlankPdf(room);

  const questions = room.questions || [];

  table.innerHTML = `
    <thead>
      <tr>
        <th>Participant</th>
        ${questions.map((_, index) => `<th>Q${index + 1}</th>`).join("")}
        <th>Score</th>
        <th>Progression</th>
        <th>Statut</th>
      </tr>
    </thead>
    <tbody>
      ${visiblePlayers
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(player => `
          <tr>
            <td>${escapeHtml(player.name)}</td>
            ${questions.map(question => {
              const value = player.evaluations?.[question.id];
              const className =
                value === 1 ? "score-1" :
                value === 0.5 ? "score-half" :
                value === 0 ? "score-0" :
                "score-none";

              return `
                <td class="${className}">
                  ${value === undefined ? "—" : formatScore(value)}
                </td>
              `;
            }).join("")}
            <td>${formatScore(player.score)} / ${questions.length}</td>
            <td>${player.answeredCount || 0} / ${questions.length}</td>
            <td>${player.completed ? "Terminé" : "En cours"}</td>
          </tr>
        `)
        .join("")}
    </tbody>
  `;
}

function renderJoinPage(roomCode) {
  appRoot.innerHTML = document.querySelector("#joinTemplate").innerHTML;

  activeListener = onValue(
    ref(db, `rooms/${roomCode}`),
    snapshot => {
      const room = snapshot.val();

      if (!room) {
        notice("Cette salle n'existe pas.");
        return;
      }

      updateJoin(roomCode, room);
    },
    error => notice(`Lecture de la salle impossible : ${error.message}`)
  );
}

function updateJoin(roomCode, room) {
  const titleElement = document.querySelector("#joinTitle");
  const nameCard = document.querySelector("#nameCard");
  const playerName = document.querySelector("#playerName");
  const enterRoom = document.querySelector("#enterRoom");
  const questionCard = document.querySelector("#questionCard");
  const resultCard = document.querySelector("#resultCard");

  titleElement.textContent = room.title;

  const player = room.players?.[user.uid];

  nameCard.classList.toggle("hidden", Boolean(player));
  questionCard.classList.add("hidden");
  resultCard.classList.add("hidden");

  if (!player) {
    enterRoom.onclick = async () => {
      const name = playerName.value.trim();

      if (name.length < 2) {
        notice("Saisis ton nom et ton prénom.");
        return;
      }

      if (room.status !== "OPEN") {
        notice("La salle est fermée.");
        return;
      }

      try {
        await set(
          ref(db, `rooms/${roomCode}/players/${user.uid}`),
          {
            name: name.slice(0, 24),
            joinedAt: Date.now(),
            currentQuestionIndex: 0,
            answeredCount: 0,
            score: 0,
            completed: false,
            evaluations: {}
          }
        );
      } catch (error) {
        notice(`Connexion à la salle impossible : ${error.message}`);
      }
    };

    return;
  }

  if (player.completed) {
    resultCard.classList.remove("hidden");
    resultCard.innerHTML = `
      <h2>QCM terminé</h2>
      <p>
        Ton résultat :
        <strong>${formatScore(player.score)} sur ${room.questions.length}</strong>
      </p>
    `;
    return;
  }

  if (room.status !== "OPEN") {
    resultCard.classList.remove("hidden");
    resultCard.innerHTML = `
      <h2>Session fermée</h2>
      <p>Le présentateur a fermé le QCM.</p>
    `;
    return;
  }

  const question = room.questions[player.currentQuestionIndex];

  if (!question) {
    notice("Question introuvable.");
    return;
  }

  questionCard.classList.remove("hidden");

  const duration = question.duration || room.defaultDuration || 0;
  const progress =
    (player.currentQuestionIndex / room.questions.length) * 100;

  questionCard.innerHTML = `
    <div class="progress-wrap">
      <div class="progress-label">
        <span>Progression</span>
        <strong>
          Question ${player.currentQuestionIndex + 1} / ${room.questions.length}
        </strong>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${progress}%"></div>
      </div>
    </div>

    ${duration > 0 ? `
      <div id="timer" class="timer">
        Temps restant : ${duration} s
      </div>
    ` : ""}

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

  const validateButton = document.querySelector("#validateAnswer");

  validateButton.addEventListener("click", async () => {
    try {
      await submitAnswer(roomCode, question, player, room);
    } catch (error) {
      console.error(error);
      validateButton.disabled = false;
      validateButton.textContent = "Valider ma réponse";
      notice(`Erreur : ${error.message}`);
    }
  });

  startTimer(duration, roomCode, question, player, room);
}

function startTimer(duration, roomCode, question, player, room) {
  clearInterval(timer);

  if (!duration) return;

  const endTime = Date.now() + duration * 1000;
  const timerElement = document.querySelector("#timer");

  const updateTimer = () => {
    if (!timerElement) {
      clearInterval(timer);
      return;
    }

    const remaining = Math.max(
      0,
      Math.ceil((endTime - Date.now()) / 1000)
    );

    timerElement.textContent =
      `Temps restant : ${remaining} s`;

    timerElement.classList.toggle(
      "warning",
      remaining <= 5 && remaining > 0
    );

    timerElement.classList.toggle(
      "danger",
      remaining === 0
    );

    if (
      remaining <= 5 &&
      remaining > 0 &&
      typeof navigator.vibrate === "function"
    ) {
      navigator.vibrate(100);
    }

    if (remaining === 0) {
      clearInterval(timer);
      notice("Temps écoulé.");
      submitAnswer(roomCode, question, player, room, []);
    }
  };

  updateTimer();
  timer = setInterval(updateTimer, 250);
}

async function submitAnswer(
  roomCode,
  question,
  player,
  room,
  forcedSelection = null
) {
  let selectedIndexes;

  if (Array.isArray(forcedSelection)) {
    selectedIndexes = forcedSelection;
  } else {
    selectedIndexes = [
      ...document.querySelectorAll(
        "#questionCard input[type='checkbox']:checked"
      )
    ].map(input => Number(input.value));
  }

  const duration = question.duration || room.defaultDuration || 0;
  const timeExpired = duration > 0 && selectedIndexes.length === 0 && forcedSelection !== null;

  if (selectedIndexes.length === 0 && !timeExpired) {
    notice("Sélectionne au moins une réponse.");
    return;
  }

  const validateButton = document.querySelector("#validateAnswer");

  if (validateButton) {
    validateButton.disabled = true;
    validateButton.textContent = "Enregistrement…";
  }

  const score = calculateScore(question, selectedIndexes);

  const answerReference = ref(
    db,
    `rooms/${roomCode}/answers/${user.uid}/${question.id}`
  );

  const transaction = await runTransaction(
    answerReference,
    currentValue => {
      if (currentValue !== null) return;

      return {
        selectedIndexes,
        score,
        answeredAt: Date.now(),
        timeExpired
      };
    }
  );

  if (!transaction.committed) {
    throw new Error("Réponse déjà enregistrée.");
  }

  const nextIndex = player.currentQuestionIndex + 1;
  const completed = nextIndex >= room.questions.length;

  await update(
    ref(db, `rooms/${roomCode}/players/${user.uid}`),
    {
      currentQuestionIndex: nextIndex,
      answeredCount: (player.answeredCount || 0) + 1,
      score: (player.score || 0) + score,
      completed,
      evaluations: {
        ...(player.evaluations || {}),
        [question.id]: score
      }
    }
  );
}

function calculateScore(question, selectedIndexes) {
  const correctIndexes = question.correctIndexes || [];
  const selected = [...new Set(selectedIndexes)];

  const hasWrongAnswer = selected.some(
    index => !correctIndexes.includes(index)
  );

  const allCorrect =
    selected.length === correctIndexes.length &&
    correctIndexes.every(index => selected.includes(index));

  if (allCorrect) return 1;

  const correctSelected = selected.filter(
    index => correctIndexes.includes(index)
  ).length;

  if (
    question.partial?.enabled &&
    !hasWrongAnswer &&
    correctSelected === Number(question.partial.requiredCorrectCount)
  ) {
    return Number(question.partial.points || 0.5);
  }

  return 0;
}

function makePdf(room, players) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();

  players.forEach((player, playerIndex) => {
    if (playerIndex > 0) pdf.addPage();

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
      const lines = pdf.splitTextToSize(
        `Question ${questionIndex + 1} — ${question.text}`,
        pageWidth - 28
      );

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
          pdf.roundedRect(18, y - 4, pageWidth - 36, 7, 1, 1, "S");
        }

        pdf.text(
          `${letters[choiceIndex]}. ${choice}`,
          20,
          y
        );

        y += 8;
      });

      pdf.setFont("helvetica", "normal");
      pdf.text(`Note : ${formatScore(score)} / 1`, 20, y);
      y += 11;
    });
  });

  pdf.addPage();
  pdf.setFontSize(18);
  pdf.text("Synthèse de la session", 14, 16);

  pdf.autoTable({
    startY: 24,
    head: [[
      "Participant",
      ...room.questions.map((_, index) => `Q${index + 1}`),
      "Score",
      "Statut"
    ]],
    body: players.map(player => [
      player.name,
      ...room.questions.map(question =>
        formatScore(player.evaluations?.[question.id] || 0)
      ),
      `${formatScore(player.score)} / ${room.questions.length}`,
      player.completed ? "Terminé" : "En cours"
    ])
  });

  pdf.save(`rapport-${slugify(room.title)}.pdf`);
}

function makeBlankPdf(room) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text(room.title, 14, 16);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text("Nom et prénom : ______________________________________", 14, 26);
  pdf.text(`Date : ${new Date().toLocaleDateString("fr-FR")}`, 14, 33);

  let y = 45;

  room.questions.forEach((question, questionIndex) => {
    const lines = pdf.splitTextToSize(
      `Question ${questionIndex + 1} — ${question.text}`,
      pageWidth - 28
    );

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

function blankQuestion() {
  return {
    text: "",
    choices: ["", "", "", ""],
    correctIndexes: [],
    partial: {
      enabled: true,
      requiredCorrectCount: 2,
      points: 0.5
    },
    duration: 0
  };
}

async function generateRoomCode() {
  let code;
  let exists = true;

  while (exists) {
    code = Array.from(
      { length: 6 },
      () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[
        Math.floor(Math.random() * 32)
      ]
    ).join("");

    exists = (await get(ref(db, `rooms/${code}`))).exists();
  }

  return code;
}

function normalizeCode(value) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function formatScore(value) {
  return Number(value || 0)
    .toFixed(1)
    .replace(".0", "")
    .replace(".", ",");
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

function notice(message) {
  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove("hidden");

  clearTimeout(notice.timeout);
  notice.timeout = setTimeout(() => {
    toast.classList.add("hidden");
  }, 4500);
}
