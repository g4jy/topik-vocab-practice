/* === TOPIK Sentence Quiz Module === */

(async () => {
  const allWords = await App.loadSelectedWords();

  // Filter words that have example sentences containing the word
  const eligibleWords = allWords.filter(w => {
    if (!w.ex_kr || !w.kr) return false;
    // The word must appear in the example sentence
    return w.ex_kr.includes(w.kr) || containsWordForm(w.ex_kr, w.kr);
  });

  function containsWordForm(sentence, word) {
    // Korean verbs/adjectives often appear in conjugated forms
    // Check if the stem (removing last char like 다) appears
    if (word.endsWith('다') && word.length > 2) {
      const stem = word.slice(0, -1);
      return sentence.includes(stem);
    }
    return false;
  }

  function createBlank(sentence, word) {
    // Try exact match first
    if (sentence.includes(word)) {
      return sentence.replace(word, '______');
    }
    // Try stem match for verbs
    if (word.endsWith('다') && word.length > 2) {
      const stem = word.slice(0, -1);
      // Find the conjugated form and blank it
      const regex = new RegExp(stem + '[가-힣]*');
      const match = sentence.match(regex);
      if (match) {
        return sentence.replace(match[0], '______');
      }
    }
    return sentence.replace(word, '______');
  }

  function getExpectedAnswers(sentence, word) {
    const answers = [word];
    // If verb, the conjugated form is also acceptable
    if (word.endsWith('다') && word.length > 2) {
      const stem = word.slice(0, -1);
      const regex = new RegExp(stem + '[가-힣]*');
      const match = sentence.match(regex);
      if (match && match[0] !== word) {
        answers.push(match[0]);
      }
    }
    return answers;
  }

  /* --- State --- */
  let quizWords = [];
  let currentIdx = 0;
  let correct = 0;
  let total = 0;
  let answered = false;
  let wrongQueue = [];

  /* --- DOM --- */
  const sentenceText = document.getElementById('sentence-text');
  const sentenceTranslation = document.getElementById('sentence-translation');
  const wordHint = document.getElementById('word-hint');
  const inputEl = document.getElementById('sentence-input');
  const submitBtn = document.getElementById('sentence-submit');
  const feedbackEl = document.getElementById('sentence-feedback');
  const feedbackText = document.getElementById('sentence-feedback-text');
  const sentenceFull = document.getElementById('sentence-full');
  const scoreDisplay = document.getElementById('score-display');
  const nextBtn = document.getElementById('next-sentence');
  const restartBtn = document.getElementById('restart-sentences');

  /* --- Start --- */
  function startQuiz() {
    // Shuffle eligible words
    const shuffled = [...eligibleWords];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    quizWords = shuffled.slice(0, 20);
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
      if (wrongQueue.length > 0) {
        quizWords = [...wrongQueue];
        wrongQueue = [];
        currentIdx = 0;
        wordHint.textContent = 'Reviewing incorrect answers...';
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

    const blanked = createBlank(word.ex_kr, word.kr);
    sentenceText.textContent = blanked;
    sentenceTranslation.textContent = word.ex_en;
    wordHint.textContent = `Hint: ${word.en} (${word.pos})`;

    scoreDisplay.textContent = `${correct} / ${total}`;
  }

  /* --- Check --- */
  function checkAnswer() {
    if (answered) { nextQuestion(); return; }

    const word = quizWords[currentIdx];
    const answer = inputEl.value.trim();
    if (!answer) return;

    answered = true;
    total++;
    inputEl.disabled = true;

    const expected = getExpectedAnswers(word.ex_kr, word.kr);
    const isCorrect = expected.some(e => answer === e);

    if (isCorrect) {
      correct++;
      feedbackEl.className = 'quiz-feedback correct';
      feedbackText.textContent = 'Correct!';
      App.updateWordSRS(word.kr, 'know');
      App.trackResponse(word.kr, word.en, 'know', word.level, 'sentence');
    } else {
      feedbackEl.className = 'quiz-feedback incorrect';
      feedbackText.innerHTML = `The answer was: <strong>${word.kr}</strong>`;
      wrongQueue.push(word);
      App.updateWordSRS(word.kr, 'dont_know');
      App.trackResponse(word.kr, word.en, 'dont_know', word.level, 'sentence');
    }

    sentenceFull.textContent = word.ex_kr;
    feedbackEl.classList.remove('hidden');
    scoreDisplay.textContent = `${correct} / ${total}`;

    // TTS
    App.speak(word.ex_kr);
  }

  /* --- Complete --- */
  function showComplete() {
    sentenceText.textContent = 'Quiz Complete!';
    sentenceTranslation.textContent = '';
    wordHint.textContent = '';
    inputEl.disabled = true;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    feedbackEl.className = 'quiz-feedback correct';
    feedbackText.textContent = `Score: ${correct} / ${total} (${pct}%)`;
    sentenceFull.textContent = '';
    feedbackEl.classList.remove('hidden');
  }

  function nextQuestion() {
    currentIdx++;
    showQuestion();
  }

  /* --- Events --- */
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
  if (eligibleWords.length === 0) {
    sentenceText.textContent = 'No sentences available for selected levels.';
    sentenceTranslation.textContent = 'Try selecting different TOPIK levels.';
  } else {
    startQuiz();
  }
})();
