/**
 * Catch Game — Stage 4 (State & Storage)
 * Pure vanilla JavaScript implementation following Plan_4.md.
 * Compatible with direct browser execution via file:// (no external dependencies, 100% offline).
 */

(function () {
  'use strict';

  // --- Constants ---
  const ARENA_WIDTH = 480;
  const ARENA_HEIGHT = 640;
  const BASKET_WIDTH = 90;
  const BASKET_HEIGHT = 38;
  const BASKET_BOTTOM_OFFSET = 20;
  const BASKET_Y = ARENA_HEIGHT - BASKET_BOTTOM_OFFSET - BASKET_HEIGHT; // 582px
  const BASKET_SPEED = 480; // pixels per second (~8px/frame at 60Hz)

  const ITEM_SIZE = 40;
  const FRUIT_ITEMS = ['🍎', '🍊', '🍋', '🍇', '🍓', '🍒', '🌟', '💎', '🍉'];
  const BOMB_ITEMS = ['💣'];
  const BOMB_CHANCE = 0.25; // 25% chance of bomb, 75% chance of fruit

  const SCORE_CATCH_FRUIT = 10;
  const SCORE_CATCH_BOMB = -10;
  const STARTING_LIVES = 3;

  // ==========================================================================
  // Storage Manager Module (Plan 4, Sections 1 & 2)
  // ==========================================================================
  const StorageManager = {
    KEYS: {
      HIGH_SCORE: 'catchGame_highScore',
      SETTINGS: 'catchGame_settings',
      VERSION: 'catchGame_version',
    },

    DEFAULTS: {
      highScore: 0,
      settings: {
        soundEnabled: true,
        musicEnabled: true,
        volume: 0.7,
      },
      version: '1',
    },

    _memoryFallback: false,
    _memoryStore: {
      highScore: 0,
      settings: { soundEnabled: true, musicEnabled: true, volume: 0.7 },
      version: '1'
    },

    _isAvailable() {
      try {
        const testKey = '__catchGame_test__';
        localStorage.setItem(testKey, '1');
        localStorage.removeItem(testKey);
        return true;
      } catch (e) {
        return false;
      }
    },

    _safeGet(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
      } catch (e) {
        console.warn(`[StorageManager] Failed to read "${key}":`, e);
        return fallback;
      }
    },

    _safeSet(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.warn(`[StorageManager] Failed to write "${key}":`, e);
        return false;
      }
    },

    validateHighScore(value) {
      const num = Number(value);
      if (!Number.isFinite(num) || num < 0) return 0;
      return Math.floor(num);
    },

    validateSettings(obj) {
      const defaults = this.DEFAULTS.settings;
      if (typeof obj !== 'object' || obj === null) return { ...defaults };
      return {
        soundEnabled: typeof obj.soundEnabled === 'boolean' ? obj.soundEnabled : defaults.soundEnabled,
        musicEnabled: typeof obj.musicEnabled === 'boolean' ? obj.musicEnabled : defaults.musicEnabled,
        volume: typeof obj.volume === 'number' && obj.volume >= 0 && obj.volume <= 1
          ? obj.volume
          : defaults.volume,
      };
    },

    init() {
      if (!this._isAvailable()) {
        console.warn('[StorageManager] localStorage not available. Using in-memory defaults.');
        this._memoryFallback = true;
        this._memoryStore = {
          highScore: this.DEFAULTS.highScore,
          settings: { ...this.DEFAULTS.settings },
          version: this.DEFAULTS.version
        };
        return;
      }

      // 1. Version check / init
      if (localStorage.getItem(this.KEYS.VERSION) === null) {
        this._safeSet(this.KEYS.VERSION, this.DEFAULTS.version);
      }

      // 2. High score init
      if (localStorage.getItem(this.KEYS.HIGH_SCORE) === null) {
        this._safeSet(this.KEYS.HIGH_SCORE, this.DEFAULTS.highScore);
      } else {
        const rawScore = this._safeGet(this.KEYS.HIGH_SCORE, this.DEFAULTS.highScore);
        const validScore = this.validateHighScore(rawScore);
        this._safeSet(this.KEYS.HIGH_SCORE, validScore);
      }

      // 3. Settings init & merge with defaults
      const savedSettings = this._safeGet(this.KEYS.SETTINGS, null);
      if (savedSettings === null) {
        this._safeSet(this.KEYS.SETTINGS, this.DEFAULTS.settings);
      } else {
        const validated = this.validateSettings(savedSettings);
        this._safeSet(this.KEYS.SETTINGS, validated);
      }
    },

    getHighScore() {
      if (this._memoryFallback) return this._memoryStore.highScore;
      const val = this._safeGet(this.KEYS.HIGH_SCORE, this.DEFAULTS.highScore);
      return this.validateHighScore(val);
    },

    setHighScore(score) {
      const validScore = this.validateHighScore(score);
      const current = this.getHighScore();
      if (validScore > current) {
        if (this._memoryFallback) {
          this._memoryStore.highScore = validScore;
        } else {
          this._safeSet(this.KEYS.HIGH_SCORE, validScore);
        }
        return true; // New record set
      }
      return false;
    },

    getSettings() {
      if (this._memoryFallback) return { ...this._memoryStore.settings };
      const raw = this._safeGet(this.KEYS.SETTINGS, { ...this.DEFAULTS.settings });
      return this.validateSettings(raw);
    },

    saveSetting(key, value) {
      const settings = this.getSettings();
      settings[key] = value;
      this.saveSettings(settings);
    },

    saveSettings(settingsObj) {
      const validated = this.validateSettings(settingsObj);
      if (this._memoryFallback) {
        this._memoryStore.settings = { ...validated };
      } else {
        this._safeSet(this.KEYS.SETTINGS, validated);
      }
    },

    clearAll() {
      if (this._memoryFallback) {
        this._memoryStore.highScore = this.DEFAULTS.highScore;
        this._memoryStore.settings = { ...this.DEFAULTS.settings };
        this._memoryStore.version = this.DEFAULTS.version;
        return;
      }

      try {
        localStorage.removeItem(this.KEYS.HIGH_SCORE);
        localStorage.removeItem(this.KEYS.SETTINGS);
        localStorage.removeItem(this.KEYS.VERSION);
      } catch (e) {
        console.warn('[StorageManager] Failed to clear data:', e);
      }

      this.init();
    }
  };

  // --- DOM Elements ---
  const arenaEl = document.getElementById('game-arena');
  const itemsContainerEl = document.getElementById('items-container');
  const fxContainerEl = document.getElementById('fx-container') || arenaEl;
  const basketEl = document.getElementById('basket');
  const hudLivesEl = document.getElementById('hud-lives');
  const hudScoreEl = document.getElementById('hud-score');
  const hudHighScoreEl = document.getElementById('hud-high-score');
  const btnPauseEl = document.getElementById('btn-pause');
  const btnSettingsHudEl = document.getElementById('btn-settings-hud');

  const overlayStartEl = document.getElementById('overlay-start');
  const overlayPauseEl = document.getElementById('overlay-pause');
  const overlayGameOverEl = document.getElementById('overlay-game-over');
  const overlaySettingsEl = document.getElementById('overlay-settings');

  const btnStartEl = document.getElementById('btn-start');
  const btnResumeEl = document.getElementById('btn-resume');
  const btnRestartPauseEl = document.getElementById('btn-restart-pause');
  const btnRestartEl = document.getElementById('btn-restart');
  const btnSettingsStartEl = document.getElementById('btn-settings-start');
  const btnSettingsPauseEl = document.getElementById('btn-settings-pause');
  const btnSettingsGameOverEl = document.getElementById('btn-settings-game-over');
  const btnCloseSettingsEl = document.getElementById('btn-close-settings');
  const btnResetDataEl = document.getElementById('btn-reset-data');

  const settingSoundEl = document.getElementById('setting-sound');
  const settingMusicEl = document.getElementById('setting-music');
  const settingVolumeEl = document.getElementById('setting-volume');
  const volumeDisplayEl = document.getElementById('volume-display');
  const toastNotificationEl = document.getElementById('toast-notification');

  const finalScoreEl = document.getElementById('final-score');
  const bestScoreEl = document.getElementById('best-score');
  const highScoreBannerEl = document.getElementById('high-score-banner');

  // Dynamic live arena width calculation (Plan 5, Bug #4)
  function getArenaWidth() {
    return (arenaEl && arenaEl.clientWidth) ? arenaEl.clientWidth : ARENA_WIDTH;
  }

  // --- In-Memory Game State (Plan 4, Section 3) ---
  let gameState = 'IDLE'; // 'IDLE' | 'RUNNING' | 'PAUSED' | 'GAME_OVER'
  let previousStateBeforeSettings = 'IDLE';
  let score = 0;
  let lives = STARTING_LIVES;
  let highScore = 0;
  let settings = { ...StorageManager.DEFAULTS.settings };
  let basketX = (ARENA_WIDTH - BASKET_WIDTH) / 2;
  let activeItems = [];
  let nextItemId = 1;

  let elapsedTime = 0; // ms (pause-aware active gameplay time)
  let spawnTimer = 0; // ms
  let animationFrameId = null;
  let lastTimestamp = 0;
  let pauseStartTime = 0;
  let totalPausedTime = 0;

  let flashTimeout = null;
  let pulseTimeout = null;
  let toastTimeout = null;

  const keysHeld = {
    left: false,
    right: false
  };

  // --- Web Audio API & Synth (Plan 3 & Plan 4) ---
  let audioCtx = null;
  let masterGainNode = null;
  let activeAudioCount = 0;
  const MAX_CONCURRENT_AUDIO = 3;

  // Background Music Synth State
  let bgMusicOscillator = null;
  let bgMusicGain = null;
  let bgMusicInterval = null;
  let bgMusicStep = 0;
  const BG_MUSIC_NOTES = [261.63, 293.66, 329.63, 349.23, 392.00, 329.63, 293.66, 261.63]; // C4, D4, E4, F4, G4, E4, D4, C4

  function initAudio() {
    try {
      if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          audioCtx = new AudioContextClass();
          masterGainNode = audioCtx.createGain();
          masterGainNode.gain.setValueAtTime(settings.volume, audioCtx.currentTime);
          masterGainNode.connect(audioCtx.destination);
        }
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
    } catch (e) {
      // AudioContext unavailable or blocked
    }
    return audioCtx;
  }

  function setMasterVolume(vol) {
    if (masterGainNode && audioCtx) {
      try {
        masterGainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
      } catch (e) {}
    }
  }

  function startBackgroundMusic() {
    if (!settings.musicEnabled) return;
    if (!audioCtx) initAudio();
    if (!audioCtx) return;
    if (bgMusicInterval) return; // Already running

    bgMusicInterval = setInterval(() => {
      if (gameState !== 'RUNNING' || !settings.musicEnabled || !audioCtx) return;
      try {
        const note = BG_MUSIC_NOTES[bgMusicStep % BG_MUSIC_NOTES.length];
        bgMusicStep++;

        const osc = audioCtx.createOscillator();
        const noteGain = audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note, audioCtx.currentTime);

        // Soft, ambient volume
        const noteVol = 0.05 * settings.volume;
        noteGain.gain.setValueAtTime(0, audioCtx.currentTime);
        noteGain.gain.linearRampToValueAtTime(noteVol, audioCtx.currentTime + 0.04);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.38);

        osc.connect(noteGain);
        noteGain.connect(masterGainNode || audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
      } catch (e) {}
    }, 420);
  }

  function stopBackgroundMusic() {
    if (bgMusicInterval) {
      clearInterval(bgMusicInterval);
      bgMusicInterval = null;
    }
  }

  function playChimeSound() {
    if (!settings.soundEnabled) return;
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (activeAudioCount >= MAX_CONCURRENT_AUDIO) return;

    activeAudioCount++;
    setTimeout(() => {
      activeAudioCount = Math.max(0, activeAudioCount - 1);
    }, 500);

    try {
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 major arpeggio
      const now = audioCtx.currentTime;

      notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.07);

        const targetGain = 0.18 * settings.volume;
        gain.gain.setValueAtTime(0, now + i * 0.07);
        gain.gain.linearRampToValueAtTime(targetGain, now + i * 0.07 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.35);

        osc.connect(gain);
        gain.connect(masterGainNode || audioCtx.destination);
        osc.start(now + i * 0.07);
        osc.stop(now + i * 0.07 + 0.4);
      });
    } catch (e) {
      // Audio playback failed
    }
  }

  function playBombSound() {
    if (!settings.soundEnabled) return;
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (activeAudioCount >= MAX_CONCURRENT_AUDIO) return;

    activeAudioCount++;
    setTimeout(() => {
      activeAudioCount = Math.max(0, activeAudioCount - 1);
    }, 450);

    try {
      const bufferSize = Math.floor(audioCtx.sampleRate * 0.4); // 0.4 seconds
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        // White noise decaying exponentially
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
      }

      const source = audioCtx.createBufferSource();
      source.buffer = buffer;

      // Low-pass filter to give it a "thud" quality
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 300;

      // Gain envelope
      const gainNode = audioCtx.createGain();
      const targetGain = 0.6 * settings.volume;
      gainNode.gain.setValueAtTime(targetGain, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);

      source.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(masterGainNode || audioCtx.destination);
      source.start();
    } catch (e) {
      // Audio playback failed
    }
  }

  // --- Settings Application (Plan 4, Section 5.3) ---
  function applySettings() {
    setMasterVolume(settings.volume);

    // Apply UI control states
    if (settingSoundEl) settingSoundEl.checked = !!settings.soundEnabled;
    if (settingMusicEl) settingMusicEl.checked = !!settings.musicEnabled;
    if (settingVolumeEl) {
      const pct = Math.round(settings.volume * 100);
      settingVolumeEl.value = pct;
      if (volumeDisplayEl) volumeDisplayEl.textContent = `${pct}%`;
    }

    if (settings.musicEnabled && gameState === 'RUNNING') {
      startBackgroundMusic();
    } else {
      stopBackgroundMusic();
    }
  }

  function onSettingChanged(key, value) {
    settings[key] = value;
    StorageManager.saveSetting(key, value);
    applySettings();
  }

  // Toast Notification (Plan 4, Section 9.4)
  function showToast(message, duration = 2000) {
    if (!toastNotificationEl) return;
    toastNotificationEl.textContent = message;
    toastNotificationEl.classList.remove('hidden');

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toastNotificationEl.classList.add('hidden');
      toastTimeout = null;
    }, duration);
  }

  // --- Difficulty (Plan 1) ---
  function getDifficulty(elapsedMs) {
    const elapsedSeconds = elapsedMs / 1000;
    if (elapsedSeconds < 30) {
      return { spawnInterval: 1200, fallSpeed: 180 }; // ~3px/frame at 60fps
    } else if (elapsedSeconds < 60) {
      return { spawnInterval: 900, fallSpeed: 240 };  // ~4px/frame
    } else if (elapsedSeconds < 90) {
      return { spawnInterval: 700, fallSpeed: 300 };  // ~5px/frame
    } else {
      return { spawnInterval: 500, fallSpeed: 380 };  // ~6.3px/frame
    }
  }

  function renderLives() {
    const fullHearts = '❤️'.repeat(Math.max(0, lives));
    const emptyHearts = '🖤'.repeat(Math.max(0, STARTING_LIVES - lives));
    hudLivesEl.textContent = fullHearts + emptyHearts;
  }

  function renderScore() {
    hudScoreEl.textContent = `Score: ${score}`;
    hudHighScoreEl.textContent = `High: ${highScore}`;
  }

  let isBasketPulsing = false;

  function renderBasket() {
    let angle = 0;
    if (keysHeld.left && !keysHeld.right) angle = -4;
    if (keysHeld.right && !keysHeld.left) angle = 4;
    const scale = isBasketPulsing ? 'scale(1.08)' : 'scale(1)';
    basketEl.style.transform = `translateX(${basketX}px) rotate(${angle}deg) ${scale}`;
  }

  function triggerBasketCatchFeedback(type, catchX, catchY) {
    // 1. Basket Flash (200ms)
    if (flashTimeout) {
      clearTimeout(flashTimeout);
      basketEl.classList.remove('hit-good', 'hit-bad');
    }
    const className = type === 'good' ? 'hit-good' : 'hit-bad';
    basketEl.classList.add(className);
    flashTimeout = setTimeout(() => {
      basketEl.classList.remove(className);
      flashTimeout = null;
    }, 200);

    // 2. Basket Scale Pulse (180ms)
    isBasketPulsing = true;
    renderBasket();
    if (pulseTimeout) clearTimeout(pulseTimeout);
    pulseTimeout = setTimeout(() => {
      isBasketPulsing = false;
      renderBasket();
      pulseTimeout = null;
    }, 180);

    // 3. Catch Ripple (300ms)
    createCatchRipple(catchX, catchY, type);
  }

  // --- Sensory Feedback Effects (Plan 3, Sections 2, 5, 7) ---
  const activeParticles = [];
  const MAX_TOTAL_PARTICLES = 30;

  function createCatchRipple(x, y, type) {
    const rippleEl = document.createElement('div');
    rippleEl.className = `catch-ripple ${type === 'good' ? 'ripple-good' : 'ripple-bad'}`;
    rippleEl.style.left = `${x}px`;
    rippleEl.style.top = `${y}px`;
    fxContainerEl.appendChild(rippleEl);

    setTimeout(() => {
      if (rippleEl.parentNode) {
        rippleEl.parentNode.removeChild(rippleEl);
      }
    }, 320);
  }

  function createSparkleBurst(x, y, emoji) {
    let colors = ['#FFD700', '#FFA500', '#FFFFFF'];
    if (emoji === '🍎' || emoji === '🍓' || emoji === '🍒') {
      colors = ['#FF4D4D', '#FFD700', '#FF85A2'];
    } else if (emoji === '🍋') {
      colors = ['#FFEE55', '#FFD700', '#FFFDE7'];
    } else if (emoji === '🍇') {
      colors = ['#C084FC', '#E879F9', '#FFFFFF'];
    } else if (emoji === '🍉') {
      colors = ['#34D399', '#F87171', '#FFFFFF'];
    } else if (emoji === '💎') {
      colors = ['#38BDF8', '#818CF8', '#FFFFFF'];
    } else if (emoji === '🌟') {
      colors = ['#FBBF24', '#FCD34D', '#FFFFFF'];
    }

    const count = 8;
    for (let i = 0; i < count; i++) {
      if (activeParticles.length >= MAX_TOTAL_PARTICLES) {
        const oldest = activeParticles.shift();
        if (oldest.element && oldest.element.parentNode) {
          oldest.element.parentNode.removeChild(oldest.element);
        }
      }

      const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.5 - 0.25);
      const distance = 20 + Math.random() * 30;
      const size = 5 + Math.random() * 3;
      const duration = 0.35 + Math.random() * 0.15;
      const color = colors[Math.floor(Math.random() * colors.length)];

      const particleEl = document.createElement('div');
      particleEl.className = 'sparkle-particle';
      particleEl.style.width = `${size}px`;
      particleEl.style.height = `${size}px`;
      particleEl.style.backgroundColor = color;
      particleEl.style.color = color;
      particleEl.style.left = `${x}px`;
      particleEl.style.top = `${y}px`;
      fxContainerEl.appendChild(particleEl);

      activeParticles.push({
        element: particleEl,
        startX: x,
        startY: y,
        vx: Math.cos(angle) * distance,
        vy: Math.sin(angle) * distance,
        life: 0,
        maxLife: duration
      });
    }
  }

  function updateParticles(dtSeconds) {
    for (let i = activeParticles.length - 1; i >= 0; i--) {
      const p = activeParticles[i];
      p.life += dtSeconds;
      const progress = Math.min(1, p.life / p.maxLife);

      if (progress >= 1) {
        if (p.element.parentNode) {
          p.element.parentNode.removeChild(p.element);
        }
        activeParticles.splice(i, 1);
        continue;
      }

      const currentDistProgress = 1 - Math.pow(1 - progress, 2);
      const currentX = p.startX + p.vx * currentDistProgress;
      const currentY = p.startY + p.vy * currentDistProgress;
      const opacity = 1 - progress;
      const scale = 1 - progress;

      p.element.style.left = `${currentX}px`;
      p.element.style.top = `${currentY}px`;
      p.element.style.opacity = opacity.toFixed(2);
      p.element.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(2)})`;
    }
  }

  function createScorePopup(text, isPositive, x, y) {
    const currentArenaWidth = getArenaWidth();
    const popupEl = document.createElement('div');
    popupEl.className = `score-popup ${isPositive ? 'score-positive' : 'score-negative'}`;
    popupEl.textContent = text;
    popupEl.style.left = `${Math.max(30, Math.min(currentArenaWidth - 30, x))}px`;
    popupEl.style.top = `${y}px`;
    fxContainerEl.appendChild(popupEl);

    setTimeout(() => {
      if (popupEl.parentNode) {
        popupEl.parentNode.removeChild(popupEl);
      }
    }, 720);
  }

  function clearAllParticles() {
    for (let i = 0; i < activeParticles.length; i++) {
      if (activeParticles[i].element && activeParticles[i].element.parentNode) {
        activeParticles[i].element.parentNode.removeChild(activeParticles[i].element);
      }
    }
    activeParticles.length = 0;
    fxContainerEl.innerHTML = '';
  }

  // --- Spawning ---
  function spawnItem() {
    const isBomb = Math.random() < BOMB_CHANCE;
    const emoji = isBomb
      ? BOMB_ITEMS[Math.floor(Math.random() * BOMB_ITEMS.length)]
      : FRUIT_ITEMS[Math.floor(Math.random() * FRUIT_ITEMS.length)];

    const currentWidth = getArenaWidth();
    const itemWidth = ITEM_SIZE;
    const itemHeight = ITEM_SIZE;
    const maxSpawnX = Math.max(0, currentWidth - itemWidth);
    const spawnX = Math.floor(Math.random() * (maxSpawnX + 1));

    const itemEl = document.createElement('div');
    itemEl.className = 'falling-item';
    if (isBomb) {
      itemEl.classList.add('type-bomb');
    }
    itemEl.textContent = emoji;
    itemEl.style.left = `${spawnX}px`;
    itemEl.style.top = `-${itemHeight}px`;
    itemsContainerEl.appendChild(itemEl);

    const difficulty = getDifficulty(elapsedTime);

    const baseSpeed = difficulty.fallSpeed;
    const initialSpeedRatio = isBomb ? 0.7 : 0.6;
    const accelPerSec = isBomb ? 75 : 60;
    const maxSpeed = baseSpeed * 1.35;
    const rotSpeed = isBomb
      ? (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 60)
      : (Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 30);
    const wobbleAmp = isBomb ? (Math.random() * 2) : (2 + Math.random() * 2);
    const wobbleFreq = 2.5 + Math.random() * 1.5;
    const wobblePhase = Math.random() * Math.PI * 2;
    const fadeInDuration = isBomb ? 0.17 : 0.20;

    const item = {
      id: nextItemId++,
      type: isBomb ? 'bomb' : 'fruit',
      emoji: emoji,
      startX: spawnX,
      x: spawnX,
      y: -itemHeight,
      width: itemWidth,
      height: itemHeight,
      speed: baseSpeed * initialSpeedRatio,
      maxSpeed: maxSpeed,
      accel: accelPerSec,
      rotation: 0,
      rotationSpeed: rotSpeed,
      wobbleAmp: wobbleAmp,
      wobbleFreq: wobbleFreq,
      wobblePhase: wobblePhase,
      age: 0,
      fadeInDuration: fadeInDuration,
      element: itemEl,
      removed: false
    };

    activeItems.push(item);
  }

  function clearAllItems() {
    for (let i = 0; i < activeItems.length; i++) {
      if (activeItems[i].element && activeItems[i].element.parentNode) {
        activeItems[i].element.parentNode.removeChild(activeItems[i].element);
      }
    }
    activeItems = [];
    itemsContainerEl.innerHTML = '';
  }

  // --- Collision Detection (AABB) ---
  function checkCollision(item) {
    const tolerance = 4;
    const basketLeft = basketX - tolerance;
    const basketRight = basketX + BASKET_WIDTH + tolerance;
    const basketTop = BASKET_Y;
    const basketBottom = BASKET_Y + BASKET_HEIGHT;

    const itemLeft = item.x;
    const itemRight = item.x + item.width;
    const itemTop = item.y;
    const itemBottom = item.y + item.height;

    return (
      itemRight > basketLeft &&
      itemLeft < basketRight &&
      itemBottom > basketTop &&
      itemTop < basketBottom
    );
  }

  // --- Game Loop (Plan 4, Section 7: Pause-Aware Elapsed Time) ---
  function gameLoop(timestamp) {
    if (gameState !== 'RUNNING') {
      animationFrameId = null;
      return;
    }

    if (!lastTimestamp) {
      lastTimestamp = timestamp;
    }

    // Delta time in seconds, clamped to max 100ms
    const deltaMs = Math.min(timestamp - lastTimestamp, 100);
    const deltaSeconds = deltaMs / 1000;
    lastTimestamp = timestamp;

    // Accumulate elapsed gameplay time ONLY while RUNNING
    elapsedTime += deltaMs;

    // 1. Move Basket based on keys held (clamped to dynamic arena bounds)
    const currentArenaWidth = getArenaWidth();
    const maxBasketX = Math.max(0, currentArenaWidth - BASKET_WIDTH);
    if (keysHeld.left && !keysHeld.right) {
      basketX -= BASKET_SPEED * deltaSeconds;
    } else if (keysHeld.right && !keysHeld.left) {
      basketX += BASKET_SPEED * deltaSeconds;
    }
    basketX = Math.max(0, Math.min(maxBasketX, basketX));
    renderBasket();

    // 2. Spawning Logic
    const difficulty = getDifficulty(elapsedTime);
    spawnTimer += deltaMs;
    if (spawnTimer >= difficulty.spawnInterval) {
      spawnItem();
      spawnTimer = 0;
    }

    // 3. Update Falling Items & Collision / Miss Checks
    for (let i = 0; i < activeItems.length; i++) {
      const item = activeItems[i];
      if (item.removed) continue;

      item.age += deltaSeconds;

      item.speed = Math.min(item.maxSpeed, item.speed + item.accel * deltaSeconds);
      item.y += item.speed * deltaSeconds;

      item.rotation += item.rotationSpeed * deltaSeconds;

      const wobbleOffset = Math.sin(item.age * item.wobbleFreq + item.wobblePhase) * item.wobbleAmp;
      item.x = Math.max(0, Math.min(currentArenaWidth - item.width, item.startX + wobbleOffset));

      const opacity = Math.min(1, item.age / item.fadeInDuration);

      item.element.style.left = `${item.x}px`;
      item.element.style.top = `${item.y}px`;
      item.element.style.opacity = opacity.toFixed(2);
      item.element.style.transform = `rotate(${item.rotation.toFixed(1)}deg)`;

      // Collision Check
      if (checkCollision(item)) {
        item.removed = true;
        if (item.element.parentNode) {
          item.element.parentNode.removeChild(item.element);
        }

        const catchCenterX = item.x + item.width / 2;
        const catchCenterY = item.y + item.height / 2;

        if (item.type === 'fruit') {
          score += SCORE_CATCH_FRUIT;
          triggerBasketCatchFeedback('good', catchCenterX, catchCenterY);
          createSparkleBurst(catchCenterX, catchCenterY, item.emoji);
          createScorePopup(`+${SCORE_CATCH_FRUIT}`, true, catchCenterX, BASKET_Y - 12);
          playChimeSound();
        } else {
          score = Math.max(0, score + SCORE_CATCH_BOMB);
          triggerBasketCatchFeedback('bad', catchCenterX, catchCenterY);
          createScorePopup(`${SCORE_CATCH_BOMB}`, false, catchCenterX, BASKET_Y - 12);
          playBombSound();
        }

        // Live in-memory and persisted high score update (Plan 5, Bug #5)
        if (score > highScore) {
          highScore = score;
          StorageManager.setHighScore(highScore);
        }
        renderScore();
        continue;
      }

      // Miss Check
      if (item.y >= ARENA_HEIGHT) {
        item.removed = true;
        if (item.element.parentNode) {
          item.element.parentNode.removeChild(item.element);
        }

        if (item.type === 'fruit') {
          lives -= 1;
          renderLives();

          if (lives <= 0) {
            activeItems = activeItems.filter(it => !it.removed);
            triggerGameOver();
            return;
          }
        }
      }
    }

    // 4. Update Sensory Feedback Particles
    updateParticles(deltaSeconds);

    // Purge removed items
    activeItems = activeItems.filter(item => !item.removed);

    // Continue loop
    animationFrameId = requestAnimationFrame(gameLoop);
  }

  // --- State Transitions (Plan 4, Section 6) ---
  function startGame() {
    initAudio();

    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    stopBackgroundMusic();
    clearAllItems();
    clearAllParticles();

    // Reset gameplay state
    score = 0;
    lives = STARTING_LIVES;
    elapsedTime = 0;
    spawnTimer = 0;
    pauseStartTime = 0;
    totalPausedTime = 0;
    const currentWidth = getArenaWidth();
    basketX = Math.max(0, (currentWidth - BASKET_WIDTH) / 2);
    keysHeld.left = false;
    keysHeld.right = false;

    // Note: highScore and settings are PRESERVED!
    renderLives();
    renderScore();
    renderBasket();

    overlayStartEl.classList.add('hidden');
    overlayPauseEl.classList.add('hidden');
    overlayGameOverEl.classList.add('hidden');
    overlaySettingsEl.classList.add('hidden');

    gameState = 'RUNNING';
    lastTimestamp = 0;
    btnPauseEl.textContent = '⏸';

    startBackgroundMusic();

    animationFrameId = requestAnimationFrame(gameLoop);
  }

  function pauseGame() {
    if (gameState !== 'RUNNING') return;
    gameState = 'PAUSED';
    pauseStartTime = performance.now();

    // 1. Cancel active animation frame
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    // 2. Reset keys so basket doesn't keep gliding (Plan 5, Bug #1)
    keysHeld.left = false;
    keysHeld.right = false;

    // 3. Pause background music
    stopBackgroundMusic();

    // 4. Suspend audio context
    if (audioCtx && audioCtx.state === 'running') {
      audioCtx.suspend();
    }

    // 5. Update UI
    overlayPauseEl.classList.remove('hidden');
    btnPauseEl.textContent = '▶';
  }

  function resumeGame() {
    if (gameState !== 'PAUSED') return;

    // Guard: cancel any lingering animation frame before starting a new one (Plan 5, Bug #2)
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    // Reset input state to prevent ghost movement on resume (Plan 5, Bug #1)
    keysHeld.left = false;
    keysHeld.right = false;

    // Account for paused duration
    if (pauseStartTime > 0) {
      const pauseDuration = performance.now() - pauseStartTime;
      totalPausedTime += pauseDuration;
      pauseStartTime = 0;
    }

    // Reset lastTimestamp to prevent huge delta jump
    lastTimestamp = 0;

    initAudio();
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    overlayPauseEl.classList.add('hidden');
    overlaySettingsEl.classList.add('hidden');
    gameState = 'RUNNING';
    btnPauseEl.textContent = '⏸';

    stopBackgroundMusic();
    startBackgroundMusic();

    animationFrameId = requestAnimationFrame(gameLoop);
  }

  function togglePause() {
    if (gameState === 'RUNNING') {
      pauseGame();
    } else if (gameState === 'PAUSED') {
      resumeGame();
    }
  }

  function triggerGameOver() {
    gameState = 'GAME_OVER';
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    keysHeld.left = false;
    keysHeld.right = false;

    stopBackgroundMusic();

    // Persist high score to localStorage if beaten (Plan 4 & Plan 5)
    const isNewRecord = StorageManager.setHighScore(Math.max(score, highScore));
    highScore = StorageManager.getHighScore();

    finalScoreEl.textContent = score;
    bestScoreEl.textContent = highScore;
    renderScore();

    if (isNewRecord && score > 0) {
      highScoreBannerEl.classList.remove('hidden');
    } else {
      highScoreBannerEl.classList.add('hidden');
    }

    overlayGameOverEl.classList.remove('hidden');
  }

  // --- Settings UI Modal (Plan 4, Section 5.4 & 9) ---
  function openSettings() {
    // Only allow opening settings if NOT running mid-game
    if (gameState === 'RUNNING') {
      pauseGame();
    }
    previousStateBeforeSettings = gameState;
    overlaySettingsEl.classList.remove('hidden');
  }

  function closeSettings() {
    overlaySettingsEl.classList.add('hidden');
  }

  function onResetDataClicked() {
    const confirmed = window.confirm(
      'This will erase your high score and all saved settings.\n\nAre you sure?'
    );

    if (!confirmed) return;

    // 1. Clear all localStorage data and re-initialize with defaults
    StorageManager.clearAll();

    // 2. Update in-memory state
    highScore = StorageManager.getHighScore(); // Now 0
    settings = StorageManager.getSettings();   // Defaults
    applySettings();

    // 3. Refresh HUD and overlays
    renderScore();
    if (bestScoreEl) bestScoreEl.textContent = highScore;
    if (highScoreBannerEl) highScoreBannerEl.classList.add('hidden');

    // 4. Show toast notification
    showToast('Data cleared! ✓', 2000);
  }

  // --- Event Listeners ---
  function resetInputKeys() {
    keysHeld.left = false;
    keysHeld.right = false;
  }

  function handleKeyDown(e) {
    if (e.code === 'ArrowLeft' || e.key === 'ArrowLeft' || e.code === 'KeyA' || e.key === 'a' || e.key === 'A') {
      if (gameState === 'RUNNING') {
        keysHeld.left = true;
      }
      e.preventDefault();
    } else if (e.code === 'ArrowRight' || e.key === 'ArrowRight' || e.code === 'KeyD' || e.key === 'd' || e.key === 'D') {
      if (gameState === 'RUNNING') {
        keysHeld.right = true;
      }
      e.preventDefault();
    } else if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
    } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape' || e.code === 'Escape') {
      e.preventDefault();
      // Toggle pause if active, or close settings if modal is open
      if (!overlaySettingsEl.classList.contains('hidden')) {
        closeSettings();
      } else {
        togglePause();
      }
    }
  }

  function handleKeyUp(e) {
    if (e.code === 'ArrowLeft' || e.key === 'ArrowLeft' || e.code === 'KeyA' || e.key === 'a' || e.key === 'A') {
      keysHeld.left = false;
    } else if (e.code === 'ArrowRight' || e.key === 'ArrowRight' || e.code === 'KeyD' || e.key === 'd' || e.key === 'D') {
      keysHeld.right = false;
    }
  }

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);

  // Auto-pause and reset keys when window loses focus (Plan 5, Edge Cases 1.1 & 1.3)
  window.addEventListener('blur', () => {
    resetInputKeys();
    if (gameState === 'RUNNING') {
      pauseGame();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      resetInputKeys();
      if (gameState === 'RUNNING') {
        pauseGame();
      }
    }
  });

  // Window resize handler: re-clamp basket position to live arena bounds (Plan 5, Bug #4)
  window.addEventListener('resize', () => {
    const currentWidth = getArenaWidth();
    const maxBasketX = Math.max(0, currentWidth - BASKET_WIDTH);
    basketX = Math.max(0, Math.min(maxBasketX, basketX));
    renderBasket();
  });

  // Page lifecycle handling: save high score reliably on exit (Plan 5, Bug #5)
  function saveHighScoreOnExit() {
    if (score > 0 || highScore > 0) {
      StorageManager.setHighScore(Math.max(score, highScore));
    }
  }

  window.addEventListener('beforeunload', saveHighScoreOnExit);
  window.addEventListener('pagehide', saveHighScoreOnExit);

  // Suppress context menu on game arena to prevent interrupting gameplay
  arenaEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  // UI Button Bindings
  btnStartEl.addEventListener('click', startGame);
  btnPauseEl.addEventListener('click', togglePause);
  btnResumeEl.addEventListener('click', resumeGame);
  btnRestartPauseEl.addEventListener('click', startGame);
  btnRestartEl.addEventListener('click', startGame);

  btnSettingsHudEl.addEventListener('click', openSettings);
  if (btnSettingsStartEl) btnSettingsStartEl.addEventListener('click', openSettings);
  if (btnSettingsPauseEl) btnSettingsPauseEl.addEventListener('click', openSettings);
  if (btnSettingsGameOverEl) btnSettingsGameOverEl.addEventListener('click', openSettings);
  btnCloseSettingsEl.addEventListener('click', closeSettings);
  btnResetDataEl.addEventListener('click', onResetDataClicked);

  // Settings inputs bindings
  if (settingSoundEl) {
    settingSoundEl.addEventListener('change', (e) => {
      initAudio();
      onSettingChanged('soundEnabled', e.target.checked);
    });
  }

  if (settingMusicEl) {
    settingMusicEl.addEventListener('change', (e) => {
      initAudio();
      onSettingChanged('musicEnabled', e.target.checked);
    });
  }

  if (settingVolumeEl) {
    settingVolumeEl.addEventListener('input', (e) => {
      initAudio();
      const vol = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) / 100;
      if (volumeDisplayEl) volumeDisplayEl.textContent = `${Math.round(vol * 100)}%`;
      onSettingChanged('volume', vol);
    });
  }

  // --- Initializer (Plan 4, Section 5.2) ---
  function initializeGame() {
    StorageManager.init();
    highScore = StorageManager.getHighScore();
    settings = StorageManager.getSettings();
    applySettings();
    renderLives();
    renderScore();
    const currentWidth = getArenaWidth();
    basketX = Math.max(0, (currentWidth - BASKET_WIDTH) / 2);
    renderBasket();
  }

  initializeGame();

  // Expose test interface on window for programmatic verification
  window.__CATCH_GAME_TEST__ = {
    StorageManager,
    getArenaWidth,
    checkCollision,
    getState: () => ({
      gameState,
      score,
      lives,
      highScore,
      settings: { ...settings },
      basketX,
      activeItemsCount: activeItems.length,
      activeParticlesCount: activeParticles.length,
      elapsedTime,
      totalPausedTime,
      audioCtxState: audioCtx ? audioCtx.state : null
    }),
    startGame,
    pauseGame,
    resumeGame,
    togglePause,
    triggerGameOver,
    openSettings,
    closeSettings,
    onResetDataClicked,
    initAudio,
    playChimeSound,
    playBombSound,
    createSparkleBurst,
    createScorePopup,
    triggerBasketCatchFeedback,
    setKeys: (left, right) => {
      keysHeld.left = left;
      keysHeld.right = right;
    },
    resetInputKeys,
    spawnItem,
    stepManual: (dtMs) => {
      const prevTimestamp = performance.now();
      lastTimestamp = prevTimestamp;
      gameLoop(prevTimestamp + dtMs);
    },
    getActiveItems: () => activeItems,
    getActiveParticles: () => activeParticles,
    setBasketX: (x) => {
      basketX = x;
      renderBasket();
    },
    setScore: (s) => {
      score = s;
      if (score > highScore) {
        highScore = score;
        StorageManager.setHighScore(highScore);
      }
      renderScore();
    },
    setLives: (l) => {
      lives = l;
      renderLives();
    }
  };
})();
