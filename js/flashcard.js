/* === TOPIK Flashcard Module === */

(async () => {
  const allWords = await App.loadSelectedWords();

  /* --- Build category filter --- */
  const categories = new Map();
  allWords.forEach(w => {
    const cat = w.category || 'Other';
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat).push(w);
  });

  /* --- SRS-based sort: due words first, then weak, then new, then mastered --- */
  function srsOrder(word) {
    const s = App.getWordSRS(word.kr);
    if (!s) return 1; // new
    const today = new Date().toISOString().slice(0, 10);
    if (s.status === 'learning') return 0;
    if (s.nextReview <= today) return 0; // due
    if (s.status === 'mastered') return 3;
    return 2; // reviewing, not yet due
  }

  allWords.sort((a, b) => srsOrder(a) - srsOrder(b));

  /* --- State --- */
  let currentCards = [...allWords];
  let currentIdx = 0;
  let isFlipped = false;
  let cardDirection = localStorage.getItem('topikCardDir') || 'kr-en';
  let reviewMode = false;

  /* --- DOM --- */
  const flashcardEl = document.getElementById('flashcard');
  const innerEl = document.getElementById('flashcard-inner');
  const koreanEl = document.getElementById('card-korean');
  const englishEl = document.getElementById('card-english');
  const posEl = document.getElementById('card-pos');
  const exampleEl = document.getElementById('card-example');
  const progressEl = document.getElementById('progress');
  const ttsBtn = document.getElementById('card-tts');
  const masteryStatsEl = document.getElementById('mastery-stats');
  const reviewBanner = document.getElementById('review-banner');
  const reviewDueBtn = document.getElementById('review-due-btn');
  const reviewExitBtn = document.getElementById('review-exit-btn');

  /* --- Build category tabs --- */
  const filterBar = document.getElementById('filter-bar');
  const catNames = ['All', ...categories.keys()];

  catNames.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn' + (cat === 'All' ? ' active' : '');
    const count = cat === 'All' ? allWords.length : (categories.get(cat) || []).length;
    btn.textContent = cat + ' (' + count + ')';
    btn.addEventListener('click', () => {
      exitReviewMode();
      currentCards = cat === 'All' ? [...allWords] : [...(categories.get(cat) || [])];
      currentIdx = 0;
      isFlipped = false;
      filterBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      render();
    });
    filterBar.appendChild(btn);
  });

  /* --- Mastery Stats --- */
  function updateMasteryStats() {
    const srs = App.getSRSData();
    let know = 0, learning = 0, dontKnow = 0;
    for (const card of currentCards) {
      const s = srs[card.kr];
      if (!s) continue;
      if (s.status === 'mastered' || s.status === 'reviewing') know++;
      else if (s.status === 'learning') {
        if (s.interval > 0) learning++;
        else dontKnow++;
      }
    }
    if (masteryStatsEl) {
      masteryStatsEl.innerHTML =
        '<span class="stat-know">&#10003; ' + know + '</span>' +
        '&nbsp;&nbsp;<span class="stat-unsure">? ' + learning + '</span>' +
        '&nbsp;&nbsp;<span class="stat-dont-know">&#10007; ' + dontKnow + '</span>';
    }
    // Update due count
    const dueCount = App.getDueWords(allWords).length;
    if (reviewDueBtn) reviewDueBtn.textContent = 'Due (' + dueCount + ')';
  }

  /* --- Card Badge --- */
  function updateCardBadge() {
    const existing = flashcardEl.querySelector('.card-badge');
    if (existing) existing.remove();
    const srsInfo = flashcardEl.querySelector('.srs-info');
    if (srsInfo) srsInfo.remove();

    if (currentCards.length === 0) return;
    const card = currentCards[currentIdx];
    const s = App.getWordSRS(card.kr);

    const badge = document.createElement('div');
    badge.className = 'card-badge ' + (s ? s.status : 'new');
    flashcardEl.querySelector('.flashcard-front').appendChild(badge);

    // Show level tag
    if (card.level) {
      const info = document.createElement('div');
      info.className = 'srs-info';
      info.textContent = 'L' + card.level;
      flashcardEl.querySelector('.flashcard-front').appendChild(info);
    }
  }

  /* --- Render --- */
  function render() {
    if (currentCards.length === 0) {
      koreanEl.textContent = reviewMode ? 'All clear!' : 'No cards';
      englishEl.textContent = '';
      posEl.textContent = '';
      exampleEl.textContent = '';
      progressEl.textContent = '0 / 0';
      updateMasteryStats();
      return;
    }
    const card = currentCards[currentIdx];
    if (cardDirection === 'en-kr') {
      koreanEl.textContent = card.en;
      englishEl.textContent = card.kr;
    } else {
      koreanEl.textContent = card.kr;
      englishEl.textContent = card.en;
    }
    posEl.textContent = card.pos || '';
    exampleEl.textContent = card.ex_kr ? card.ex_kr + '\n' + card.ex_en : '';
    progressEl.textContent = (currentIdx + 1) + ' / ' + currentCards.length;
    innerEl.classList.toggle('flipped', isFlipped);
    updateCardBadge();
    updateMasteryStats();
  }

  /* --- Review Mode --- */
  function enterReviewMode() {
    const dueWords = App.getDueWords(allWords);
    if (dueWords.length === 0) {
      koreanEl.textContent = 'All reviewed!';
      englishEl.textContent = '';
      posEl.textContent = '';
      exampleEl.textContent = '';
      progressEl.textContent = '0 / 0';
      return;
    }
    reviewMode = true;
    currentCards = dueWords;
    currentIdx = 0;
    isFlipped = false;
    if (reviewBanner) reviewBanner.classList.remove('hidden');
    document.getElementById('review-label').textContent = `Reviewing ${dueWords.length} due words`;
    render();
  }

  function exitReviewMode() {
    reviewMode = false;
    if (reviewBanner) reviewBanner.classList.add('hidden');
  }

  if (reviewDueBtn) reviewDueBtn.addEventListener('click', enterReviewMode);
  if (reviewExitBtn) {
    reviewExitBtn.addEventListener('click', () => {
      exitReviewMode();
      currentCards = [...allWords];
      currentIdx = 0;
      isFlipped = false;
      filterBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      const allTab = filterBar.querySelector('.filter-btn');
      if (allTab) allTab.classList.add('active');
      render();
    });
  }

  // Auto-enter review mode if ?mode=review
  if (new URLSearchParams(window.location.search).get('mode') === 'review') {
    enterReviewMode();
  }

  /* --- Flip --- */
  flashcardEl.addEventListener('click', (e) => {
    if (e.target === ttsBtn || e.target.closest('#card-tts')) return;
    isFlipped = !isFlipped;
    render();
  });

  /* --- TTS --- */
  ttsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentCards.length > 0) {
      const card = currentCards[currentIdx];
      App.speak(cardDirection === 'en-kr' ? card.en : card.kr);
    }
  });

  /* --- Direction toggle --- */
  const dirBtn = document.getElementById('direction-btn');
  function updateDirBtn() {
    if (dirBtn) dirBtn.innerHTML = cardDirection === 'kr-en' ? 'EN &rarr; KR' : 'KR &rarr; EN';
  }
  updateDirBtn();
  if (dirBtn) {
    dirBtn.addEventListener('click', () => {
      cardDirection = cardDirection === 'kr-en' ? 'en-kr' : 'kr-en';
      localStorage.setItem('topikCardDir', cardDirection);
      isFlipped = false;
      updateDirBtn();
      render();
    });
  }

  /* --- Navigation --- */
  document.getElementById('prev-btn').addEventListener('click', () => {
    if (currentCards.length === 0) return;
    currentIdx = (currentIdx - 1 + currentCards.length) % currentCards.length;
    isFlipped = false;
    render();
  });

  document.getElementById('next-btn').addEventListener('click', () => {
    if (currentCards.length === 0) return;
    currentIdx = (currentIdx + 1) % currentCards.length;
    isFlipped = false;
    render();
  });

  /* --- Shuffle --- */
  document.getElementById('shuffle-btn').addEventListener('click', () => {
    for (let i = currentCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [currentCards[i], currentCards[j]] = [currentCards[j], currentCards[i]];
    }
    currentIdx = 0;
    isFlipped = false;
    render();
  });

  /* --- Response Buttons --- */
  const respContainer = document.getElementById('response-buttons');
  if (respContainer) {
    function handleResponse(status) {
      if (currentCards.length === 0) return;
      const card = currentCards[currentIdx];

      // Update SRS
      App.updateWordSRS(card.kr, status);
      App.trackResponse(card.kr, card.en, status, card.level, 'flashcard');

      // Re-queue dont_know cards
      if (status === 'dont_know') {
        const reinsertIdx = Math.min(currentIdx + 6, currentCards.length);
        currentCards.splice(reinsertIdx, 0, { ...card });
      }

      // Visual feedback
      const btns = respContainer.querySelectorAll('.resp-btn');
      btns.forEach(b => b.classList.add('resp-used'));
      setTimeout(() => {
        btns.forEach(b => b.classList.remove('resp-used'));
        currentIdx = (currentIdx + 1) % currentCards.length;
        isFlipped = false;
        render();
      }, 350);
    }

    respContainer.querySelector('[data-resp="know"]').addEventListener('click', () => handleResponse('know'));
    respContainer.querySelector('[data-resp="unsure"]').addEventListener('click', () => handleResponse('unsure'));
    respContainer.querySelector('[data-resp="dont_know"]').addEventListener('click', () => handleResponse('dont_know'));
  }

  /* --- Keyboard --- */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') document.getElementById('prev-btn').click();
    if (e.key === 'ArrowRight') document.getElementById('next-btn').click();
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      isFlipped = !isFlipped;
      render();
    }
    if (respContainer) {
      if (e.key === '1') respContainer.querySelector('[data-resp="know"]').click();
      if (e.key === '2') respContainer.querySelector('[data-resp="unsure"]').click();
      if (e.key === '3') respContainer.querySelector('[data-resp="dont_know"]').click();
    }
  });

  /* --- Touch swipe --- */
  let touchStartX = 0;
  flashcardEl.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });

  flashcardEl.addEventListener('touchend', (e) => {
    const diff = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) document.getElementById('prev-btn').click();
      else document.getElementById('next-btn').click();
    }
  });

  /* --- Initial render --- */
  render();
})();
