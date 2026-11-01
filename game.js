(() => {
  const TOTAL_DAYS = 100;
  const QUESTIONS_PER_EXAM = 20;
  const PASS_SCORE = 10;
  const SAVE_KEY = "ogrenci-gibi-save";

  const state = {
    day: 1,
    studentAge: 8,
    started: false,
    screen: "age",
    questions: [],
    index: 0,
    correct: 0,
    wrong: 0,
    recessEarned: 0,
    recessLeft: 0,
    recessTaken: false,
    awaitingNext: false,
    examActive: false,
  };

  const $ = (id) => document.getElementById(id);

  const screens = {
    age: $("screen-age"),
    day: $("screen-day"),
    exam: $("screen-exam"),
    result: $("screen-result"),
    recess: $("screen-recess"),
    win: $("screen-win"),
  };

  function showScreen(name) {
    Object.values(screens).forEach((el) => el.classList.remove("active"));
    screens[name].classList.add("active");
    state.screen = name;
  }

  function saveProgress() {
    if (!state.started) return;
    const data = {
      day: state.day,
      studentAge: state.studentAge,
      started: true,
      screen: state.screen === "age" ? "day" : state.screen,
      questions: state.questions,
      index: state.index,
      correct: state.correct,
      wrong: state.wrong,
      recessEarned: state.recessEarned,
      recessLeft: state.recessLeft,
      recessTaken: state.recessTaken,
      examActive: state.examActive,
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (_) {
      /* depolama doluysa sessiz geç */
    }
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !data.started || !data.day) return null;
      return data;
    } catch (_) {
      return null;
    }
  }

  function clearProgress() {
    localStorage.removeItem(SAVE_KEY);
  }

  function applySave(data) {
    state.day = Math.min(Math.max(1, Number(data.day) || 1), TOTAL_DAYS);
    state.studentAge = Number(data.studentAge) || 8;
    state.started = true;
    state.questions = Array.isArray(data.questions) ? data.questions : [];
    state.index = Number(data.index) || 0;
    state.correct = Number(data.correct) || 0;
    state.wrong = Number(data.wrong) || 0;
    state.recessEarned = Number(data.recessEarned) || 0;
    state.recessLeft = Number(data.recessLeft) || 0;
    state.recessTaken = Boolean(data.recessTaken);
    state.examActive = Boolean(data.examActive);
    state.awaitingNext = false;
  }

  function difficultyForDay(day, age) {
    // Her gün biraz daha zor: alt sınır + üst sınır her gün artar
    const ageBoost =
      age <= 6 ? 0 :
      age <= 8 ? 1 :
      age <= 10 ? 2 :
      age <= 12 ? 4 : 6;

    const minVal = Math.min(2 + Math.floor((day - 1) / 4) + ageBoost, 40);
    const maxVal = Math.min(
      5 + (day - 1) * (2 + ageBoost) + ageBoost * 3,
      age <= 8 ? 120 : age <= 12 ? 400 : 999
    );

    // İlerleyen günlerde elde (carry) zorunlu soru oranı artar
    const carryChance = Math.min(0.15 + day * 0.007, 0.85);

    return { minVal, maxVal, carryChance };
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function makeAddends(minVal, maxVal, forceCarry) {
    if (!forceCarry) {
      return [randInt(minVal, maxVal), randInt(minVal, maxVal)];
    }

    // Birler basamağı toplamı 10+ olsun → elde var, daha zor
    const onesA = randInt(1, 9);
    const onesB = randInt(10 - onesA, 9);
    const tensMax = Math.floor(maxVal / 10);
    const tensMin = Math.floor(minVal / 10);
    const tensA = randInt(tensMin, Math.max(tensMin, tensMax));
    const tensB = randInt(tensMin, Math.max(tensMin, tensMax));
    let a = tensA * 10 + onesA;
    let b = tensB * 10 + onesB;
    a = Math.min(Math.max(a, minVal), maxVal);
    b = Math.min(Math.max(b, minVal), maxVal);
    // Elde kaybolduysa düzelt
    if ((a % 10) + (b % 10) < 10 && maxVal >= 10) {
      a = a - (a % 10) + onesA;
      b = b - (b % 10) + onesB;
      a = Math.min(a, maxVal);
      b = Math.min(b, maxVal);
    }
    return [a, b];
  }

  function buildQuestions() {
    const { minVal, maxVal, carryChance } = difficultyForDay(
      state.day,
      state.studentAge
    );
    const list = [];
    for (let i = 0; i < QUESTIONS_PER_EXAM; i++) {
      const forceCarry = maxVal >= 10 && Math.random() < carryChance;
      const [a, b] = makeAddends(minVal, maxVal, forceCarry);
      list.push({ a, b, answer: a + b });
    }
    return list;
  }

  function updateDayScreen() {
    const { minVal, maxVal } = difficultyForDay(state.day, state.studentAge);
    $("day-label").textContent = `Gün ${state.day} / ${TOTAL_DAYS}`;
    $("day-goal").textContent =
      `${QUESTIONS_PER_EXAM} soru · sayılar ${minVal}–${maxVal} arası · her gün daha zor! (${PASS_SCORE}+ doğru geçersin)`;
    $("student-name").textContent = `${state.studentAge} yaşındaki öğrenci`;
  }

  function enterExamUI() {
    $("ws-day").textContent = `Gün ${state.day}`;
    $("live-correct").textContent = String(state.correct);
    $("live-wrong").textContent = String(state.wrong);
    $("live-recess").textContent = String(state.recessEarned);
    $("teacher-mood").textContent = "👩‍🏫";
    $("teacher-exam").classList.remove("angry", "happy");
    $("feedback").textContent = "";
    $("feedback").className = "feedback";
    showScreen("exam");
    renderQuestion();
    saveProgress();
  }

  function startExam() {
    state.questions = buildQuestions();
    state.index = 0;
    state.correct = 0;
    state.wrong = 0;
    state.recessEarned = 0;
    state.recessLeft = 0;
    state.recessTaken = false;
    state.awaitingNext = false;
    state.examActive = true;
    enterExamUI();
  }

  function resumeExam() {
    if (
      !state.examActive ||
      !state.questions.length ||
      state.index >= state.questions.length
    ) {
      state.examActive = false;
      updateDayScreen();
      showScreen("day");
      saveProgress();
      return;
    }
    enterExamUI();
  }

  function renderQuestion() {
    const q = state.questions[state.index];
    $("exam-progress").textContent = `Soru ${state.index + 1} / ${QUESTIONS_PER_EXAM}`;
    $("question-text").textContent = `${q.a} + ${q.b} = ?`;
    $("answer-input").value = "";
    $("answer-input").focus();
    $("feedback").textContent = "";
    $("feedback").className = "feedback";
    state.awaitingNext = false;
  }

  function submitAnswer(event) {
    event.preventDefault();
    if (state.awaitingNext) return;

    const input = $("answer-input");
    const raw = input.value.trim();
    if (raw === "") return;

    const given = Number(raw);
    const q = state.questions[state.index];
    const feedback = $("feedback");

    if (given === q.answer) {
      state.correct += 1;
      state.recessEarned += 1;
      feedback.textContent = "Doğru! Bir teneffüs hakkı kazandın.";
      feedback.className = "feedback ok";
      $("teacher-mood").textContent = "😊";
      $("teacher-exam").classList.remove("angry");
      $("teacher-exam").classList.add("happy");
    } else {
      state.wrong += 1;
      feedback.textContent = `Yanlış. Doğru cevap ${q.answer} idi.`;
      feedback.className = "feedback bad";
      $("teacher-mood").textContent = "😐";
      $("teacher-exam").classList.remove("happy");
    }

    $("live-correct").textContent = String(state.correct);
    $("live-wrong").textContent = String(state.wrong);
    $("live-recess").textContent = String(state.recessEarned);

    state.awaitingNext = true;
    input.blur();

    setTimeout(() => {
      state.index += 1;
      saveProgress();
      if (state.index >= QUESTIONS_PER_EXAM) {
        finishExam();
      } else {
        renderQuestion();
      }
    }, 850);
  }

  function finishExam() {
    state.examActive = false;
    const passed = state.correct >= PASS_SCORE;
    const allWrong = state.correct === 0;
    const allCorrect = state.correct === QUESTIONS_PER_EXAM;

    let recess = passed ? state.recessEarned : 0;
    if (!state.recessTaken) {
      state.recessLeft = recess;
    } else {
      recess = state.recessEarned;
      state.recessLeft = 0;
    }

    const card = $("result-card");
    card.classList.remove("pass", "fail");
    card.classList.add(passed ? "pass" : "fail");

    $("stat-correct").textContent = String(state.correct);
    $("stat-wrong").textContent = String(state.wrong);
    $("stat-recess").textContent = String(passed ? state.recessEarned : 0);

    $("btn-recess").classList.toggle(
      "hidden",
      !passed || state.recessTaken || state.recessEarned === 0
    );
    $("btn-next-day").classList.toggle("hidden", !passed);
    $("btn-retry").classList.toggle("hidden", passed);

    const mood = $("result-mood");
    const teacher = $("teacher-result");
    teacher.classList.remove("angry", "happy");

    if (allWrong) {
      mood.textContent = "😡";
      teacher.classList.add("angry");
      $("result-title").textContent = "Öğretmen çok kızdı!";
      $("result-msg").textContent =
        "Hepsi yanlış! Sınavı geçemedin. Teneffüse çıkamazsın. Öğretmen fotokopiyi görünce çok sinirlendi.";
    } else if (!passed) {
      mood.textContent = "😟";
      $("result-title").textContent = "Sınavı geçemedin";
      $("result-msg").textContent =
        `En az ${PASS_SCORE} doğru lazım. Sınavı geçemediğin için teneffüse çıkamazsın. Kalemini alıp tekrar dene.`;
    } else if (allCorrect) {
      mood.textContent = "🤩";
      teacher.classList.add("happy");
      $("result-title").textContent = "Hepsi doğru!";
      $("result-msg").textContent =
        `Harika! ${QUESTIONS_PER_EXAM} doğru. Bütün teneffüslere çıkabilirsin (${recess} teneffüs).`;
    } else {
      mood.textContent = "🙂";
      teacher.classList.add("happy");
      $("result-title").textContent = "Sınavı geçtin!";
      $("result-msg").textContent =
        `${state.correct} doğru yaptın. Her doğru için bir teneffüs: ${recess} teneffüs hakkın var.`;
    }

    showScreen("result");
    saveProgress();
  }

  function goRecess() {
    if (state.recessLeft <= 0) return;
    const n = state.recessLeft;
    $("recess-count").textContent =
      n === QUESTIONS_PER_EXAM
        ? `Bütün teneffüsler: ${n} / ${QUESTIONS_PER_EXAM}`
        : `Teneffüs hakkın: ${n}`;
    $("recess-text").textContent =
      n === QUESTIONS_PER_EXAM
        ? "Hepsi doğru olduğu için bütün teneffüslere çıktın!"
        : n === 1
          ? "Bir doğru = bir teneffüs. Bahçedesin!"
          : `${n} doğru yaptın, ${n} teneffüse çıktın. Dersi kendin çözdün!`;
    state.recessLeft = 0;
    state.recessTaken = true;
    showScreen("recess");
    saveProgress();
  }

  function backFromRecess() {
    showScreen("result");
    $("btn-recess").classList.add("hidden");
    saveProgress();
  }

  function nextDay() {
    if (state.day >= TOTAL_DAYS) {
      $("win-msg").textContent =
        `${state.studentAge} yaşında bir öğrenci gibi 100 günü bitirdin. Toplama ustası oldun!`;
      clearProgress();
      state.started = false;
      showScreen("win");
      return;
    }
    state.day += 1;
    state.questions = [];
    state.index = 0;
    state.correct = 0;
    state.wrong = 0;
    state.recessEarned = 0;
    state.recessLeft = 0;
    state.recessTaken = false;
    state.examActive = false;
    updateDayScreen();
    showScreen("day");
    saveProgress();
  }

  function retryDay() {
    state.questions = [];
    state.index = 0;
    state.correct = 0;
    state.wrong = 0;
    state.recessEarned = 0;
    state.recessLeft = 0;
    state.recessTaken = false;
    state.examActive = false;
    updateDayScreen();
    showScreen("day");
    saveProgress();
  }

  function restart() {
    clearProgress();
    state.day = 1;
    state.started = false;
    state.examActive = false;
    state.questions = [];
    showAgeMenu();
  }

  function showAgeMenu() {
    const saved = loadProgress();
    const box = $("continue-box");
    const form = $("age-form");

    if (saved) {
      box.classList.remove("hidden");
      form.classList.add("hidden");
      const mid =
        saved.examActive && saved.questions && saved.questions.length
          ? ` · sınavda soru ${(saved.index || 0) + 1}/20`
          : "";
      $("continue-info").textContent =
        `Kayıt: Gün ${saved.day} / ${TOTAL_DAYS}${mid}`;
    } else {
      box.classList.add("hidden");
      form.classList.remove("hidden");
    }

    showScreen("age");
  }

  function continueGame() {
    const saved = loadProgress();
    if (!saved) {
      showAgeMenu();
      return;
    }
    applySave(saved);

    if (saved.screen === "win") {
      clearProgress();
      showAgeMenu();
      return;
    }

    if (saved.screen === "exam" || saved.examActive) {
      resumeExam();
      return;
    }

    if (saved.screen === "result") {
      finishExam();
      return;
    }

    if (saved.screen === "recess") {
      if (!state.recessTaken && state.recessEarned > 0) {
        state.recessLeft = state.recessEarned;
        goRecess();
      } else {
        finishExam();
      }
      return;
    }

    updateDayScreen();
    showScreen("day");
    saveProgress();
  }

  function startNewGameForm() {
    clearProgress();
    state.started = false;
    state.day = 1;
    state.examActive = false;
    $("continue-box").classList.add("hidden");
    $("age-form").classList.remove("hidden");
    $("age-form").reset();
  }

  $("age-form").addEventListener("submit", (e) => {
    e.preventDefault();
    clearProgress();
    state.studentAge = Number($("age-student").value);
    state.day = 1;
    state.started = true;
    state.examActive = false;
    state.questions = [];
    state.index = 0;
    state.correct = 0;
    state.wrong = 0;
    state.recessEarned = 0;
    state.recessLeft = 0;
    updateDayScreen();
    showScreen("day");
    saveProgress();
  });

  $("btn-continue").addEventListener("click", continueGame);
  $("btn-new-game").addEventListener("click", startNewGameForm);
  $("btn-start-exam").addEventListener("click", startExam);
  $("answer-form").addEventListener("submit", submitAnswer);
  $("btn-recess").addEventListener("click", goRecess);
  $("btn-back-class").addEventListener("click", backFromRecess);
  $("btn-next-day").addEventListener("click", nextDay);
  $("btn-retry").addEventListener("click", retryDay);
  $("btn-restart").addEventListener("click", restart);

  window.addEventListener("beforeunload", saveProgress);

  showAgeMenu();
})();
