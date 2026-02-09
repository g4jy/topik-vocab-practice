/* === TOPIK Word Quiz Module === */

(async () => {
  const allWords = await App.loadSelectedWords();

  /* --- State --- */
  let quizWords = [];
  let currentIdx = 0;
  let correct = 0;
  let total = 0;
  let quizCount = 10;
  let direction = 'en-kr'; // show English, type Korean
  let answered = false;
  let wrongQueue = [];

  /* --- DOM --- */
  const promptEl = document.getElementById('quiz-prompt');
  const hintEl = document.getElementById('quiz-hint');
  const inputEl = document.getElementById('quiz-input');
  const submitBtn = document.getElementById('quiz-submit');
  const feedbackEl = document.getElementById('quiz-feedback');
  const feedbackText = document.getElementById('feedback-text');
  const feedbackExample = document.getElementById('feedback-example');
  const scoreDisplay = document.getElementById('score-display');
  const nextBtn = document.getElementById('next-question');
  const restartBtn = document.getElementById('restart-btn');
  const optionsEl = document.getElementById('quiz-options');

  /* --- Quiz Options --- */
  optionsEl.querySelectorAll('[data-count]').forEach(btn => {
    btn.addEventListener('click', () => {
      optionsEl.querySelectorAll('[data-count]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      quizCount = parseInt(btn.dataset.count);
      startQuiz();
    });
  });

  optionsEl.querySelectorAll('[data-dir]').forEach(btn => {
    btn.addEventListener('click', () => {
      optionsEl.querySelectorAll('[data-dir]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      direction = btn.dataset.dir;
      startQuiz();
    });
  });

  /* --- Start Quiz --- */
  function startQuiz() {
    // Prioritize due/weak words
    const due = App.getDueWords(allWords);
    const shuffled = [...due];
    // Shuffle
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // If not enough due words, add random ones
    if (shuffled.length < quizCount) {
      const remaining = allWords.filter(w => !due.includes(w));
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      shuffled.push(...remaining);
    }
    quizWords = shuffled.slice(0, quizCount);
    currentIdx = 0;
    correct = 0;
    total = 0;
    wrongQueue = [];
    answered = false;
    showQuestion();
  }

  /* --- Show Question --- */
  function showQuestion() {
    if (currentIdx >= quizWords.length) {
      // Check wrong queue
      if (wrongQueue.length > 0) {
        quizWords = [...wrongQueue];
        wrongQueue = [];
        currentIdx = 0;
        hintEl.textContent = 'Reviewing incorrect answers...';
      } else {
        showComplete();
        return;
      }
    }

    const word = quizWords[currentIdx];
    answered = false;
    feedbackEl.classList.add('hidden');
    inputEl.value = '';
    inputEl.disabled = false;
    inputEl.focus();

    if (direction === 'en-kr') {
      promptEl.textContent = word.en;
      hintEl.textContent = word.pos ? `(${word.pos})` : '';
    } else {
      promptEl.textContent = word.kr;
      hintEl.textContent = word.pos ? `(${word.pos})` : '';
      // Play TTS for Korean prompt
      App.speak(word.kr);
    }

    scoreDisplay.textContent = `${correct} / ${total}`;
  }

  /* --- Check Answer --- */
  function checkAnswer() {
    if (answered) { nextQuestion(); return; }

    const word = quizWords[currentIdx];
    const answer = inputEl.value.trim().toLowerCase();
    if (!answer) return;

    answered = true;
    total++;
    inputEl.disabled = true;

    let correctAnswer, isCorrect;
    if (direction === 'en-kr') {
      correctAnswer = word.kr;
      // Allow matching without spaces for Korean
      isCorrect = answer === word.kr || answer === word.kr.replace(/\s/g, '');
    } else {
      correctAnswer = word.en;
      // Flexible matching: lowercase, trim, handle slashes
      const answers = word.en.toLowerCase().split(/\s*\/\s*/).map(a => a.trim());
      isCorrect = answers.some(a => answer === a || answer === a.replace(/\(.*\)/g, '').trim());
    }

    if (isCorrect) {
      correct++;
      feedbackEl.className = 'quiz-feedback correct';
      feedbackText.textContent = 'Correct!';
      App.updateWordSRS(word.kr, 'know');
      App.trackResponse(word.kr, word.en, 'know', word.level, 'quiz');
    } else {
      feedbackEl.className = 'quiz-feedback incorrect';
      feedbackText.innerHTML = `Incorrect. The answer is: <strong>${correctAnswer}</strong>`;
      wrongQueue.push(word);
      App.updateWordSRS(word.kr, 'dont_know');
      App.trackResponse(word.kr, word.en, 'dont_know', word.level, 'quiz');
    }

    feedbackExample.textContent = word.ex_kr ? `${word.ex_kr}\n${word.ex_en}` : '';
    feedbackEl.classList.remove('hidden');
    scoreDisplay.textContent = `${correct} / ${total}`;

    // Play correct answer TTS
    if (direction === 'en-kr') {
      App.speak(word.kr);
    }
  }

  /* --- Next Question --- */
  function nextQuestion() {
    currentIdx++;
    showQuestion();
  }

  /* --- Quiz Complete --- */
  function showComplete() {
    promptEl.textContent = 'Quiz Complete!';
    hintEl.textContent = '';
    inputEl.value = '';
    inputEl.disabled = true;
    feedbackEl.className = 'quiz-feedback correct';
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    feedbackText.textContent = `Score: ${correct} / ${total} (${pct}%)`;
    feedbackExample.textContent = '';
    feedbackEl.classList.remove('hidden');
  }

  /* --- Event Listeners --- */
  submitBtn.addEventListener('click', checkAnswer);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (answered) nextQuestion();
      else checkAnswer();
    }
  });

  nextBtn.addEventListener('click', nextQuestion);
  restartBtn.addEventListener('click', startQuiz);

  /* --- Start --- */
  startQuiz();
})();
