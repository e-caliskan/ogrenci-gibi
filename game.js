(() => {
  const TOTAL_DAYS = 10;
  const QUESTIONS_PER_EXAM = 20;
  const PASS_SCORE = 10;
  const SAVE_KEY = "ogrenci-gibi-save";

  const state = {
    day: 1,
    studentAge: 8,
    subjectMode: "both",
    subject: "turkish",
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
    timeLeft: 0,
  };

  let timerId = null;
  let advanceTimerId = null;

  const $ = (id) => document.getElementById(id);

  function fitViewport() {
    const vv = window.visualViewport;
    const h = Math.round(vv ? vv.height : window.innerHeight);
    const top = Math.round(vv ? vv.offsetTop : 0);
    document.documentElement.style.setProperty("--app-h", h + "px");
    document.body.style.top = top + "px";
  }

  fitViewport();
  window.addEventListener("resize", fitViewport);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", fitViewport);
    window.visualViewport.addEventListener("scroll", fitViewport);
  }

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
      subjectMode: state.subjectMode,
      subject: state.subject,
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
      timeLeft: state.timeLeft,
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
    state.subjectMode = normalizeSubjectMode(data.subjectMode);
    state.subject =
      data.subject === "math" || data.subject === "turkish"
        ? data.subject
        : subjectForDay(Number(data.day) || 1);
    state.started = true;
    state.questions = Array.isArray(data.questions) ? data.questions : [];
    state.index = Number(data.index) || 0;
    state.correct = Number(data.correct) || 0;
    state.wrong = Number(data.wrong) || 0;
    state.recessEarned = Number(data.recessEarned) || 0;
    state.recessLeft = Number(data.recessLeft) || 0;
    state.recessTaken = Boolean(data.recessTaken);
    state.examActive = Boolean(data.examActive);
    state.timeLeft = Number(data.timeLeft) || 0;
    state.awaitingNext = false;
  }

  function timeLimitForAge(_age) {
    return 60;
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.ceil(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function clearAdvanceTimer() {
    if (advanceTimerId) {
      clearTimeout(advanceTimerId);
      advanceTimerId = null;
    }
  }

  function updateTimerUI() {
    const el = $("exam-timer");
    if (!el) return;
    el.textContent = formatTime(state.timeLeft);
    el.classList.remove("warn", "danger");
    if (state.timeLeft <= 10) el.classList.add("danger");
    else if (state.timeLeft <= 20) el.classList.add("warn");
  }

  function startQuestionTimer(reset) {
    stopTimer();
    const limit = timeLimitForAge(state.studentAge);
    if (reset || !(state.timeLeft > 0)) {
      state.timeLeft = limit;
    }
    updateTimerUI();
    timerId = setInterval(() => {
      if (state.awaitingNext || !state.examActive) {
        stopTimer();
        return;
      }
      state.timeLeft -= 1;
      updateTimerUI();
      if (state.timeLeft <= 0) {
        stopTimer();
        state.timeLeft = 0;
        handleTimeout();
      } else if (state.timeLeft % 2 === 0) {
        saveProgress();
      }
    }, 1000);
  }

  function q(prompt, answer, answers) {
    return {
      prompt,
      answer: Array.isArray(answer) ? answer[0] : answer,
      answers: (answers || (Array.isArray(answer) ? answer : [answer])).map(
        (a) => String(a)
      ),
    };
  }

  const TURKISH_BANK = {
    easy: [
      q("Büyük sözcüğünün zıt anlamlısı nedir?", "küçük"),
      q("Sıcak sözcüğünün zıt anlamlısı nedir?", "soğuk"),
      q("Açık sözcüğünün zıt anlamlısı nedir?", "kapalı"),
      q("Uzun sözcüğünün zıt anlamlısı nedir?", "kısa"),
      q("Hızlı sözcüğünün zıt anlamlısı nedir?", ["yavaş", "ağır"]),
      q("İyi sözcüğünün zıt anlamlısı nedir?", ["kötü", "fena"]),
      q("Gündüz sözcüğünün zıt anlamlısı nedir?", "gece"),
      q("Yukarı sözcüğünün zıt anlamlısı nedir?", "aşağı"),
      q("İçeri sözcüğünün zıt anlamlısı nedir?", "dışarı"),
      q("Temiz sözcüğünün zıt anlamlısı nedir?", "kirli"),
      q("Mutlu sözcüğünün zıt anlamlısı nedir?", ["üzgün", "mutsuz", "kederli"]),
      q("Dolu sözcüğünün zıt anlamlısı nedir?", "boş"),
      q("Başlangıç sözcüğünün zıt anlamlısı nedir?", ["son", "bitiş", "sonuç"]),
      q("Güzel sözcüğünün eş anlamlısı nedir?", ["hoş", "latif", "şık"]),
      q("Zor sözcüğünün eş anlamlısı nedir?", ["güç", "çetin"]),
      q("Kitap sözcüğünün çoğulu nedir?", "kitaplar"),
      q("Kalem sözcüğünün çoğulu nedir?", "kalemler"),
      q("Okul sözcüğünün çoğulu nedir?", "okullar"),
      q("Elma sözcüğünde eksik harf hangisi? el_a", "m"),
      q("Masa sözcüğünde eksik harf hangisi? ma_a", "s"),
      q("Kedi sözcüğünde eksik harf hangisi? ke_i", "d"),
      q("Türkiye’nin başkenti neresidir?", "ankara"),
      q("Bir yılda kaç ay vardır?", ["12", "on iki", "oniki"]),
      q("Bir haftada kaç gün vardır?", ["7", "yedi"]),
      q("Gökyüzü genellikle hangi renktir?", ["mavi", "gök mavisi"]),
      q("Kar hangi renktir?", "beyaz"),
      q("Güneş hangi renktir?", ["sarı", "turuncu"]),
      q("“Merhaba” ne demektir: selamlaşma mı, veda mı?", "selamlaşma"),
      q("Öğretmenin karşısında ne deriz?", ["günaydın", "merhaba", "selam"]),
      q("Kitap okunan yerin adı nedir?", ["kütüphane", "okul", "sınıf"]),
      q("Cümle sonunda kullanılan noktalama işareti hangisidir?", [".", "nokta"]),
      q("Soru sorarken cümle sonunda hangi işaret kullanılır?", ["?", "soru işareti"]),
      q("Şaşırma veya sevinç cümlesinin sonunda hangi işaret vardır?", ["!", "ünlem", "ünlem işareti"]),
      q("“Merhaba” kelimesinden sonra genelde hangi işaret gelir?", [".", "!", "nokta", "ünlem"]),
      q("Nokta işaretini yaz: .", "."),
      q("Soru işaretini yaz: ?", "?"),
      q("Ünlem işaretini yaz: !", "!"),
      q("Virgül işaretini yaz: ,", ","),
      q("Hangisi noktalama işaretidir: nokta / masa / kedi?", ["nokta", "."]),
      q("“Nasıl gidiyorsun” cümlesinin sonuna ne gelir?", ["?", "soru işareti"]),
      q("“Ne güzel bir gün” cümlesinin sonuna ne gelir?", ["!", "ünlem", "ünlem işareti"]),
      q("“Bugün okula gittim” cümlesinin sonuna ne gelir?", [".", "nokta"]),
    ],
    mid: [
      q("Cesur sözcüğünün zıt anlamlısı nedir?", ["korkak", "ürkek"]),
      q("Zengin sözcüğünün zıt anlamlısı nedir?", ["fakir", "yoksul"]),
      q("Dar sözcüğünün zıt anlamlısı nedir?", "geniş"),
      q("Hafif sözcüğünün zıt anlamlısı nedir?", "ağır"),
      q("Yakın sözcüğünün zıt anlamlısı nedir?", "uzak"),
      q("Sakin sözcüğünün zıt anlamlısı nedir?", ["hareketli", "gürültülü", "huzursuz"]),
      q("Doğru sözcüğünün eş anlamlısı nedir?", ["haklı", "isabetli", "gerçek"]),
      q("Yardım sözcüğünün eş anlamlısı nedir?", ["destek", "özveri", "imdat"]),
      q("Önemli sözcüğünün eş anlamlısı nedir?", ["mühim", "kritik", "değerli"]),
      q("Çocuk sözcüğünün çoğulu nedir?", "çocuklar"),
      q("Öğrenci sözcüğünün çoğulu nedir?", "öğrenciler"),
      q("Şehir sözcüğünün çoğulu nedir?", "şehirler"),
      q("Hangisi doğru yazımdır: gelecek / gelicek?", "gelecek"),
      q("Hangisi doğru yazımdır: herkes / herkez?", "herkes"),
      q("Hangisi doğru yazımdır: yalnız / yanlız?", "yalnız"),
      q("Hangisi doğru yazımdır: bir şey / birşey?", "bir şey"),
      q("“Küçük” sözcüğünün eş anlamlısı nedir?", ["ufak", "minik", "cüce"]),
      q("“Başlamak” sözcüğünün zıt anlamlısı nedir?", ["bitirmek", "sonlandırmak", "sona ermek"]),
      q("Cümleyi tamamla: Bugün okula ____ gittim. (erken/geç)", "erken"),
      q("Cümleyi tamamla: Kalemi masanın ____ koydum. (üstüne/altına)", "üstüne"),
      q("Hangi sözcük fiildir: koşmak / masa / mavi?", "koşmak"),
      q("Hangi sözcük isimdir: yazmak / defter / hızlı?", "defter"),
      q("Hangi sözcük sıfattır: kırmızı / koşmak / okul?", "kırmızı"),
      q("Atasözü: Damlaya damlaya ____ olur.", ["göl", "deniz"]),
      q("Atasözü: Bir elin nesi var, iki elin ____ var.", "sesi"),
      q("“Görüşmek üzere” ne zaman söylenir?", ["veda", "ayrılırken", "güle güle"]),
      q("Paragrafın konusu genellikle nerede belirtilir?", ["başta", "girişte", "ilk cümlede"]),
      q("Nokta (.) ne işe yarar?", ["cümleyi bitirir", "cümle bitirir", "bitirir"]),
      q("Soru cümlesinin sonunda hangi işaret vardır?", ["?", "soru işareti"]),
      q("“Ankara” büyük harfle mi yazılır?", ["evet", "büyük"]),
      q("Virgül (,) ne işe yarar?", ["ayırır", "sözcükleri ayırır", "öğeleri ayırır", "ara verir"]),
      q("İki nokta (:) ne zaman kullanılır?", ["açıklama", "açıklama öncesi", "örnek vermeden önce"]),
      q("Üç nokta (...) ne anlatır?", ["eksik", "eksik bırakma", "devam ediyor", "sözün kesilmesi"]),
      q("Tırnak işareti (“ ”) ne için kullanılır?", ["alıntı", "alıntı yapmak", "söz aktarmak"]),
      q("Kesme işareti (’) ne için kullanılır?", ["ek ayırma", "ekleri ayırmak", "kısaltma"]),
      q("“Ali, Ayşe ve Mehmet geldi.” cümlesinde hangi işaret var?", ["virgül", ","]),
      q("“Saat 10:30’da geleceğim.” cümlesinde hangi işaret var?", [":", "iki nokta"]),
      q("Hangisi soru işaretidir: ? / ! / .", "?"),
      q("Hangisi ünlem işaretidir: ! / , / ;", "!"),
      q("“Ne oldu” cümlesini doğru noktalayınca sonuna ne gelir?", ["?", "soru işareti"]),
      q("“Çabuk gel” emir cümlesinin sonuna ne gelir?", ["!", ".", "ünlem", "nokta"]),
      q("Parantez işaretini yaz: ( )", ["()", "( )", "parantez"]),
    ],
    hard: [
      q("Mütevazı sözcüğünün zıt anlamlısı nedir?", ["kibirli", "gururlu", "mağrur"]),
      q("Somut sözcüğünün zıt anlamlısı nedir?", "soyut"),
      q("Objektif sözcüğünün zıt anlamlısı nedir?", ["öznel", "sübjektif"]),
      q("İhtiyac sözcüğünün doğru yazımı nedir?", "ihtiyaç"),
      q("Herhangi sözcüğünün doğru yazımı hangisidir: herhangi / her hangi?", "herhangi"),
      q("De/da ayrı mı bitişik mi yazılır? “Okula da geldim.”", ["ayrı", "ayrı yazılır"]),
      q("Ki bağlacı ayrı mı yazılır? “Geldi ki gördü.”", ["ayrı", "ayrı yazılır", "evet"]),
      q("Eş anlamlısı: “vazgeçmek”", ["bırakmak", "feragat etmek", "caymak"]),
      q("Eş anlamlısı: “göstermek”", ["sergilemek", "belirtmek", "işaret etmek"]),
      q("Zıt anlamlısı: “geçici”", ["kalıcı", "sürekli", "daimi"]),
      q("Zıt anlamlısı: “yapay”", ["doğal", "tabii"]),
      q("Hangisi deyimdir: “eli açık” / “kırmızı kalem”?", "eli açık"),
      q("“Eli açık” ne demektir?", ["cömert", "cömert olmak", "cömerttir"]),
      q("“Gözden düşmek” ne demektir?", ["değerini yitirmek", "sevgi kaybetmek", "önemini yitirmek"]),
      q("Cümlede yüklem genellikle nerede bulunur?", ["sonda", "cümle sonunda", "en sonda"]),
      q("Özne kimdir? “Ali topu attı.”", "ali"),
      q("Nesne nedir? “Ali topu attı.”", "topu"),
      q("Hangisi bağlaçtır: ve / hızlı / okul?", "ve"),
      q("Ünlü harflerden biri hangisidir: a / b / k?", "a"),
      q("Ünsüz harflerden biri hangisidir: m / e / ı?", "m"),
      q("“İstanbul” özel isim midir?", ["evet", "özel isim"]),
      q("Atasözü: Komşu komşunun ____ ihtiyacı vardır.", "külüne"),
      q("Atasözü: Sakla samanı ____.", ["gelir zamanı", "geli zamanı"]),
      q("Doğru yazım: “yalnız” mı “yanlız” mı?", "yalnız"),
      q("Doğru yazım: “şöyle” mi “şuyle” mi?", "şöyle"),
      q("“Abartmak” sözcüğünün eş anlamlısı nedir?", ["mübalağa etmek", "şişirmek", "büyütmek"]),
      q("“Azaltmak” sözcüğünün zıt anlamlısı nedir?", ["çoğaltmak", "artırmak", "yükseltmek"]),
      q("Hangi cümle emir kipidir: “Kapıyı kapat.” / “Kapıyı kapattım.”?", "kapıyı kapat"),
      q("Metnin ana duygusu için kullanılan sözcük nedir?", ["tema", "ana fikir", "duygu"]),
      q("Özetlemek ne demektir?", ["kısaca anlatmak", "kısaltmak", "özünü yazmak"]),
      q("Noktalı virgül (;) ne işe yarar?", ["bağlar", "ilgili cümleleri bağlar", "ayırır"]),
      q("Tire (-) ne zaman kullanılır?", ["satır sonu", "sözcük bölme", "aralık"]),
      q("“İstanbul’da yaşıyorum.” cümlesindeki ’ işareti nedir?", ["kesme", "kesme işareti", "'"]),
      q("Alıntı yapılan cümle hangi işaretler arasına alınır?", ["tırnak", "tırnak işareti", "\" \"", "“ ”"]),
      q("“Kim geldi” cümlesinin doğru sonu hangisidir: . / ?", "?"),
      q("“Yardım edin” cümlesinin uygun sonu hangisidir: ! / ,", "!"),
      q("Kısaltmalardan sonra genelde hangi işaret konur?", [".", "nokta"]),
      q("Sayıları ayırırken (1.000) hangi işaret kullanılır?", [".", "nokta"]),
      q("“Sonuç olarak: çalışmak gerekir.” cümlesinde : ne işe yarar?", ["açıklama", "açıklama getirir"]),
      q("Üç nokta (...) ile biten cümlede ne vardır?", ["eksiklik", "süreklilik", "kesilme"]),
    ],
  };

  function normalizeAnswer(value) {
    const raw = String(value || "").trim();
    // Tek başına noktalama cevabı bozulmasın (?, ., !, ...)
    if (/^[.?!,;:…\-–—'’“”"()\s]+$/.test(raw)) {
      return raw.replace(/\s+/g, " ");
    }
    return raw
      .toLocaleLowerCase("tr-TR")
      .replace(/[.!?…]+$/g, "")
      .replace(/\s+/g, " ");
  }

  function answersMatch(given, accepted) {
    const g = normalizeAnswer(given);
    return accepted.some((a) => normalizeAnswer(a) === g);
  }

  function displayAnswer(question) {
    return question.answer;
  }

  function normalizeSubjectMode(mode) {
    if (mode === "math" || mode === "turkish" || mode === "both") return mode;
    return "both";
  }

  function subjectForDay(day) {
    if (state.subjectMode === "math") return "math";
    if (state.subjectMode === "turkish") return "turkish";
    // İkisi de: tek günler Türkçe, çift günler Matematik
    return day % 2 === 1 ? "turkish" : "math";
  }

  function topicForTurkish(age) {
    if (age <= 8) return "Zıt anlamlılar ve noktalama";
    if (age <= 12) return "Yazım, noktalama ve dil bilgisi";
    return "Noktalama, deyim ve cümle bilgisi";
  }

  function bankForAge(age) {
    if (age <= 8) return TURKISH_BANK.easy;
    if (age <= 12) return [...TURKISH_BANK.easy, ...TURKISH_BANK.mid];
    return [...TURKISH_BANK.mid, ...TURKISH_BANK.hard];
  }

  function shuffle(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function difficultyForDay(day, age) {
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
    if ((a % 10) + (b % 10) < 10 && maxVal >= 10) {
      a = a - (a % 10) + onesA;
      b = b - (b % 10) + onesB;
      a = Math.min(a, maxVal);
      b = Math.min(b, maxVal);
    }
    return [a, b];
  }

  function buildTurkishQuestions() {
    const bank = bankForAge(state.studentAge);
    const dayShift = (state.day - 1) % bank.length;
    const rotated = bank.slice(dayShift).concat(bank.slice(0, dayShift));
    const picked = shuffle(rotated).slice(0, QUESTIONS_PER_EXAM);
    while (picked.length < QUESTIONS_PER_EXAM) {
      picked.push(bank[picked.length % bank.length]);
    }
    return picked.map((item) => ({
      subject: "turkish",
      prompt: item.prompt,
      answer: item.answer,
      answers: item.answers.slice(),
    }));
  }

  function buildMathQuestions() {
    const { minVal, maxVal, carryChance } = difficultyForDay(
      state.day,
      state.studentAge
    );
    const list = [];
    for (let i = 0; i < QUESTIONS_PER_EXAM; i++) {
      const forceCarry = maxVal >= 10 && Math.random() < carryChance;
      const [a, b] = makeAddends(minVal, maxVal, forceCarry);
      const sum = a + b;
      list.push({
        subject: "math",
        prompt: `${a} + ${b} = ?`,
        a,
        b,
        answer: String(sum),
        answers: [String(sum)],
      });
    }
    return list;
  }

  function buildQuestions() {
    state.subject = subjectForDay(state.day);
    return state.subject === "math"
      ? buildMathQuestions()
      : buildTurkishQuestions();
  }

  function isValidQuestion(item) {
    return (
      item &&
      typeof item.prompt === "string" &&
      Array.isArray(item.answers) &&
      (item.subject === "math" || item.subject === "turkish")
    );
  }

  function syncAnswerInput() {
    const input = $("answer-input");
    if (!input) return;
    if (state.subject === "math") {
      input.setAttribute("inputmode", "numeric");
      input.setAttribute("placeholder", "Sonuç");
    } else {
      input.setAttribute("inputmode", "text");
      input.setAttribute("placeholder", "Cevabın");
    }
  }

  function updateDayScreen() {
    state.subject = subjectForDay(state.day);
    const limit = timeLimitForAge(state.studentAge);
    const isMath = state.subject === "math";
    const title = isMath ? "Matematik Fotokopisi" : "Türkçe Fotokopisi";
    let topic;
    if (isMath) {
      const { minVal, maxVal } = difficultyForDay(state.day, state.studentAge);
      topic = `Toplama işlemi · sayılar ${minVal}–${maxVal}`;
    } else {
      topic = topicForTurkish(state.studentAge);
    }

    $("day-label").textContent = `Gün ${state.day} / ${TOTAL_DAYS}`;
    $("board-text").textContent = `${topic} · ${isMath ? "Matematik" : "Türkçe"} fotokopisi`;
    $("day-goal").textContent =
      `${QUESTIONS_PER_EXAM} soru · her soruya ${limit} sn · ${PASS_SCORE}+ doğru geçersin`;
    $("student-name").textContent = `${state.studentAge} yaşındaki öğrenci`;
    if ($("sheet-title")) $("sheet-title").textContent = title;
    if ($("ws-title")) $("ws-title").textContent = title;
    syncAnswerInput();
  }

  function enterExamUI(keepTime) {
    state.subject =
      state.questions[0] && state.questions[0].subject
        ? state.questions[0].subject
        : subjectForDay(state.day);
    const title =
      state.subject === "math" ? "Matematik Fotokopisi" : "Türkçe Fotokopisi";
    if ($("ws-title")) $("ws-title").textContent = title;
    $("ws-day").textContent = `Gün ${state.day}`;
    $("live-correct").textContent = String(state.correct);
    $("live-wrong").textContent = String(state.wrong);
    $("live-recess").textContent = String(state.recessEarned);
    $("teacher-mood").textContent = "👩‍🏫";
    $("teacher-exam").classList.remove("angry", "happy");
    $("feedback").textContent = "";
    $("feedback").className = "feedback";
    syncAnswerInput();
    showScreen("exam");
    renderQuestion(keepTime);
    saveProgress();
  }

  function startExam() {
    clearAdvanceTimer();
    stopTimer();
    state.questions = buildQuestions();
    state.index = 0;
    state.correct = 0;
    state.wrong = 0;
    state.recessEarned = 0;
    state.recessLeft = 0;
    state.recessTaken = false;
    state.awaitingNext = false;
    state.examActive = true;
    state.timeLeft = timeLimitForAge(state.studentAge);
    enterExamUI(false);
  }

  function resumeExam() {
    const invalid =
      !state.examActive ||
      !state.questions.length ||
      state.index >= state.questions.length ||
      !state.questions.every(isValidQuestion);
    if (invalid) {
      stopTimer();
      clearAdvanceTimer();
      state.examActive = false;
      state.questions = [];
      updateDayScreen();
      showScreen("day");
      saveProgress();
      return;
    }
    enterExamUI(true);
  }

  function hideContinueButton() {
    const nextBtn = $("btn-next-question");
    const answerBtn = $("btn-answer");
    if (nextBtn) nextBtn.classList.add("hidden");
    if (answerBtn) answerBtn.classList.remove("hidden");
  }

  function showContinueButton() {
    const nextBtn = $("btn-next-question");
    const answerBtn = $("btn-answer");
    if (answerBtn) answerBtn.classList.add("hidden");
    if (!nextBtn) return;
    nextBtn.classList.remove("hidden");
    nextBtn.focus();
  }

  function goNextQuestion() {
    clearAdvanceTimer();
    hideContinueButton();
    state.index += 1;
    state.timeLeft = 0;
    saveProgress();
    if (state.index >= QUESTIONS_PER_EXAM) {
      finishExam();
    } else {
      renderQuestion(false);
    }
  }

  function renderQuestion(keepTime) {
    clearAdvanceTimer();
    hideContinueButton();
    const current = state.questions[state.index];
    $("exam-progress").textContent = `Soru ${state.index + 1} / ${QUESTIONS_PER_EXAM}`;
    $("question-text").textContent = current.prompt;
    $("answer-input").value = "";
    $("answer-input").disabled = false;
    $("answer-input").focus();
    $("feedback").textContent = "";
    $("feedback").className = "feedback";
    state.awaitingNext = false;
    startQuestionTimer(!keepTime);
  }

  function scheduleAdvance() {
    clearAdvanceTimer();
    advanceTimerId = setTimeout(() => {
      advanceTimerId = null;
      goNextQuestion();
    }, 850);
  }

  function markAnswerResult(ok, message, mood) {
    const feedback = $("feedback");
    feedback.textContent = message;
    feedback.className = ok ? "feedback ok" : "feedback bad";
    $("teacher-mood").textContent = mood;
    if (ok) {
      $("teacher-exam").classList.remove("angry");
      $("teacher-exam").classList.add("happy");
    } else {
      $("teacher-exam").classList.remove("happy");
    }
    $("live-correct").textContent = String(state.correct);
    $("live-wrong").textContent = String(state.wrong);
    $("live-recess").textContent = String(state.recessEarned);
  }

  function handleTimeout() {
    if (state.awaitingNext || !state.examActive) return;
    const current = state.questions[state.index];
    state.wrong += 1;
    state.awaitingNext = true;
    state.timeLeft = 0;
    updateTimerUI();
    $("answer-input").disabled = true;
    $("answer-input").blur();
    markAnswerResult(
      false,
      `Süre bitti! Doğru cevap “${displayAnswer(current)}” idi.`,
      "⏰"
    );
    saveProgress();
    showContinueButton();
  }

  function submitAnswer(event) {
    event.preventDefault();
    if (state.awaitingNext || !state.examActive) return;

    const input = $("answer-input");
    const raw = input.value.trim();
    if (raw === "") return;

    const current = state.questions[state.index];

    stopTimer();
    state.awaitingNext = true;
    input.disabled = true;
    input.blur();

    if (answersMatch(raw, current.answers)) {
      state.correct += 1;
      state.recessEarned += 1;
      markAnswerResult(true, "Doğru! Bir teneffüs hakkı kazandın.", "😊");
      saveProgress();
      scheduleAdvance();
    } else {
      state.wrong += 1;
      markAnswerResult(
        false,
        `Yanlış. Doğru cevap “${displayAnswer(current)}” idi.`,
        "😐"
      );
      saveProgress();
      showContinueButton();
    }
  }

  function finishExam() {
    stopTimer();
    clearAdvanceTimer();
    state.examActive = false;
    state.timeLeft = 0;
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
    stopTimer();
    clearAdvanceTimer();
    if (state.day >= TOTAL_DAYS) {
      $("win-msg").textContent =
        `${state.studentAge} yaşında bir öğrenci gibi 100 günü bitirdin. Matematik ve Türkçe fotokopisi ustası oldun!`;
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
    state.timeLeft = 0;
    updateDayScreen();
    showScreen("day");
    saveProgress();
  }

  function retryDay() {
    stopTimer();
    clearAdvanceTimer();
    state.questions = [];
    state.index = 0;
    state.correct = 0;
    state.wrong = 0;
    state.recessEarned = 0;
    state.recessLeft = 0;
    state.recessTaken = false;
    state.examActive = false;
    state.timeLeft = 0;
    updateDayScreen();
    showScreen("day");
    saveProgress();
  }

  function restart() {
    stopTimer();
    clearAdvanceTimer();
    clearProgress();
    state.day = 1;
    state.started = false;
    state.examActive = false;
    state.timeLeft = 0;
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
    const modeInput = document.querySelector('input[name="subject-mode"]:checked');
    state.studentAge = Number($("age-student").value);
    state.subjectMode = normalizeSubjectMode(modeInput && modeInput.value);
    state.day = 1;
    state.started = true;
    state.examActive = false;
    state.questions = [];
    state.index = 0;
    state.correct = 0;
    state.wrong = 0;
    state.recessEarned = 0;
    state.recessLeft = 0;
    state.timeLeft = 0;
    state.subject = subjectForDay(1);
    updateDayScreen();
    showScreen("day");
    saveProgress();
  });

  $("btn-continue").addEventListener("click", continueGame);
  $("btn-new-game").addEventListener("click", startNewGameForm);
  $("btn-start-exam").addEventListener("click", startExam);
  $("answer-form").addEventListener("submit", submitAnswer);
  $("btn-next-question").addEventListener("click", () => {
    if (!state.awaitingNext || !state.examActive) return;
    goNextQuestion();
  });
  $("btn-recess").addEventListener("click", goRecess);
  $("btn-back-class").addEventListener("click", backFromRecess);
  $("btn-next-day").addEventListener("click", nextDay);
  $("btn-retry").addEventListener("click", retryDay);
  $("btn-restart").addEventListener("click", restart);

  window.addEventListener("beforeunload", saveProgress);

  showAgeMenu();
})();
