/* === TOPIK Vocabulary Practice — Common Utilities === */

const App = (() => {
  let loadedData = {};  // { 1: [...], 2: [...], ... }
  let audioManifest = null;
  const audioBasePath = 'audio/tts/';

  /* --- URL Parameters --- */
  function getParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      student: params.get('student') || '',
      levels: (params.get('levels') || '').split(',').filter(l => l).map(Number),
    };
  }

  /* --- Student Name --- */
  function getStudentName() {
    const p = getParams();
    if (p.student) {
      localStorage.setItem('topikStudent', p.student);
      return p.student;
    }
    return localStorage.getItem('topikStudent') || '';
  }

  function setStudentName(name) {
    localStorage.setItem('topikStudent', name);
  }

  /* --- Selected Levels --- */
  function getSelectedLevels() {
    const p = getParams();
    if (p.levels.length > 0) {
      localStorage.setItem('topikLevels', JSON.stringify(p.levels));
      return p.levels;
    }
    const stored = localStorage.getItem('topikLevels');
    return stored ? JSON.parse(stored) : [1];
  }

  function setSelectedLevels(levels) {
    localStorage.setItem('topikLevels', JSON.stringify(levels));
  }

  /* --- Data Loading --- */
  async function loadLevel(level) {
    if (loadedData[level]) return loadedData[level];
    try {
      const resp = await fetch(`data/topik${level}.json`);
      if (!resp.ok) return [];
      loadedData[level] = await resp.json();
      return loadedData[level];
    } catch (e) {
      console.error(`Failed to load level ${level}:`, e);
      return [];
    }
  }

  async function loadSelectedWords() {
    const levels = getSelectedLevels();
    const allWords = [];
    for (const level of levels) {
      const words = await loadLevel(level);
      words.forEach(w => { w.level = level; });
      allWords.push(...words);
    }
    return allWords;
  }

  /* --- TTS --- */
  async function loadAudioManifest() {
    try {
      const resp = await fetch(audioBasePath + 'manifest.json');
      if (resp.ok) {
        audioManifest = await resp.json();
        console.log(`Loaded ${Object.keys(audioManifest).length} audio files`);
      }
    } catch (e) {
      console.log('No pre-generated audio, using Web Speech API');
    }
  }

  let currentAudio = null;

  function speak(text) {
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    if ('speechSynthesis' in window) speechSynthesis.cancel();

    if (audioManifest && audioManifest[text]) {
      const audio = new Audio(audioBasePath + audioManifest[text]);
      currentAudio = audio;
      audio.play().catch(() => speakWebAPI(text));
      return;
    }
    speakWebAPI(text);
  }

  function speakWebAPI(text) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'ko-KR';
    utter.rate = 0.85;
    const voices = speechSynthesis.getVoices();
    const ko = voices.find(v => v.lang.startsWith('ko'));
    if (ko) utter.voice = ko;
    speechSynthesis.speak(utter);
  }

  /* --- SRS Storage --- */
  function getSRSKey() {
    const student = getStudentName() || 'default';
    return `topikSRS_${student}`;
  }

  function getSRSData() {
    return JSON.parse(localStorage.getItem(getSRSKey()) || '{}');
  }

  function saveSRSData(data) {
    localStorage.setItem(getSRSKey(), JSON.stringify(data));
  }

  function getWordSRS(korean) {
    const data = getSRSData();
    return data[korean] || null;
  }

  function updateWordSRS(korean, quality) {
    // quality: 'know' (good), 'unsure' (hard), 'dont_know' (again)
    const data = getSRSData();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    const prev = data[korean] || {
      status: 'new',
      interval: 0,
      easeFactor: 2.5,
      nextReview: today,
      reviewCount: 0,
      lastSeen: null,
    };

    prev.lastSeen = today;
    prev.reviewCount++;

    if (quality === 'know') {
      if (prev.interval === 0) {
        prev.interval = 1;
      } else if (prev.interval === 1) {
        prev.interval = 3;
      } else {
        prev.interval = Math.round(prev.interval * prev.easeFactor);
      }
      prev.easeFactor = Math.max(1.3, prev.easeFactor + 0.1);
      prev.status = prev.interval >= 14 ? 'mastered' : 'reviewing';
    } else if (quality === 'unsure') {
      prev.interval = Math.max(1, Math.round(prev.interval * 0.6));
      prev.easeFactor = Math.max(1.3, prev.easeFactor - 0.15);
      prev.status = 'learning';
    } else {
      // dont_know: reset
      prev.interval = 0;
      prev.easeFactor = Math.max(1.3, prev.easeFactor - 0.2);
      prev.status = 'learning';
    }

    const nextDate = new Date(now);
    nextDate.setDate(nextDate.getDate() + (prev.interval || 1));
    prev.nextReview = nextDate.toISOString().slice(0, 10);

    data[korean] = prev;
    saveSRSData(data);
    return prev;
  }

  /* --- Stats --- */
  function getStats(words) {
    const srs = getSRSData();
    const today = new Date().toISOString().slice(0, 10);
    let mastered = 0, learning = 0, reviewDue = 0, unseen = 0;

    for (const word of words) {
      const s = srs[word.kr];
      if (!s) { unseen++; continue; }
      if (s.status === 'mastered') mastered++;
      else if (s.status === 'learning') learning++;
      else if (s.status === 'reviewing') {
        if (s.nextReview <= today) reviewDue++;
        else mastered++;
      }
      else unseen++;
    }
    return { total: words.length, mastered, learning, reviewDue, unseen };
  }

  function getDueWords(words) {
    const srs = getSRSData();
    const today = new Date().toISOString().slice(0, 10);
    return words.filter(w => {
      const s = srs[w.kr];
      if (!s) return true;  // new words are due
      return s.nextReview <= today;
    });
  }

  /* --- Webhook (batch tracking) --- */
  const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbw3f0cxkufdZkrG6kABkMy9djKGIrJvQX1qqqcFMFgt89ZhNGRlFVElYFUohA3z-tqoew/exec';
  const PENDING_KEY = 'topikPending';

  function trackResponse(kr, en, status, level, source) {
    const entry = {
      timestamp: new Date().toISOString(),
      student: getStudentName(),
      word_kr: kr,
      word_en: en,
      status,
      level: level || 0,
      source: source || 'flashcard',
    };

    const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    pending.push(entry);
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));

    if (pending.length >= 20) flushBatch();
  }

  function flushBatch() {
    const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    if (pending.length === 0) return;

    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon(WEBHOOK_URL, JSON.stringify(pending));
      if (sent) { localStorage.setItem(PENDING_KEY, '[]'); return; }
    }

    fetch(WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(pending)
    }).then(() => localStorage.setItem(PENDING_KEY, '[]'))
      .catch(() => {});
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushBatch();
  });
  window.addEventListener('beforeunload', () => flushBatch());
  setInterval(flushBatch, 5 * 60 * 1000);

  /* --- Init --- */
  async function init() {
    if ('speechSynthesis' in window) speechSynthesis.getVoices();
    await loadAudioManifest();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    getParams,
    getStudentName,
    setStudentName,
    getSelectedLevels,
    setSelectedLevels,
    loadLevel,
    loadSelectedWords,
    speak,
    getSRSData,
    getWordSRS,
    updateWordSRS,
    getStats,
    getDueWords,
    trackResponse,
    flushBatch,
  };
})();
