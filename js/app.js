/**
 * TRENFASE — Main Application v2
 * Orchestrates all modules with per-station FX controls,
 * per-train rhythmic sound, slower speed, and rounded-rect layout
 */

import { STATIONS } from './stations.js';
import { AudioEngine } from './audio-engine.js';
import { TrainManager } from './train.js';
import { Ring } from './ring.js';
import { ColorBackground } from './color-bg.js';
import { TrimEditor } from './trim-editor.js';

class App {
  constructor() {
    this.audio = new AudioEngine();
    this.trains = new TrainManager();
    this.ring = null;
    this.bg = null;
    this.trimEditor = null;
    this.trimEditor = null;
    this.stations = []; // Now set based on mode
    this.mode = 'yamanote'; // 'yamanote' | 'creator'
    this.running = false;
    
    // Pixel-SimCity Phase 2
    this.cityWorker = null;
    this.cityBuffer = null;
    this.cityPixelsRaw = null; // Float32Array to read from
    
    this.lastTime = 0;
    this.selectedStation = null;
    this.selectedTrain = null;
    this.currentPanelView = null;
    this.menuTab = 'settings';
    this.speedScale = 0.005;
    this.defaultUiSpeed = 0.25;
    this.maxUiSpeed = 10.0;
    this.speedSliderMin = 1;
    this.speedSliderMax = Math.round(this.maxUiSpeed * 100);
    this.viewportSize = null;

    this.creation = {
      enabled: false,
      tool: 'select',
      entities: [],
      nextId: 1,
      selectedId: null,
      performanceMode: 'normal',
      undoStack: [],
      redoStack: [],
      isPointerDown: false,
      dragMode: null,
      dragEntityId: null,
      dragStart: null,
      pointerStart: null,
      draftSegment: null,
      dragUndoPushed: false,
      dragMoved: false,
      uiRefreshMs: 0,
      maxRotatingRecommended: 8
    };
    
    this._onTrainClack = this._onTrainClack.bind(this);
    this._onCreationPointerDown = this._onCreationPointerDown.bind(this);
    this._onCreationPointerMove = this._onCreationPointerMove.bind(this);
    this._onCreationPointerUp = this._onCreationPointerUp.bind(this);
  }

  _onTrainClack(train) {
    this._normalizeTrainSoundConfig(train);
    if (!train || !train.soundEnabled) return;

    const baseVol = train.soundVolume != null ? train.soundVolume : 0.08;
    const basePitch = ((train.soundFrequency != null ? train.soundFrequency : 55) / 55);
    const tone = train.soundTone != null ? train.soundTone : 0.5;

    // Slight randomization for organic feel
    const randPitch = basePitch * (0.95 + Math.random() * 0.1);
    const randVol = baseVol * (0.8 + Math.random() * 0.4);

    this.audio.playTrainClack(randVol, randPitch, { tone });
  }

  async init() {
    const loadingBar = document.getElementById('loading-bar');
    const loadingBarContainer = document.getElementById('loading-bar-container');
    const modeSelection = document.getElementById('mode-selection');
    const btnYamanote = document.getElementById('btn-mode-yamanote');
    const btnCreator = document.getElementById('btn-mode-creator');

    // First load audio context
    this.audio.init();
    loadingBar.style.width = '20%';

    // Instead of loading all stations right away, we give the user the choice
    loadingBar.style.width = '100%';
    setTimeout(() => {
      loadingBarContainer.style.display = 'none';
      modeSelection.style.display = 'flex';
    }, 500);

    btnYamanote.addEventListener('click', async () => {
      modeSelection.style.display = 'none';
      loadingBarContainer.style.display = 'block';
      this.mode = 'yamanote';
      this.stations = STATIONS;
      
      loadingBar.style.width = '50%';
      await this.audio.loadAll(this.stations);
      loadingBar.style.width = '100%';
      this._start();
    });

    btnCreator.addEventListener('click', () => {
      this.mode = 'creator';
      this.stations = []; // Empty canvas
      this._start();
    });
  }

  _start() {
    this.audio.resume();

    const loading = document.getElementById('loading-screen');
    const app = document.getElementById('app');
    loading.classList.add('hidden');
    setTimeout(() => { loading.style.display = 'none'; }, 600);
    app.style.display = '';

    // Init background
    this.bg = new ColorBackground('bg-canvas');
    this.viewportSize = this._getCanvasViewportSize();

    // Init ring (now rounded rectangle)
    this.ring = new Ring('ring-container', this.stations, 
      (station) => this._onStationClick(station),
      (train) => this._onTrainClick(train)
    );
    this.ring.render();

    // Init trim editor
    this.trimEditor = new TrimEditor('trim-editor', this.audio);

    // Only add a default train if in Yamanote mode
    if (this.mode === 'yamanote') {
      this.trains.addTrain(this._uiSpeedToActual(this.defaultUiSpeed), 1, this._onTrainClack);
    }
    
    this._renderTrainControls();

    this._setupControls();
    this._setupCreationCanvasEvents();
    this._renderCreationUI();

    if (this.mode === 'creator') {
      this._initCityWorker();
      
      // Auto-open Creation tools to guide the user
      this._openSettingsPanel();
      this._setMenuTab('creation');
    }

    this.running = true;
    this.lastTime = performance.now();
    this._loop();

    // Handle resize
    window.addEventListener('resize', () => {
      if (this.ring) {
        this.ring.render();
        this.ring.updateTrains(this.trains.getAll());
      }
      if (this.bg) this.bg.resize();
      this._rescaleCanvasEntitiesToViewport();
    });
  }

  _loop() {
    if (!this.running) return;

    const now = performance.now();
    const deltaTime = now - this.lastTime;
    this.lastTime = now;

    this.trains.updateAll(deltaTime);
    this._updateCreation(deltaTime);

    for (const train of this.trains.getAll()) {
      const trainT = train.angle / 360;
      const trainPos = this.ring._getPointAtT(trainT);

      for (const station of this.stations) {
        const shouldReact = station.active || station.ghost;
        if (!shouldReact) continue;
        if (!train.shouldTrigger(station, trainPos)) continue;

        // Ghost stations react visually but stay muted.
        if (station.active && !station.ghost) {
          const reverse = train.direction === -1;
          this.audio.play(station, reverse);
        }
        this.ring.flashStation(station.id);

        // Get screen position for glow
        const pos = this.ring.getStationScreenPosition(station);
        this.bg.addGlowAt(pos.x, pos.y, station.color);
      }
    }

    this.ring.updateTrains(this.trains.getAll());

    // Update continuous drones
    for (const train of this.trains.getAll()) {
      this.audio.updateTrainDrone(train);
    }

    const analyserData = this.audio.getAnalyserData();
    const trainLights = this.trains.getAll().map(train => {
      const t = train.angle / 360;
      const pos = this.ring._getPointAtT(t);
      const trackAngle = this.ring._getAngleAtT(t);
      // If moving CCW, flip the angle 180deg
      const forwardAngle = train.direction === 1 ? trackAngle : trackAngle + Math.PI;

      return {
        x: pos.x,
        y: pos.y,
        angle: forwardAngle,
        type: train.lightType,
        colorRGB: train.colorRGB,
        intensity: train.lightIntensity,
        radius: train.lightRadius
      };
    });
    const worldData = this._buildCreationRenderData();
    
    // Pass everything to the background renderer, including the Float32Array
    this.bg.render(analyserData, trainLights, worldData, this.cityPixelsRaw);

    // If we have a worker, ask it to compute the next frame into the buffer
    if (this.cityWorker && this.cityBuffer) {
      this.cityWorker.postMessage({
        type: 'FRAME_REQUEST',
        buffer: this.cityBuffer
      }, [this.cityBuffer]); // Transfer ownership
      this.cityBuffer = null; // We lost ownership until it comes back
    }

    requestAnimationFrame(() => this._loop());
  }

  _initCityWorker() {
    this.cityWorker = new Worker('js/city-engine.worker.js');
    
    // Create a Shared Memory Buffer (or just Transferable ArrayBuffer)
    // 10,000 pixels * 4 floats * 4 bytes = 160,000 bytes.
    this.cityBuffer = new ArrayBuffer(10000 * 4 * 4);
    
    this.cityWorker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'FRAME_DATA') {
        // Worker finished calculation and transferred buffer back
        this.cityBuffer = msg.buffer;
        this.cityPixelsRaw = new Float32Array(this.cityBuffer);
      }
    };

    this.cityWorker.postMessage({ type: 'INIT' });
    this.cityWorker.postMessage({ type: 'START' });
    
    // Sync all existing stations immediately
    for (const station of this.stations) {
      this._syncStationToWorker(station);
    }
  }

  _syncStationToWorker(station) {
    if (!this.cityWorker || !station) return;
    this.cityWorker.postMessage({
      type: 'UPDATE_STATION',
      station: {
        id: station.id,
        x: station.x,
        y: station.y,
        active: station.active
      }
    });
  }

  _onStationClick(station) {
    this.selectedStation = station;
    this.selectedTrain = null;
    this._openStationPanel(station);
  }

  _onTrainClick(train) {
    this.selectedTrain = train;
    this.selectedStation = null;
    this._openTrainPanel(train);
  }

  _openStationPanel(station) {
    const panel = document.getElementById('station-panel');
    panel.classList.add('open');
    this.currentPanelView = 'station';

    document.getElementById('panel-view-station').style.display = 'block';
    document.getElementById('panel-view-train').style.display = 'none';
    document.getElementById('panel-view-settings').style.display = 'none';

    document.getElementById('panel-station-jp').textContent = station.nameJp;
    document.getElementById('panel-station-en').textContent = station.nameEn;
    document.getElementById('panel-station-code').textContent = station.code;

    this._updateStateButtons(station);
    this.trimEditor.open(station);

    // Update sliders
    document.getElementById('station-volume').value = station.volume * 100;
    document.getElementById('vol-value').textContent = station.volume.toFixed(1);
    document.getElementById('station-pitch').value = station.pitch * 100;
    document.getElementById('pitch-value').textContent = station.pitch.toFixed(1);

    // Update FX sliders
    const fx = station.fx;
    document.getElementById('fx-delay-time').value = fx.delayTime * 100;
    document.getElementById('fx-delay-time-val').textContent = fx.delayTime.toFixed(2) + 's';
    document.getElementById('fx-delay-feedback').value = fx.delayFeedback * 100;
    document.getElementById('fx-delay-feedback-val').textContent = fx.delayFeedback.toFixed(1);
    document.getElementById('fx-delay-wet').value = fx.delayWet * 100;
    document.getElementById('fx-delay-wet-val').textContent = fx.delayWet.toFixed(1);
    document.getElementById('fx-filter-freq').value = this._freqToSlider(fx.filterFreq);
    document.getElementById('fx-filter-freq-val').textContent = this._formatFreq(fx.filterFreq);
    document.getElementById('fx-filter-q').value = fx.filterQ * 10;
    document.getElementById('fx-filter-q-val').textContent = fx.filterQ.toFixed(1);
  }

  _openTrainPanel(train) {
    this._normalizeTrainSoundConfig(train);
    const panel = document.getElementById('station-panel');
    panel.classList.add('open');
    this.currentPanelView = 'train';

    document.getElementById('panel-view-station').style.display = 'none';
    document.getElementById('panel-view-train').style.display = 'block';
    document.getElementById('panel-view-settings').style.display = 'none';

    document.getElementById('panel-station-jp').textContent = '🚋 TREN ' + train.id;
    document.getElementById('panel-station-en').textContent = 'Configuration';
    document.getElementById('panel-station-code').textContent = '';

    const btnDir = document.getElementById('train-edit-dir');
    btnDir.textContent = train.direction === 1 ? 'Forward →' : '← Reverse';
    
    // Scale 1.0 UI = speedScale actual speed
    const uiSpeed = this._actualSpeedToUi(train.speed);
    document.getElementById('train-edit-spd').value = this._uiSpeedToSlider(uiSpeed);
    document.getElementById('train-edit-spd-val').textContent = uiSpeed.toFixed(2);
    
    document.getElementById('train-edit-col').value = train.color;
    
    document.getElementById('train-edit-int').value = train.lightIntensity * 100;
    document.getElementById('train-edit-int-val').textContent = train.lightIntensity.toFixed(2);
    
    document.getElementById('train-edit-rad').value = train.lightRadius;
    document.getElementById('train-edit-rad-val').textContent = train.lightRadius.toFixed(0);
    
    document.getElementById('train-edit-light-type').value = train.lightType || 'forward';
    document.getElementById('train-edit-snd-vol').value = Math.round(train.soundVolume * 100);
    document.getElementById('train-edit-snd-vol-val').textContent = train.soundVolume.toFixed(2);
    document.getElementById('train-edit-snd-freq').value = Math.round(train.soundFrequency);
    document.getElementById('train-edit-snd-freq-val').textContent = `${Math.round(train.soundFrequency)}Hz`;
    document.getElementById('train-edit-snd-rate').value = Math.round(train.soundRate * 100);
    document.getElementById('train-edit-snd-rate-val').textContent = `${train.soundRate.toFixed(2)}x`;
    document.getElementById('train-edit-snd-tone').value = Math.round(train.soundTone * 100);
    document.getElementById('train-edit-snd-tone-val').textContent = train.soundTone.toFixed(2);
    this._updateTrainSoundButton(train);
  }

  _openSettingsPanel() {
    this.selectedStation = null;
    this.selectedTrain = null;
    this.trimEditor.close();
    
    const panel = document.getElementById('station-panel');
    panel.classList.add('open');
    this.currentPanelView = 'settings';
    
    document.getElementById('panel-view-station').style.display = 'none';
    document.getElementById('panel-view-train').style.display = 'none';
    document.getElementById('panel-view-settings').style.display = 'block';
    
    document.getElementById('panel-station-jp').textContent = '☰ MENU';
    document.getElementById('panel-station-en').textContent = 'Control, creación y contexto';
    document.getElementById('panel-station-code').textContent = '';
    this._setMenuTab(this.menuTab);
  }

  _closePanel() {
    const panel = document.getElementById('station-panel');
    panel.classList.remove('open');
    this.currentPanelView = null;
    this.trimEditor.close();
    this.selectedStation = null;
    this.selectedTrain = null;
  }

  _updateStateButtons(station) {
    document.getElementById('btn-state-active').classList.toggle('btn--active', station.active && !station.ghost);
    document.getElementById('btn-state-inactive').classList.toggle('btn--active', !station.active && !station.ghost);
    document.getElementById('btn-state-ghost').classList.toggle('btn--active', station.ghost);
  }

  _updateStationCount() {
    const active = this.stations.filter(s => s.active || s.ghost).length;
    document.getElementById('station-count').textContent = `${active}/${this.stations.length}`;
  }

  // Frequency slider: logarithmic mapping 20Hz-20kHz
  _sliderToFreq(val) {
    return 20 * Math.pow(1000, val / 100);
  }
  _freqToSlider(freq) {
    return Math.round(100 * Math.log(freq / 20) / Math.log(1000));
  }
  _formatFreq(freq) {
    return freq >= 1000 ? (freq / 1000).toFixed(1) + 'k' : Math.round(freq) + '';
  }

  _uiSpeedToActual(uiSpeed) {
    return uiSpeed * this.speedScale;
  }

  _actualSpeedToUi(actualSpeed) {
    return actualSpeed / this.speedScale;
  }

  _sliderToUiSpeed(sliderValue) {
    return sliderValue / 100;
  }

  _uiSpeedToSlider(uiSpeed) {
    return Math.round(uiSpeed * 100);
  }

  _getCanvasViewportSize() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return null;
    const w = canvas.offsetWidth || canvas.clientWidth || 0;
    const h = canvas.offsetHeight || canvas.clientHeight || 0;
    if (w <= 0 || h <= 0) return null;
    return { w, h };
  }

  _rescaleCanvasEntitiesToViewport() {
    const next = this._getCanvasViewportSize();
    if (!next) return;
    const prev = this.viewportSize;
    this.viewportSize = next;
    if (!prev) return;
    if (Math.abs(prev.w - next.w) < 1 && Math.abs(prev.h - next.h) < 1) return;
    if (prev.w <= 0 || prev.h <= 0) return;

    const sx = next.w / prev.w;
    const sy = next.h / prev.h;
    if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx <= 0 || sy <= 0) return;
    const s = (sx + sy) * 0.5;

    for (const entity of this.creation.entities) {
      if (entity.type === 'line' && entity.line) {
        entity.line.x1 *= sx;
        entity.line.y1 *= sy;
        entity.line.x2 *= sx;
        entity.line.y2 *= sy;
        continue;
      }

      if (entity.type === 'rotating_line' && entity.transform && entity.rotating) {
        entity.transform.x *= sx;
        entity.transform.y *= sy;
        entity.rotating.length *= s;
        continue;
      }

      if (entity.type === 'walker' && entity.transform && entity.walker) {
        entity.transform.x *= sx;
        entity.transform.y *= sy;
        if (Array.isArray(entity.walker.waypoints)) {
          entity.walker.waypoints = entity.walker.waypoints.map((wp) => ({ x: wp.x * sx, y: wp.y * sy }));
        }
        entity.walker.diameter *= s;
        entity.walker.speed *= s;
        entity.walker.boardRadius *= s;
        entity.walker.stationRadius *= s;
        if (entity.light) entity.light.radius *= s;
      }
    }

    if (this.creation.draftSegment) {
      this.creation.draftSegment.x1 *= sx;
      this.creation.draftSegment.y1 *= sy;
      this.creation.draftSegment.x2 *= sx;
      this.creation.draftSegment.y2 *= sy;
    }

    if (this.bg && Array.isArray(this.bg.walls)) {
      this.bg.walls = this.bg.walls.map((wall) => ({
        x1: wall.x1 * sx,
        y1: wall.y1 * sy,
        x2: wall.x2 * sx,
        y2: wall.y2 * sy
      }));
    }

    if (this.bg && this.bg.currentWall) {
      this.bg.currentWall = {
        x1: this.bg.currentWall.x1 * sx,
        y1: this.bg.currentWall.y1 * sy,
        x2: this.bg.currentWall.x2 * sx,
        y2: this.bg.currentWall.y2 * sy
      };
    }

    this._normalizeCreationState();
    this._renderCreationUI();
  }

  _addTrain(uiSpeed = this.defaultUiSpeed) {
    const minUiSpeed = this.speedSliderMin / 100;
    const clampedUiSpeed = Math.max(minUiSpeed, Math.min(this.maxUiSpeed, uiSpeed));
    const actualSpeed = this._uiSpeedToActual(clampedUiSpeed);
    const train = this.trains.addTrain(actualSpeed, 1, this._onTrainClack);
    if (!train) return null;
    this._renderTrainControls();
    return train;
  }

  _setMenuTab(tab) {
    this.menuTab = tab;
    const settingsBtn = document.getElementById('menu-tab-settings');
    const creationBtn = document.getElementById('menu-tab-creation');
    const aboutBtn = document.getElementById('menu-tab-about');
    const settingsContent = document.getElementById('menu-content-settings');
    const creationContent = document.getElementById('menu-content-creation');
    const aboutContent = document.getElementById('menu-content-about');

    const settingsActive = tab === 'settings';
    const creationActive = tab === 'creation';
    const aboutActive = tab === 'about';

    settingsBtn.classList.toggle('btn--active', settingsActive);
    creationBtn.classList.toggle('btn--active', creationActive);
    aboutBtn.classList.toggle('btn--active', aboutActive);
    settingsContent.style.display = settingsActive ? 'block' : 'none';
    creationContent.style.display = creationActive ? 'block' : 'none';
    aboutContent.style.display = aboutActive ? 'block' : 'none';
  }

  _updateTrainSoundButton(train) {
    const btn = document.getElementById('train-edit-snd-enabled');
    if (!btn || !train) return;
    
    if (train.soundEnabled && train.droneEnabled) {
      btn.textContent = 'Clack + Drone';
      btn.classList.add('btn--active');
    } else if (train.soundEnabled) {
      btn.textContent = 'Clack Only';
      btn.classList.add('btn--active');
    } else if (train.droneEnabled) {
      btn.textContent = 'Drone Only';
      btn.classList.add('btn--active');
    } else {
      btn.textContent = 'Off';
      btn.classList.remove('btn--active');
    }
  }

  _normalizeTrainSoundConfig(train) {
    if (!train) return;
    train.soundVolume = Math.max(0, Math.min(0.3, parseFloat(train.soundVolume != null ? train.soundVolume : 0.08)));
    train.soundFrequency = Math.max(20, Math.min(200, parseFloat(train.soundFrequency != null ? train.soundFrequency : 55)));
    train.soundRate = Math.max(0.1, Math.min(4.0, parseFloat(train.soundRate != null ? train.soundRate : 1.0)));
    train.soundTone = Math.max(0, Math.min(1, parseFloat(train.soundTone != null ? train.soundTone : 0.5)));
    train.soundEnabled = train.soundEnabled !== false;
    train.droneEnabled = !!train.droneEnabled;
  }

  _setupControls() {
    // Header Menu Button
    document.getElementById('btn-controls').addEventListener('click', () => {
      if (this.currentPanelView === 'settings') {
        this._closePanel();
      } else {
        this._openSettingsPanel();
      }
    });

    // Panel close
    document.getElementById('panel-close').addEventListener('click', () => this._closePanel());

    // State buttons
    document.getElementById('btn-state-active').addEventListener('click', () => {
      if (!this.selectedStation) return;
      this.selectedStation.active = true;
      this.selectedStation.ghost = false;
      this.ring.updateStationState(this.selectedStation);
      this._updateStateButtons(this.selectedStation);
      this._updateStationCount();
    });

    document.getElementById('btn-state-inactive').addEventListener('click', () => {
      if (!this.selectedStation) return;
      this.selectedStation.active = false;
      this.selectedStation.ghost = false;
      this.ring.updateStationState(this.selectedStation);
      this._updateStateButtons(this.selectedStation);
      this._updateStationCount();
    });

    document.getElementById('btn-state-ghost').addEventListener('click', () => {
      if (!this.selectedStation) return;
      this.selectedStation.active = false;
      this.selectedStation.ghost = true;
      this.ring.updateStationState(this.selectedStation);
      this._updateStateButtons(this.selectedStation);
      this._updateStationCount();
    });

    // Volume
    document.getElementById('station-volume').addEventListener('input', (e) => {
      if (!this.selectedStation) return;
      this.selectedStation.volume = e.target.value / 100;
      document.getElementById('vol-value').textContent = this.selectedStation.volume.toFixed(1);
    });

    // Pitch
    document.getElementById('station-pitch').addEventListener('input', (e) => {
      if (!this.selectedStation) return;
      this.selectedStation.pitch = e.target.value / 100;
      document.getElementById('pitch-value').textContent = this.selectedStation.pitch.toFixed(1);
    });

    // === FX Controls ===
    document.getElementById('fx-delay-time').addEventListener('input', (e) => {
      if (!this.selectedStation) return;
      this.selectedStation.fx.delayTime = e.target.value / 100;
      document.getElementById('fx-delay-time-val').textContent = this.selectedStation.fx.delayTime.toFixed(2) + 's';
    });

    document.getElementById('fx-delay-feedback').addEventListener('input', (e) => {
      if (!this.selectedStation) return;
      this.selectedStation.fx.delayFeedback = e.target.value / 100;
      document.getElementById('fx-delay-feedback-val').textContent = this.selectedStation.fx.delayFeedback.toFixed(1);
    });

    document.getElementById('fx-delay-wet').addEventListener('input', (e) => {
      if (!this.selectedStation) return;
      this.selectedStation.fx.delayWet = e.target.value / 100;
      document.getElementById('fx-delay-wet-val').textContent = this.selectedStation.fx.delayWet.toFixed(1);
    });

    document.getElementById('fx-filter-freq').addEventListener('input', (e) => {
      if (!this.selectedStation) return;
      this.selectedStation.fx.filterFreq = this._sliderToFreq(e.target.value);
      document.getElementById('fx-filter-freq-val').textContent = this._formatFreq(this.selectedStation.fx.filterFreq);
    });

    document.getElementById('fx-filter-q').addEventListener('input', (e) => {
      if (!this.selectedStation) return;
      this.selectedStation.fx.filterQ = e.target.value / 10;
      document.getElementById('fx-filter-q-val').textContent = this.selectedStation.fx.filterQ.toFixed(1);
    });

    // === Custom Audio (Pixel SimCity Expansion) ===
    const btnUpload = document.getElementById('btn-audio-upload');
    const uploadInput = document.getElementById('station-audio-upload');
    const btnRecord = document.getElementById('btn-audio-record');
    const customAudioStatus = document.getElementById('custom-audio-status');

    btnUpload.addEventListener('click', () => {
      if (!this.selectedStation) return;
      uploadInput.click();
    });

    uploadInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file || !this.selectedStation) return;
      
      try {
        customAudioStatus.textContent = 'Decodificando audio...';
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await this.audio.ctx.decodeAudioData(arrayBuffer);
        
        // Store buffer in AudioEngine against this specific station ID
        this.audio.buffers[this.selectedStation.id] = audioBuffer;
        
        // Ensure the station points to its own ID instead of the default name mapping
        this.selectedStation.customAudioId = this.selectedStation.id;
        
        customAudioStatus.textContent = 'Audio cargado ✓';
        customAudioStatus.style.color = 'var(--color-success)';
        setTimeout(() => customAudioStatus.textContent = '', 3000);
      } catch (err) {
        console.error("Error decoding custom audio", err);
        customAudioStatus.textContent = 'Error al cargar';
        customAudioStatus.style.color = '#ff4444';
      }
      uploadInput.value = ''; // Reset
    });

    // Recording logic state variables
    let mediaRecorder = null;
    let audioChunks = [];

    btnRecord.addEventListener('click', async () => {
      if (!this.selectedStation) return;

      if (mediaRecorder && mediaRecorder.state === 'recording') {
        // Stop recording
        mediaRecorder.stop();
        btnRecord.textContent = '🎤 Record Mic';
        btnRecord.style.background = 'var(--color-bg)';
        btnRecord.style.color = '#ff4444';
        customAudioStatus.textContent = 'Procesando...';
      } else {
        // Start recording
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaRecorder = new MediaRecorder(stream);
          audioChunks = [];

          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
          };

          mediaRecorder.onstop = async () => {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            stream.getTracks().forEach(t => t.stop()); // Stop microphone access
            
            try {
              const arrayBuffer = await blob.arrayBuffer();
              const audioBuffer = await this.audio.ctx.decodeAudioData(arrayBuffer);
              
              this.audio.buffers[this.selectedStation.id] = audioBuffer;
              this.selectedStation.customAudioId = this.selectedStation.id;
              
              customAudioStatus.textContent = 'Audio grabado ✓';
              customAudioStatus.style.color = 'var(--color-success)';
              setTimeout(() => customAudioStatus.textContent = '', 3000);
            } catch (err) {
              console.error('Error decoding recording', err);
              customAudioStatus.textContent = 'Error al grabar';
              customAudioStatus.style.color = '#ff4444';
            }
          };

          mediaRecorder.start();
          btnRecord.textContent = '⏹ Stop';
          btnRecord.style.background = '#ff4444';
          btnRecord.style.color = 'var(--color-bg)';
          customAudioStatus.textContent = 'Grabando...';
          customAudioStatus.style.color = '#ff4444';
        } catch (err) {
          console.error('Microphone access denied', err);
          customAudioStatus.textContent = 'Mic denied';
          customAudioStatus.style.color = '#ff4444';
        }
      }
    });

    // === Train Edit Panel Controls ===
    document.getElementById('train-edit-dir').addEventListener('click', (e) => {
      if (!this.selectedTrain) return;
      this.selectedTrain.direction *= -1;
      this.selectedTrain.triggeredStations.clear();
      e.target.textContent = this.selectedTrain.direction === 1 ? 'Forward →' : '← Reverse';
    });
    
    document.getElementById('train-edit-spd').addEventListener('input', (e) => {
      if (!this.selectedTrain) return;
      const uiSpeed = this._sliderToUiSpeed(parseFloat(e.target.value));
      this.selectedTrain.speed = this._uiSpeedToActual(uiSpeed);
      document.getElementById('train-edit-spd-val').textContent = uiSpeed.toFixed(2);
    });
    
    document.getElementById('train-edit-col').addEventListener('input', (e) => {
      if (!this.selectedTrain) return;
      this.selectedTrain.color = e.target.value;
      this.selectedTrain.colorRGB = this.selectedTrain._hexToRgb(e.target.value);
    });
    
    document.getElementById('train-edit-int').addEventListener('input', (e) => {
      if (!this.selectedTrain) return;
      this.selectedTrain.lightIntensity = e.target.value / 100;
      document.getElementById('train-edit-int-val').textContent = this.selectedTrain.lightIntensity.toFixed(2);
    });
    
    document.getElementById('train-edit-rad').addEventListener('input', (e) => {
      if (!this.selectedTrain) return;
      this.selectedTrain.lightRadius = parseFloat(e.target.value);
      document.getElementById('train-edit-rad-val').textContent = this.selectedTrain.lightRadius.toFixed(0);
    });

    document.getElementById('train-edit-light-type').addEventListener('change', (e) => {
      if (!this.selectedTrain) return;
      this.selectedTrain.lightType = e.target.value;
    });

    document.getElementById('train-edit-snd-enabled').addEventListener('click', () => {
      if (!this.selectedTrain) return;
      this._normalizeTrainSoundConfig(this.selectedTrain);
      // We'll toggle between Clack Only -> Drone Only -> Both -> Off using modulo state
      let state = 0;
      if (this.selectedTrain.soundEnabled && !this.selectedTrain.droneEnabled) state = 1;
      else if (!this.selectedTrain.soundEnabled && this.selectedTrain.droneEnabled) state = 2;
      else if (this.selectedTrain.soundEnabled && this.selectedTrain.droneEnabled) state = 3;

      state = (state + 1) % 4;
      
      this.selectedTrain.soundEnabled = (state === 1 || state === 3);
      this.selectedTrain.droneEnabled = (state === 2 || state === 3);
      
      if (!this.selectedTrain.droneEnabled) {
        this.audio.removeTrainDrone(this.selectedTrain.id);
      }
      
      this._updateTrainSoundButton(this.selectedTrain);
      this._renderTrainControls();
    });

    document.getElementById('train-edit-snd-vol').addEventListener('input', (e) => {
      if (!this.selectedTrain) return;
      this._normalizeTrainSoundConfig(this.selectedTrain);
      this.selectedTrain.soundVolume = Math.max(0, Math.min(0.3, e.target.value / 100));
      document.getElementById('train-edit-snd-vol-val').textContent = this.selectedTrain.soundVolume.toFixed(2);
      this._renderTrainControls();
    });

    document.getElementById('train-edit-snd-freq').addEventListener('input', (e) => {
      if (!this.selectedTrain) return;
      this._normalizeTrainSoundConfig(this.selectedTrain);
      this.selectedTrain.soundFrequency = Math.max(20, Math.min(200, parseFloat(e.target.value)));
      document.getElementById('train-edit-snd-freq-val').textContent = `${Math.round(this.selectedTrain.soundFrequency)}Hz`;
      this._renderTrainControls();
    });

    document.getElementById('train-edit-snd-rate').addEventListener('input', (e) => {
      if (!this.selectedTrain) return;
      this._normalizeTrainSoundConfig(this.selectedTrain);
      this.selectedTrain.soundRate = Math.max(0.1, Math.min(4.0, parseFloat(e.target.value) / 100));
      document.getElementById('train-edit-snd-rate-val').textContent = `${this.selectedTrain.soundRate.toFixed(2)}x`;
      this._renderTrainControls();
    });

    document.getElementById('train-edit-snd-tone').addEventListener('input', (e) => {
      if (!this.selectedTrain) return;
      this._normalizeTrainSoundConfig(this.selectedTrain);
      this.selectedTrain.soundTone = Math.max(0, Math.min(1, parseFloat(e.target.value) / 100));
      document.getElementById('train-edit-snd-tone-val').textContent = this.selectedTrain.soundTone.toFixed(2);
      this._renderTrainControls();
    });
    
    document.getElementById('train-edit-remove').addEventListener('click', () => {
      if (!this.selectedTrain) return;
      this.audio.removeTrainDrone(this.selectedTrain.id);
      this.trains.removeTrain(this.selectedTrain.id);
      this._renderTrainControls();
      this._closePanel();
    });

    // === Master controls ===
    const masterVol = document.getElementById('master-vol');
    const masterVolValue = document.getElementById('master-vol-value');
    const updateMasterVol = (sliderValue) => {
      const vol = parseFloat(sliderValue) / 100;
      this.audio.setMasterVolume(vol);
      if (masterVolValue) masterVolValue.textContent = vol.toFixed(2);
    };
    masterVol.addEventListener('input', (e) => updateMasterVol(e.target.value));
    updateMasterVol(masterVol.value);

    document.getElementById('btn-add-train').addEventListener('click', () => {
      this._addTrain(this.defaultUiSpeed);
    });

    const btnFullscreen = document.getElementById('btn-fullscreen');
    const syncFullscreenButton = () => {
      const active = !!document.fullscreenElement;
      btnFullscreen.textContent = active ? '🗗 Salir Fullscreen' : '⛶ Fullscreen';
      btnFullscreen.classList.toggle('btn--active', active);
      document.body.classList.toggle('is-fullscreen', active);
    };
    btnFullscreen.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else {
          await document.documentElement.requestFullscreen();
        }
      } catch (err) {
        console.warn('Fullscreen unavailable', err);
      }
      syncFullscreenButton();
    });
    document.addEventListener('fullscreenchange', syncFullscreenButton);
    document.addEventListener('fullscreenchange', () => this._rescaleCanvasEntitiesToViewport());
    syncFullscreenButton();

    document.getElementById('train-edit-spd').max = this.speedSliderMax;

    // Menu tabs
    document.getElementById('menu-tab-settings').addEventListener('click', () => this._setMenuTab('settings'));
    document.getElementById('menu-tab-creation').addEventListener('click', () => this._setMenuTab('creation'));
    document.getElementById('menu-tab-about').addEventListener('click', () => this._setMenuTab('about'));

    // Creation tab controls
    document.getElementById('creation-enable').addEventListener('click', () => {
      const next = !this.creation.enabled;
      this._setCreationEnabled(next);
      if (next) this._setMenuTab('creation');
    });

    document.querySelectorAll('.creation-tool').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tool = btn.getAttribute('data-tool');
        this._setCreationTool(tool);
      });
    });

    document.getElementById('creation-undo').addEventListener('click', () => this._undoCreation());
    document.getElementById('creation-redo').addEventListener('click', () => this._redoCreation());
    document.getElementById('creation-delete-selected').addEventListener('click', () => this._deleteSelectedCreationEntity());
    document.getElementById('creation-clear-scene').addEventListener('click', () => this._clearCreationScene());

    document.getElementById('creation-performance').addEventListener('change', (e) => {
      this.creation.performanceMode = e.target.value;
      this._renderCreationWarning();
    });

    document.getElementById('creation-export').addEventListener('click', () => this._exportCreationScene());
    document.getElementById('creation-import').addEventListener('click', () => this._importCreationScene());
    document.getElementById('creation-save-local').addEventListener('click', () => this._saveCreationSceneLocal());
    document.getElementById('creation-load-local').addEventListener('click', () => this._loadCreationSceneLocal());

    document.getElementById('btn-clear-walls').addEventListener('click', () => {
      this.bg.clearWalls();
    });

    // Click outside panel to close
    document.getElementById('ring-container').addEventListener('click', (e) => {
      if (e.target.id === 'ring-container' || e.target.id === 'ring-svg') {
        this._closePanel();
      }
    });

    // Render initial train controls
    this._renderTrainControls();
  }

  _setupCreationCanvasEvents() {
    const canvas = document.getElementById('bg-canvas');
    canvas.addEventListener('pointerdown', this._onCreationPointerDown);
    window.addEventListener('pointermove', this._onCreationPointerMove);
    window.addEventListener('pointerup', this._onCreationPointerUp);
  }

  _setCreationEnabled(enabled) {
    const wasEnabled = this.creation.enabled;
    this.creation.enabled = enabled;
    if (!enabled && wasEnabled) {
      this._cancelCreationInteraction();
    }
    if (this.bg && typeof this.bg.setWallDrawingEnabled === 'function') {
      this.bg.setWallDrawingEnabled(enabled);
    }
    const btn = document.getElementById('creation-enable');
    const canvas = document.getElementById('bg-canvas');
    btn.textContent = enabled ? 'Disable Creation Mode' : 'Enable Creation Mode';
    btn.classList.toggle('btn--active', enabled);
    canvas.classList.toggle('creation-active', enabled);
  }

  _cancelCreationInteraction() {
    this.creation.isPointerDown = false;
    this.creation.pointerStart = null;
    this.creation.dragStart = null;
    this.creation.dragMode = null;
    this.creation.dragEntityId = null;
    this.creation.draftSegment = null;
    this.creation.dragUndoPushed = false;
    this.creation.dragMoved = false;
  }

  _setCreationTool(tool) {
    const allowed = new Set(['select', 'station', 'line-solid', 'line-dashed', 'rotating-line', 'walker', 'walker-waypoint']);
    this.creation.tool = allowed.has(tool) ? tool : 'select';
    document.querySelectorAll('.creation-tool').forEach((btn) => {
      btn.classList.toggle('btn--active', btn.getAttribute('data-tool') === this.creation.tool);
    });
    document.getElementById('creation-tool-label').textContent = `Tool: ${this.creation.tool}`;
  }

  _renderCreationUI() {
    const perf = document.getElementById('creation-performance');
    if (perf) perf.value = this.creation.performanceMode;
    this._setCreationTool(this.creation.tool);
    this._renderCreationWarning();
    this._renderCreationEntityList();
    this._renderCreationInspector();
    this._setCreationEnabled(this.creation.enabled);
  }

  _renderCreationWarning() {
    const warning = document.getElementById('creation-warning');
    if (!warning) return;
    const rotatingCount = this.creation.entities.filter((e) => e.type === 'rotating_line').length;
    if (rotatingCount > this.creation.maxRotatingRecommended) {
      warning.textContent = `Warning: ${rotatingCount} rotating lines can affect performance.`;
      return;
    }
    warning.textContent = this.creation.performanceMode === 'eco'
      ? 'Eco shadows enabled: lower cost, slightly less precise shadows.'
      : '';
  }

  _renderCreationEntityList() {
    const list = document.getElementById('creation-entity-list');
    if (!list) return;
    this._activeAccordionBodyId = null;
    list.innerHTML = '';

    if (this.creation.entities.length === 0) {
      list.innerHTML = '<div class="creation-inspector__empty">No entities yet. Use tools to create.</div>';
      return;
    }

    this.creation.entities.forEach((entity, index) => {
      const isSelected = entity.id === this.creation.selectedId;
      const accordion = document.createElement('div');
      accordion.className = 'accordion';
      if (isSelected) accordion.classList.add('open');
      
      let meta = '';
      if (entity.type === 'line') meta = entity.line.dashed ? 'dashed' : 'solid';
      if (entity.type === 'rotating_line') meta = `${Math.round(entity.rotating.angularSpeed)} deg/s`;
      if (entity.type === 'walker') meta = `${entity.walker.state} • wp:${entity.walker.waypoints.length}`;

      // Different color representations based on entity type
      let typeColor = '#f5f0e1';
      if (entity.type === 'line') typeColor = entity.line.color;
      else if (entity.type === 'rotating_line') typeColor = entity.rotating.color;
      else if (entity.type === 'walker') typeColor = entity.light.enabled ? entity.light.color : '#aaaaaa';

      accordion.innerHTML = `
        <div class="accordion__header" ${isSelected ? 'style="background:rgba(255,255,255,0.08);"' : ''}>
          <div class="accordion__title">
            <div class="train-item__color" style="background: ${typeColor}"></div>
            <span>${entity.type} #${entity.id}</span>
            <span style="font-size:0.65rem; color:var(--color-text-dim); margin-left: 6px;">${meta}</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <button class="btn btn--small creation-entity-select-btn" data-id="${entity.id}">Sel</button>
            <span class="accordion__icon">▼</span>
          </div>
        </div>
        <div class="accordion__body" id="accordion-body-entity-${entity.id}">
          <!-- Inspector content gets attached here when selected -->
        </div>
      `;

      list.appendChild(accordion);

      const header = accordion.querySelector('.accordion__header');
      const selBtn = accordion.querySelector('.creation-entity-select-btn');

      // Toggling accordion also selects it
      header.addEventListener('click', (e) => {
        if (e.target.closest('.btn')) return; // handled by selBtn
        if (this.creation.selectedId !== entity.id) {
          this._selectCreationEntity(entity.id);
        } else {
          accordion.classList.toggle('open');
        }
      });

      selBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._selectCreationEntity(entity.id);
        accordion.classList.add('open');
      });
      
      // If this is the selected entity, immediately attach the inspector here
      if (isSelected) {
        this._activeAccordionBodyId = `accordion-body-entity-${entity.id}`;
      }
    });
  }

  _renderCreationInspector() {
    // If we're using accordion, the container might be the accordion body
    let container = document.getElementById('creation-inspector');
    
    // Instead of rendering floating inspector, try to render directly inside the active accordion
    if (this._activeAccordionBodyId) {
      const accBody = document.getElementById(this._activeAccordionBodyId);
      if (accBody) container = accBody;
    }

    if (!container) return;
    container.innerHTML = '';

    const entity = this._getSelectedCreationEntity();
    if (!entity) {
      if (container.id === 'creation-inspector') {
        container.innerHTML = '<div class="creation-inspector__empty">Select an entity to inspect and edit.</div>';
      }
      return;
    }

    if (entity.type === 'line') {
      container.innerHTML = `
        <div class="slider-row"><label>Dashed</label><input type="checkbox" id="ins-line-dashed" ${entity.line.dashed ? 'checked' : ''}></div>
        <div class="slider-row"><label>Color</label><input type="color" id="ins-line-color" value="${entity.line.color}" style="flex:1;"></div>
        <div class="slider-row"><label>Width</label><input type="range" id="ins-line-width" min="1" max="12" value="${entity.line.width}"><span class="value">${entity.line.width}</span></div>
        <div class="slider-row"><label>Shadow</label><input type="checkbox" id="ins-line-shadow" ${entity.shadow.enabled ? 'checked' : ''}></div>
        <div class="slider-row"><label>Collider</label><input type="checkbox" id="ins-line-collider" ${entity.collider.enabled ? 'checked' : ''}></div>
      `;

      document.getElementById('ins-line-dashed').addEventListener('change', (e) => {
        this._pushCreationUndo();
        entity.line.dashed = e.target.checked;
        this._renderCreationEntityList();
      });

      document.getElementById('ins-line-color').addEventListener('change', (e) => {
        this._pushCreationUndo();
        entity.line.color = e.target.value;
      });
      document.getElementById('ins-line-width').addEventListener('change', (e) => {
        this._pushCreationUndo();
        entity.line.width = parseFloat(e.target.value);
        this._renderCreationInspector();
      });
      document.getElementById('ins-line-shadow').addEventListener('change', (e) => {
        this._pushCreationUndo();
        entity.shadow.enabled = e.target.checked;
      });
      document.getElementById('ins-line-collider').addEventListener('change', (e) => {
        this._pushCreationUndo();
        entity.collider.enabled = e.target.checked;
      });
      return;
    }

    if (entity.type === 'rotating_line') {
      container.innerHTML = `
        <div class="slider-row"><label>Color</label><input type="color" id="ins-rot-color" value="${entity.rotating.color}" style="flex:1;"></div>
        <div class="slider-row"><label>Width</label><input type="range" id="ins-rot-width" min="1" max="12" value="${entity.rotating.width}"><span class="value">${entity.rotating.width}</span></div>
        <div class="slider-row"><label>Length</label><input type="range" id="ins-rot-length" min="20" max="500" value="${entity.rotating.length}"><span class="value">${Math.round(entity.rotating.length)}</span></div>
        <div class="slider-row"><label>Angle</label><input type="range" id="ins-rot-angle" min="0" max="360" value="${Math.round(entity.rotating.rotation)}"><span class="value">${Math.round(entity.rotating.rotation)}°</span></div>
        <div class="slider-row"><label>Speed</label><input type="range" id="ins-rot-speed" min="-180" max="180" value="${Math.round(entity.rotating.angularSpeed)}"><span class="value">${Math.round(entity.rotating.angularSpeed)}</span></div>
        <div class="slider-row"><label>Dashed</label><input type="checkbox" id="ins-rot-dashed" ${entity.rotating.dashed ? 'checked' : ''}></div>
        <div class="slider-row"><label>Shadow</label><input type="checkbox" id="ins-rot-shadow" ${entity.shadow.enabled ? 'checked' : ''}></div>
      `;

      document.getElementById('ins-rot-color').addEventListener('change', (e) => {
        this._pushCreationUndo();
        entity.rotating.color = e.target.value;
      });
      document.getElementById('ins-rot-width').addEventListener('change', (e) => {
        this._pushCreationUndo();
        entity.rotating.width = parseFloat(e.target.value);
        this._renderCreationInspector();
      });
      document.getElementById('ins-rot-length').addEventListener('change', (e) => {
        this._pushCreationUndo();
        entity.rotating.length = parseFloat(e.target.value);
        this._renderCreationInspector();
      });
      document.getElementById('ins-rot-angle').addEventListener('change', (e) => {
        this._pushCreationUndo();
        entity.rotating.rotation = parseFloat(e.target.value);
        this._renderCreationInspector();
      });
      document.getElementById('ins-rot-speed').addEventListener('change', (e) => {
        this._pushCreationUndo();
        entity.rotating.angularSpeed = parseFloat(e.target.value);
        this._renderCreationInspector();
      });
      document.getElementById('ins-rot-dashed').addEventListener('change', (e) => {
        this._pushCreationUndo();
        entity.rotating.dashed = e.target.checked;
      });
      document.getElementById('ins-rot-shadow').addEventListener('change', (e) => {
        this._pushCreationUndo();
        entity.shadow.enabled = e.target.checked;
      });
      return;
    }

    if (entity.type === 'walker') {
      container.innerHTML = `
        <div class="slider-row"><label>State</label><span class="value">${entity.walker.state}</span></div>
        <div class="slider-row"><label>Diameter</label><input type="range" id="ins-walk-dia" min="4" max="60" value="${entity.walker.diameter}"><span class="value">${Math.round(entity.walker.diameter)}</span></div>
        <div class="slider-row"><label>Speed</label><input type="range" id="ins-walk-speed" min="10" max="240" value="${entity.walker.speed}"><span class="value">${Math.round(entity.walker.speed)}</span></div>
        <div class="slider-row"><label>Loop</label><input type="checkbox" id="ins-walk-loop" ${entity.walker.loop ? 'checked' : ''}></div>
        <div class="slider-row"><label>Board R</label><input type="range" id="ins-walk-board" min="10" max="80" value="${entity.walker.boardRadius}"><span class="value">${Math.round(entity.walker.boardRadius)}</span></div>
        <div class="slider-row"><label>Light</label><input type="checkbox" id="ins-walk-light-on" ${entity.light.enabled ? 'checked' : ''}></div>
        <div class="slider-row"><label>Radius</label><input type="range" id="ins-walk-light-rad" min="40" max="500" value="${entity.light.radius}"><span class="value">${Math.round(entity.light.radius)}</span></div>
        <div class="slider-row"><label>Int</label><input type="range" id="ins-walk-light-int" min="0" max="100" value="${Math.round(entity.light.intensity * 100)}"><span class="value">${entity.light.intensity.toFixed(2)}</span></div>
        <div class="slider-row"><label>L Color</label><input type="color" id="ins-walk-light-color" value="${entity.light.color}" style="flex:1;"></div>
        <div class="slider-row"><label>Waypoints</label><span class="value">${entity.walker.waypoints.length}</span></div>
        <div class="btn-row">
          <button class="btn btn--small" id="ins-walk-add-waypoint">Add Waypoint (Here)</button>
          <button class="btn btn--small" id="ins-walk-clear-waypoints">Clear WPs</button>
        </div>
      `;

      document.getElementById('ins-walk-dia').addEventListener('change', (e) => {
        this._pushCreationUndo();
        entity.walker.diameter = parseFloat(e.target.value);
        this._renderCreationInspector();
      });
      document.getElementById('ins-walk-speed').addEventListener('change', (e) => {
        this._pushCreationUndo();
        entity.walker.speed = parseFloat(e.target.value);
        this._renderCreationInspector();
      });
      document.getElementById('ins-walk-loop').addEventListener('change', (e) => {
        this._pushCreationUndo();
        entity.walker.loop = e.target.checked;
      });
      document.getElementById('ins-walk-board').addEventListener('change', (e) => {
        this._pushCreationUndo();
        entity.walker.boardRadius = parseFloat(e.target.value);
        this._renderCreationInspector();
      });
      document.getElementById('ins-walk-light-on').addEventListener('change', (e) => {
        this._pushCreationUndo();
        entity.light.enabled = e.target.checked;
      });
      document.getElementById('ins-walk-light-rad').addEventListener('change', (e) => {
        this._pushCreationUndo();
        entity.light.radius = parseFloat(e.target.value);
        this._renderCreationInspector();
      });
      document.getElementById('ins-walk-light-int').addEventListener('change', (e) => {
        this._pushCreationUndo();
        entity.light.intensity = parseFloat(e.target.value) / 100;
        this._renderCreationInspector();
      });
      document.getElementById('ins-walk-light-color').addEventListener('change', (e) => {
        this._pushCreationUndo();
        entity.light.color = e.target.value;
      });
      document.getElementById('ins-walk-add-waypoint').addEventListener('click', () => {
        this._pushCreationUndo();
        entity.walker.waypoints.push({ x: entity.transform.x, y: entity.transform.y });
        this._renderCreationInspector();
      });
      document.getElementById('ins-walk-clear-waypoints').addEventListener('click', () => {
        this._pushCreationUndo();
        entity.walker.waypoints = [{ x: entity.transform.x, y: entity.transform.y }];
        entity.walker.waypointIndex = 0;
        this._renderCreationInspector();
      });
    }
  }

  _selectCreationEntity(id) {
    this.creation.selectedId = id;
    this._renderCreationEntityList();
    this._renderCreationInspector();
  }

  _getSelectedCreationEntity() {
    return this.creation.entities.find((e) => e.id === this.creation.selectedId) || null;
  }

  _snapshotCreationState() {
    return JSON.stringify({
      entities: this.creation.entities,
      nextId: this.creation.nextId,
      selectedId: this.creation.selectedId,
      performanceMode: this.creation.performanceMode
    });
  }

  _normalizeCreationEntity(entity) {
    if (!entity || typeof entity !== 'object' || !entity.type) return null;
    if (typeof entity.id !== 'number') return null;

    if (entity.type === 'line') {
      if (!entity.line) return null;
      entity.line.dashed = !!entity.line.dashed;
      entity.line.width = Math.max(1, Math.min(12, parseFloat(entity.line.width || 2)));
      entity.line.color = entity.line.color || '#f5f0e1';
      entity.collider = entity.collider || { enabled: true };
      entity.shadow = entity.shadow || { enabled: true };
      entity.collider.enabled = entity.collider.enabled !== false;
      entity.shadow.enabled = entity.shadow.enabled !== false;
      return entity;
    }

    if (entity.type === 'rotating_line') {
      if (!entity.transform || !entity.rotating) return null;
      entity.rotating.dashed = !!entity.rotating.dashed;
      entity.rotating.width = Math.max(1, Math.min(12, parseFloat(entity.rotating.width || 2)));
      entity.rotating.length = Math.max(20, Math.min(500, parseFloat(entity.rotating.length || 120)));
      entity.rotating.rotation = parseFloat(entity.rotating.rotation || 0);
      entity.rotating.angularSpeed = Math.max(-180, Math.min(180, parseFloat(entity.rotating.angularSpeed || 45)));
      entity.rotating.color = entity.rotating.color || '#c8a951';
      entity.collider = entity.collider || { enabled: true };
      entity.shadow = entity.shadow || { enabled: true };
      entity.collider.enabled = entity.collider.enabled !== false;
      entity.shadow.enabled = entity.shadow.enabled !== false;
      return entity;
    }

    if (entity.type === 'walker') {
      if (!entity.transform || !entity.walker || !entity.light) return null;
      entity.walker.diameter = Math.max(4, Math.min(60, parseFloat(entity.walker.diameter || 12)));
      entity.walker.speed = Math.max(10, Math.min(240, parseFloat(entity.walker.speed || 60)));
      entity.walker.loop = entity.walker.loop !== false;
      entity.walker.state = entity.walker.state || 'walk';
      entity.walker.boardRadius = Math.max(10, Math.min(80, parseFloat(entity.walker.boardRadius || 24)));
      entity.walker.stationRadius = Math.max(10, Math.min(80, parseFloat(entity.walker.stationRadius || 20)));
      entity.walker.minRideMs = Math.max(500, parseFloat(entity.walker.minRideMs || 3500));
      if (!Array.isArray(entity.walker.waypoints) || entity.walker.waypoints.length === 0) {
        entity.walker.waypoints = [{ x: entity.transform.x, y: entity.transform.y }];
      }
      entity.walker.waypointIndex = Math.max(0, Math.min(entity.walker.waypointIndex || 0, entity.walker.waypoints.length - 1));
      entity.light.enabled = entity.light.enabled !== false;
      entity.light.radius = Math.max(40, Math.min(500, parseFloat(entity.light.radius || 150)));
      entity.light.intensity = Math.max(0, Math.min(1, parseFloat(entity.light.intensity != null ? entity.light.intensity : 0.35)));
      entity.light.color = entity.light.color || '#f5f0e1';
      return entity;
    }

    return null;
  }

  _normalizeCreationState() {
    this.creation.entities = (this.creation.entities || [])
      .map((entity) => this._normalizeCreationEntity(entity))
      .filter(Boolean);

    const ids = new Set(this.creation.entities.map((e) => e.id));
    if (!ids.has(this.creation.selectedId)) {
      this.creation.selectedId = null;
    }

    const maxId = this.creation.entities.reduce((acc, e) => Math.max(acc, e.id), 0);
    this.creation.nextId = Math.max(maxId + 1, this.creation.nextId || 1);
    if (this.creation.performanceMode !== 'eco') this.creation.performanceMode = 'normal';
  }

  _restoreCreationState(snapshot) {
    try {
      const state = JSON.parse(snapshot);
      this.creation.entities = state.entities || [];
      this.creation.nextId = state.nextId || 1;
      this.creation.selectedId = state.selectedId || null;
      this.creation.performanceMode = state.performanceMode || 'normal';
      this.creation.draftSegment = null;
      this._normalizeCreationState();
    } catch (err) {
      console.warn('Failed to restore creation state', err);
    }
  }

  _pushCreationUndo() {
    this.creation.undoStack.push(this._snapshotCreationState());
    if (this.creation.undoStack.length > 120) this.creation.undoStack.shift();
    this.creation.redoStack = [];
  }

  _undoCreation() {
    if (this.creation.undoStack.length === 0) return;
    const current = this._snapshotCreationState();
    const prev = this.creation.undoStack.pop();
    this.creation.redoStack.push(current);
    this._restoreCreationState(prev);
    this._renderCreationUI();
  }

  _redoCreation() {
    if (this.creation.redoStack.length === 0) return;
    const current = this._snapshotCreationState();
    const next = this.creation.redoStack.pop();
    this.creation.undoStack.push(current);
    this._restoreCreationState(next);
    this._renderCreationUI();
  }

  _deleteSelectedCreationEntity() {
    if (!this.creation.selectedId) return;
    this._pushCreationUndo();
    this.creation.entities = this.creation.entities.filter((e) => e.id !== this.creation.selectedId);
    this.creation.selectedId = null;
    this._renderCreationUI();
  }

  _clearCreationScene() {
    if (this.creation.entities.length === 0) return;
    this._pushCreationUndo();
    this.creation.entities = [];
    this.creation.selectedId = null;
    this.creation.nextId = 1;
    this._renderCreationUI();
  }

  _exportCreationScene() {
    const textarea = document.getElementById('creation-json');
    const data = {
      version: 1,
      savedAt: new Date().toISOString(),
      entities: this.creation.entities,
      nextId: this.creation.nextId,
      performanceMode: this.creation.performanceMode
    };
    textarea.value = JSON.stringify(data, null, 2);
  }

  _importCreationScene() {
    const textarea = document.getElementById('creation-json');
    if (!textarea.value.trim()) return;
    try {
      const data = JSON.parse(textarea.value);
      if (!Array.isArray(data.entities)) return;
      this._pushCreationUndo();
      this.creation.entities = data.entities;
      this.creation.nextId = data.nextId || (data.entities.length + 1);
      this.creation.selectedId = null;
      this.creation.performanceMode = data.performanceMode || 'normal';
      this._normalizeCreationState();
      this._renderCreationUI();
    } catch (err) {
      console.warn('Invalid scene JSON', err);
    }
  }

  _saveCreationSceneLocal() {
    try {
      const payload = {
        version: 1,
        entities: this.creation.entities,
        nextId: this.creation.nextId,
        performanceMode: this.creation.performanceMode
      };
      localStorage.setItem('trenfase.creation.scene.v1', JSON.stringify(payload));
    } catch (err) {
      console.warn('Unable to save local scene', err);
    }
  }

  _loadCreationSceneLocal() {
    try {
      const raw = localStorage.getItem('trenfase.creation.scene.v1');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!Array.isArray(data.entities)) return;
      this._pushCreationUndo();
      this.creation.entities = data.entities;
      this.creation.nextId = data.nextId || (data.entities.length + 1);
      this.creation.selectedId = null;
      this.creation.performanceMode = data.performanceMode || 'normal';
      this._normalizeCreationState();
      this._renderCreationUI();
    } catch (err) {
      console.warn('Unable to load local scene', err);
    }
  }

  _onCreationPointerDown(e) {
    if (!this.creation.enabled) return;
    const p = this._eventToCanvasPoint(e);
    if (!p) return;
    e.preventDefault();

    this.creation.isPointerDown = true;
    this.creation.pointerStart = p;
    this.creation.dragStart = p;
    this.creation.dragUndoPushed = false;
    this.creation.dragMoved = false;

    if (this.creation.tool === 'select') {
      const hit = this._hitTestCreationEntity(p.x, p.y);
      this._selectCreationEntity(hit ? hit.id : null);
      if (hit) {
        this.creation.dragMode = 'move-entity';
        this.creation.dragEntityId = hit.id;
      } else {
        this.creation.dragMode = null;
      }
      return;
    }

    if (this.creation.tool === 'station') {
      // In Creator mode, add a new station to this.stations array
      this._pushCreationUndo();
      
      const newStation = {
        id: `station-${Date.now()}`,
        name: `Station ${this.stations.length + 1}`,
        x: p.x,
        y: p.y,
        note: 60,       // Default MIDI Note (C4)
        type: 'major',
        ringRadius: 15,
        // UI Defaults (SimCity Expansion variables)
        population: 0,
        vitality: 0.5,
        decayThreshold: 0.8
      };
      
      this.stations.push(newStation);
      
      // Select it in the standard UI
      this.selectedStation = newStation;
      if (this.ring) {
        this.ring.stations = this.stations; // ensure sync
        this.ring.render();
      }
      this.menuTab = 'station';
      this._renderMenu();
      this._openStationPanel(newStation); // Open the specific station properties panel
      
      this.creation.isPointerDown = false;
      this._renderCreationUI();
      return;
    }

    if (this.creation.tool === 'walker') {
      this._pushCreationUndo();
      const walker = this._createWalkerEntity(p.x, p.y);
      this.creation.entities.push(walker);
      this._selectCreationEntity(walker.id);
      this.creation.isPointerDown = false;
      this._renderCreationUI();
      return;
    }

    if (this.creation.tool === 'walker-waypoint') {
      const walker = this._getSelectedCreationEntity();
      if (walker && walker.type === 'walker') {
        this._pushCreationUndo();
        walker.walker.waypoints.push({ x: p.x, y: p.y });
        this._renderCreationInspector();
      }
      this.creation.isPointerDown = false;
      return;
    }

    const dashed = this.creation.tool === 'line-dashed';
    if (this.creation.tool === 'line-solid' || dashed || this.creation.tool === 'rotating-line') {
      this.creation.dragMode = 'draw-segment';
      this.creation.draftSegment = {
        x1: p.x, y1: p.y, x2: p.x, y2: p.y,
        dashed,
        color: '#C41E3A',
        width: 2
      };
    }
  }

  _onCreationPointerMove(e) {
    if (!this.creation.enabled && this.creation.isPointerDown) {
      this._cancelCreationInteraction();
      return;
    }
    if (!this.creation.enabled || !this.creation.isPointerDown) return;
    const p = this._eventToCanvasPoint(e);
    if (!p) return;

    if (this.creation.dragMode === 'draw-segment' && this.creation.draftSegment) {
      this.creation.draftSegment.x2 = p.x;
      this.creation.draftSegment.y2 = p.y;
      return;
    }

    if (this.creation.dragMode === 'move-entity') {
      const entity = this.creation.entities.find((it) => it.id === this.creation.dragEntityId);
      if (!entity) return;
      const dx = p.x - this.creation.dragStart.x;
      const dy = p.y - this.creation.dragStart.y;
      if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return;
      if (!this.creation.dragUndoPushed) {
        this._pushCreationUndo();
        this.creation.dragUndoPushed = true;
      }
      this.creation.dragMoved = true;
      this.creation.dragStart = p;

      if (entity.type === 'line') {
        entity.line.x1 += dx; entity.line.y1 += dy;
        entity.line.x2 += dx; entity.line.y2 += dy;
      } else if (entity.type === 'rotating_line') {
        entity.transform.x += dx; entity.transform.y += dy;
      } else if (entity.type === 'walker') {
        entity.transform.x += dx; entity.transform.y += dy;
        entity.walker.waypoints = entity.walker.waypoints.map((wp) => ({ x: wp.x + dx, y: wp.y + dy }));
      }
    }
  }

  _onCreationPointerUp(e) {
    if (!this.creation.isPointerDown) return;
    if (!this.creation.enabled) {
      this._cancelCreationInteraction();
      this._renderCreationUI();
      return;
    }
    const p = this._eventToCanvasPoint(e);

    if (this.creation.dragMode === 'draw-segment' && this.creation.draftSegment && p) {
      const seg = this.creation.draftSegment;
      const dist = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
      if (dist > 5) {
        this._pushCreationUndo();
        if (this.creation.tool === 'rotating-line') {
          const cx = seg.x1;
          const cy = seg.y1;
          const length = Math.max(40, dist * 2);
          const rotation = Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1) * 180 / Math.PI;
          const rotating = this._createRotatingLineEntity(cx, cy, length, rotation);
          this.creation.entities.push(rotating);
          this._selectCreationEntity(rotating.id);
        } else {
          const line = this._createLineEntity(seg.x1, seg.y1, seg.x2, seg.y2, seg.dashed);
          this.creation.entities.push(line);
          this._selectCreationEntity(line.id);
        }
      }
    }

    this._cancelCreationInteraction();
    this._renderCreationUI();
  }

  _eventToCanvasPoint(e) {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  _createLineEntity(x1, y1, x2, y2, dashed = false) {
    const id = this.creation.nextId++;
    return {
      id,
      type: 'line',
      line: { x1, y1, x2, y2, dashed, width: 2, color: '#f5f0e1' },
      collider: { enabled: true },
      shadow: { enabled: true }
    };
  }

  _createRotatingLineEntity(x, y, length = 120, rotation = 0) {
    const id = this.creation.nextId++;
    return {
      id,
      type: 'rotating_line',
      transform: { x, y },
      rotating: { length, rotation, angularSpeed: 45, dashed: false, width: 2, color: '#c8a951' },
      collider: { enabled: true },
      shadow: { enabled: true }
    };
  }

  _createWalkerEntity(x, y) {
    const id = this.creation.nextId++;
    return {
      id,
      type: 'walker',
      transform: { x, y },
      walker: {
        diameter: 12,
        speed: 60,
        waypoints: [{ x, y }],
        waypointIndex: 0,
        loop: true,
        state: 'walk',
        targetTrainId: null,
        waitStationId: null,
        rideMs: 0,
        unboardMs: 0,
        boardRadius: 24,
        stationRadius: 20,
        minRideMs: 3500
      },
      light: { enabled: true, radius: 150, intensity: 0.35, color: '#f5f0e1' }
    };
  }

  _hitTestCreationEntity(x, y) {
    for (let i = this.creation.entities.length - 1; i >= 0; i--) {
      const entity = this.creation.entities[i];
      if (entity.type === 'walker') {
        // Expand hit radius to make clickability easier
        const r = entity.walker.diameter / 2 + 16;
        if (Math.hypot(x - entity.transform.x, y - entity.transform.y) <= r) return entity;
      } else if (entity.type === 'line') {
        const d = this._distancePointToSegment(x, y, entity.line.x1, entity.line.y1, entity.line.x2, entity.line.y2);
        if (d <= Math.max(8, entity.line.width + 4)) return entity;
      } else if (entity.type === 'rotating_line') {
        const seg = this._getRotatingSegment(entity);
        const d = this._distancePointToSegment(x, y, seg.x1, seg.y1, seg.x2, seg.y2);
        if (d <= Math.max(8, entity.rotating.width + 4)) return entity;
      }
    }
    return null;
  }

  _distancePointToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + dx * t;
    const cy = y1 + dy * t;
    return Math.hypot(px - cx, py - cy);
  }

  _getRotatingSegment(entity) {
    const half = entity.rotating.length / 2;
    const rad = entity.rotating.rotation * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      x1: entity.transform.x - half * cos,
      y1: entity.transform.y - half * sin,
      x2: entity.transform.x + half * cos,
      y2: entity.transform.y + half * sin
    };
  }

  _segmentToDashed(x1, y1, x2, y2, dashLen = 15, gapLen = 20) {
    const out = [];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.001) return out;
    let current = 0;
    while (current < dist) {
      const end = Math.min(current + dashLen, dist);
      const t1 = current / dist;
      const t2 = end / dist;
      out.push({
        x1: x1 + dx * t1,
        y1: y1 + dy * t1,
        x2: x1 + dx * t2,
        y2: y1 + dy * t2
      });
      current += dashLen + gapLen;
    }
    return out;
  }

  _hexToRgbString(hex, fallback = '245, 240, 225') {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!result) return fallback;
    return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
  }

  _getEntitySegments(entity) {
    if (entity.type === 'line') {
      if (!entity.line.dashed) {
        return [{
          x1: entity.line.x1, y1: entity.line.y1, x2: entity.line.x2, y2: entity.line.y2,
          color: entity.line.color, width: entity.line.width, shadow: entity.shadow.enabled, entityId: entity.id
        }];
      }
      return this._segmentToDashed(entity.line.x1, entity.line.y1, entity.line.x2, entity.line.y2).map((seg) => ({
        ...seg,
        color: entity.line.color,
        width: entity.line.width,
        shadow: entity.shadow.enabled,
        entityId: entity.id
      }));
    }

    if (entity.type === 'rotating_line') {
      const seg = this._getRotatingSegment(entity);
      if (!entity.rotating.dashed) {
        return [{
          ...seg,
          color: entity.rotating.color,
          width: entity.rotating.width,
          shadow: entity.shadow.enabled,
          entityId: entity.id
        }];
      }
      return this._segmentToDashed(seg.x1, seg.y1, seg.x2, seg.y2).map((s) => ({
        ...s,
        color: entity.rotating.color,
        width: entity.rotating.width,
        shadow: entity.shadow.enabled,
        entityId: entity.id
      }));
    }

    return [];
  }

  _updateCreation(deltaTime) {
    if (!this.ring) return;

    const trainPositions = new Map();
    for (const train of this.trains.getAll()) {
      const t = train.angle / 360;
      const pos = this.ring._getPointAtT(t);
      trainPositions.set(train.id, { x: pos.x, y: pos.y });
    }

    for (const entity of this.creation.entities) {
      if (entity.type === 'rotating_line') {
        entity.rotating.rotation += (entity.rotating.angularSpeed * deltaTime) / 1000;
        if (entity.rotating.rotation >= 360) entity.rotating.rotation -= 360;
        if (entity.rotating.rotation < 0) entity.rotating.rotation += 360;
      } else if (entity.type === 'walker') {
        this._updateWalkerEntity(entity, deltaTime, trainPositions);
      }
    }

    if (this.currentPanelView === 'settings' && this.menuTab === 'creation') {
      this.creation.uiRefreshMs += deltaTime;
      if (this.creation.uiRefreshMs >= 300) {
        this.creation.uiRefreshMs = 0;
        this._renderCreationEntityList();
        this._renderCreationInspector();
      }
    } else {
      this.creation.uiRefreshMs = 0;
    }
  }

  _updateWalkerEntity(entity, deltaTime, trainPositions) {
    const w = entity.walker;
    const dt = deltaTime / 1000;

    const moveAlongPath = () => {
      const points = w.waypoints || [];
      if (points.length === 0) return;
      const target = points[w.waypointIndex % points.length];
      const dx = target.x - entity.transform.x;
      const dy = target.y - entity.transform.y;
      const dist = Math.hypot(dx, dy);
      const step = w.speed * dt;
      if (dist <= Math.max(1, step)) {
        entity.transform.x = target.x;
        entity.transform.y = target.y;
        if (points.length > 1) {
          if (w.loop) {
            w.waypointIndex = (w.waypointIndex + 1) % points.length;
          } else {
            w.waypointIndex = Math.min(w.waypointIndex + 1, points.length - 1);
          }
        }
      } else {
        entity.transform.x += (dx / dist) * step;
        entity.transform.y += (dy / dist) * step;
      }
    };

    if (w.state === 'walk') {
      moveAlongPath();
      const nearestStation = this._getNearestStation(entity.transform.x, entity.transform.y);
      if (nearestStation && nearestStation.distance <= w.stationRadius) {
        w.state = 'wait';
        w.waitStationId = nearestStation.station.id;
        entity.transform.x = nearestStation.position.x;
        entity.transform.y = nearestStation.position.y;
      }
      return;
    }

    if (w.state === 'wait') {
      const nearestStation = this._getNearestStation(entity.transform.x, entity.transform.y);
      if (nearestStation) {
        entity.transform.x = nearestStation.position.x;
        entity.transform.y = nearestStation.position.y;
      }
      for (const [trainId, pos] of trainPositions) {
        if (Math.hypot(pos.x - entity.transform.x, pos.y - entity.transform.y) <= w.boardRadius) {
          w.state = 'ride';
          w.targetTrainId = trainId;
          w.rideMs = 0;
          w.unboardMs = 0;
          return;
        }
      }
      return;
    }

    if (w.state === 'ride') {
      const target = trainPositions.get(w.targetTrainId);
      if (!target) {
        w.state = 'walk';
        w.targetTrainId = null;
        return;
      }
      entity.transform.x = target.x;
      entity.transform.y = target.y;
      w.rideMs += deltaTime;

      const station = this._getNearestStation(entity.transform.x, entity.transform.y);
      if (w.rideMs >= w.minRideMs && station && station.distance <= w.stationRadius && station.station.id !== w.waitStationId) {
        w.state = 'unboard';
        w.waitStationId = station.station.id;
        w.unboardMs = 0;
        entity.transform.x = station.position.x;
        entity.transform.y = station.position.y;
      }
      return;
    }

    if (w.state === 'unboard') {
      w.unboardMs += deltaTime;
      if (w.unboardMs >= 600) {
        w.state = 'walk';
        w.targetTrainId = null;
        w.rideMs = 0;
      }
    }
  }

  _getNearestStation(x, y) {
    let nearest = null;
    for (const station of this.stations) {
      const pos = this.ring.getStationScreenPosition(station);
      const dist = Math.hypot(pos.x - x, pos.y - y);
      if (!nearest || dist < nearest.distance) {
        nearest = { station, position: pos, distance: dist };
      }
    }
    return nearest;
  }

  _buildCreationRenderData() {
    const obstacles = [];
    const walkers = [];
    const lights = [];

    for (const entity of this.creation.entities) {
      if (entity.type === 'line' || entity.type === 'rotating_line') {
        const selected = entity.id === this.creation.selectedId;
        const segs = this._getEntitySegments(entity).map((seg) => ({ ...seg, selected }));
        obstacles.push(...segs);
      } else if (entity.type === 'walker') {
        if (entity.walker.waypoints.length > 1) {
          for (let i = 0; i < entity.walker.waypoints.length - 1; i++) {
            const a = entity.walker.waypoints[i];
            const b = entity.walker.waypoints[i + 1];
            obstacles.push({
              x1: a.x, y1: a.y, x2: b.x, y2: b.y,
              color: 'rgba(245, 240, 225, 0.28)',
              width: 1,
              shadow: false,
              selected: entity.id === this.creation.selectedId
            });
          }
          if (entity.walker.loop) {
            const first = entity.walker.waypoints[0];
            const last = entity.walker.waypoints[entity.walker.waypoints.length - 1];
            obstacles.push({
              x1: last.x, y1: last.y, x2: first.x, y2: first.y,
              color: 'rgba(245, 240, 225, 0.2)',
              width: 1,
              shadow: false,
              selected: entity.id === this.creation.selectedId
            });
          }
        }

        let stateColor = 'rgba(245,240,225,0.9)';
        if (entity.walker.state === 'wait') stateColor = 'rgba(200,169,81,0.95)';
        if (entity.walker.state === 'ride') stateColor = 'rgba(74,155,63,0.95)';
        if (entity.walker.state === 'unboard') stateColor = 'rgba(196,30,58,0.95)';
        walkers.push({
          x: entity.transform.x,
          y: entity.transform.y,
          radius: entity.walker.diameter / 2,
          color: stateColor,
          selected: entity.id === this.creation.selectedId
        });
        if (entity.light.enabled) {
          lights.push({
            x: entity.transform.x,
            y: entity.transform.y,
            angle: 0,
            type: 'omni',
            colorRGB: this._hexToRgbString(entity.light.color),
            intensity: entity.light.intensity,
            radius: entity.light.radius
          });
        }
      }
    }

    return {
      obstacles,
      walkers,
      lights,
      draftSegment: this.creation.enabled ? this.creation.draftSegment : null,
      performanceMode: this.creation.performanceMode
    };
  }

  /**
   * Dynamically render per-train controls in the panel
   */
  _renderTrainControls() {
    const container = document.getElementById('train-controls-list');
    if (!container) return;

    const trains = this.trains.getAll();
    container.innerHTML = '';

    if (trains.length === 0) {
      container.innerHTML = '<div style="color: var(--color-text-muted); font-size: 0.7rem;">No trains. Press + 🚃</div>';
      return;
    }

    trains.forEach((train, i) => {
      this._normalizeTrainSoundConfig(train);
      const accordion = document.createElement('div');
      accordion.className = 'accordion';
      // keep the first one open
      if (i === 0) accordion.classList.add('open');

      accordion.innerHTML = `
        <div class="accordion__header">
          <div class="accordion__title">
            <div class="train-item__color" style="background: ${train.color}"></div>
            <span>Train ${i + 1}</span>
          </div>
          <span class="accordion__icon">▼</span>
        </div>
        <div class="accordion__body">
          <div class="train-item" style="border:none; padding:0;">
            <div style="flex:1; display:flex; flex-direction:column; gap:4px;">
              <div class="slider-row">
                <label style="min-width:30px;">Spd</label>
                <input type="range" class="train-speed" data-train-id="${train.id}" min="${this.speedSliderMin}" max="${this.speedSliderMax}" value="${this._uiSpeedToSlider(this._actualSpeedToUi(train.speed))}" style="flex:1;">
                <span class="value train-speed-val" style="min-width:30px;">${this._actualSpeedToUi(train.speed).toFixed(2)}</span>
              </div>
              <div class="slider-row">
                <label style="min-width:30px;">Lit</label>
                <input type="range" class="train-light-int" min="0" max="100" value="${Math.round(train.lightIntensity * 100)}" style="flex:1;">
                <span class="value train-light-int-val" style="min-width:30px;">${train.lightIntensity.toFixed(2)}</span>
              </div>
              <div class="slider-row">
                <label style="min-width:30px;">Rad</label>
                <input type="range" class="train-light-rad" min="50" max="1000" value="${Math.round(train.lightRadius)}" style="flex:1;">
                <span class="value train-light-rad-val" style="min-width:30px;">${Math.round(train.lightRadius)}</span>
              </div>
              <div class="slider-row">
                <label style="min-width:30px;">Snd</label>
                <button class="btn btn--small train-sound-toggle" title="Toggle train sound">
                  ${(train.soundEnabled && train.droneEnabled) ? 'C+D' : (train.soundEnabled ? 'Clck' : (train.droneEnabled ? 'Drn' : 'Off'))}
                </button>
              </div>
              <div class="slider-row">
                <label style="min-width:30px;">Vol</label>
                <input type="range" class="train-sound-vol" min="0" max="30" value="${Math.round(train.soundVolume * 100)}" style="flex:1;">
                <span class="value train-sound-vol-val" style="min-width:30px;">${train.soundVolume.toFixed(2)}</span>
              </div>
              <div class="slider-row">
                <label style="min-width:30px;">Frq</label>
                <input type="range" class="train-sound-freq" min="20" max="200" value="${Math.round(train.soundFrequency)}" style="flex:1;">
                <span class="value train-sound-freq-val" style="min-width:42px;">${Math.round(train.soundFrequency)}Hz</span>
              </div>
              <div class="slider-row">
                <label style="min-width:30px;">Rate</label>
                <input type="range" class="train-sound-rate" min="10" max="400" value="${Math.round(train.soundRate * 100)}" style="flex:1;">
                <span class="value train-sound-rate-val" style="min-width:42px;">${train.soundRate.toFixed(2)}x</span>
              </div>
              <div class="slider-row">
                <label style="min-width:30px;">Tone</label>
                <input type="range" class="train-sound-tone" min="0" max="100" value="${Math.round(train.soundTone * 100)}" style="flex:1;">
                <span class="value train-sound-tone-val" style="min-width:42px;">${train.soundTone.toFixed(2)}</span>
              </div>
            </div>
            
            <div style="display:flex; flex-direction:column; gap:4px;">
              <button class="btn btn--small train-dir" data-train-id="${train.id}" title="Toggle direction">
                ${train.direction === 1 ? '→' : '←'}
              </button>
              <button class="btn btn--small train-remove" data-train-id="${train.id}" title="Remove">✕</button>
            </div>
          </div>
        </div>
      `;

      container.appendChild(accordion);

      // Accordion toggle
      const header = accordion.querySelector('.accordion__header');
      header.addEventListener('click', () => {
        accordion.classList.toggle('open');
      });

      // Per-train speed
      accordion.querySelector('.train-speed').addEventListener('input', (e) => {
        const uiSpeed = this._sliderToUiSpeed(parseFloat(e.target.value));
        train.speed = this._uiSpeedToActual(uiSpeed);
        accordion.querySelector('.train-speed-val').textContent = uiSpeed.toFixed(2);
        
        // Keep synced with focused panel if open
        if (this.selectedTrain && this.selectedTrain.id === train.id) {
          document.getElementById('train-edit-spd').value = e.target.value;
          document.getElementById('train-edit-spd-val').textContent = uiSpeed.toFixed(2);
        }
      });

      accordion.querySelector('.train-light-int').addEventListener('input', (e) => {
        train.lightIntensity = e.target.value / 100;
        accordion.querySelector('.train-light-int-val').textContent = train.lightIntensity.toFixed(2);
      });

      // Per-train light radius
      accordion.querySelector('.train-light-rad').addEventListener('input', (e) => {
        train.lightRadius = parseFloat(e.target.value);
        accordion.querySelector('.train-light-rad-val').textContent = Math.round(train.lightRadius);
      });

      // Per-train sound toggle
      accordion.querySelector('.train-sound-toggle').addEventListener('click', (e) => {
        this._normalizeTrainSoundConfig(train);
        // Toggle Clack Only -> Drone Only -> Both -> Off using modulo state
        let state = 0;
        if (train.soundEnabled && !train.droneEnabled) state = 1;
        else if (!train.soundEnabled && train.droneEnabled) state = 2;
        else if (train.soundEnabled && train.droneEnabled) state = 3;

        state = (state + 1) % 4;
        
        train.soundEnabled = (state === 1 || state === 3);
        train.droneEnabled = (state === 2 || state === 3);

        if (!train.droneEnabled) {
          this.audio.removeTrainDrone(train.id);
        }

        e.target.textContent = (train.soundEnabled && train.droneEnabled) ? 'C+D' : (train.soundEnabled ? 'Clck' : (train.droneEnabled ? 'Drn' : 'Off'));
        
        if (this.selectedTrain && this.selectedTrain.id === train.id) {
          this._updateTrainSoundButton(train);
        }
      });

      // Per-train sound volume
      accordion.querySelector('.train-sound-vol').addEventListener('input', (e) => {
        this._normalizeTrainSoundConfig(train);
        train.soundVolume = Math.max(0, Math.min(0.3, e.target.value / 100));
        accordion.querySelector('.train-sound-vol-val').textContent = train.soundVolume.toFixed(2);
        if (this.selectedTrain && this.selectedTrain.id === train.id) {
          document.getElementById('train-edit-snd-vol').value = e.target.value;
          document.getElementById('train-edit-snd-vol-val').textContent = train.soundVolume.toFixed(2);
        }
      });

      // Per-train sound frequency
      accordion.querySelector('.train-sound-freq').addEventListener('input', (e) => {
        this._normalizeTrainSoundConfig(train);
        train.soundFrequency = Math.max(20, Math.min(200, parseFloat(e.target.value)));
        accordion.querySelector('.train-sound-freq-val').textContent = `${Math.round(train.soundFrequency)}Hz`;
        if (this.selectedTrain && this.selectedTrain.id === train.id) {
          document.getElementById('train-edit-snd-freq').value = e.target.value;
          document.getElementById('train-edit-snd-freq-val').textContent = `${Math.round(train.soundFrequency)}Hz`;
        }
      });

      // Per-train sound rate
      accordion.querySelector('.train-sound-rate').addEventListener('input', (e) => {
        this._normalizeTrainSoundConfig(train);
        train.soundRate = Math.max(0.1, Math.min(4.0, parseFloat(e.target.value) / 100));
        accordion.querySelector('.train-sound-rate-val').textContent = `${train.soundRate.toFixed(2)}x`;
        if (this.selectedTrain && this.selectedTrain.id === train.id) {
          document.getElementById('train-edit-snd-rate').value = e.target.value;
          document.getElementById('train-edit-snd-rate-val').textContent = `${train.soundRate.toFixed(2)}x`;
        }
      });

      // Per-train sound tone/texture
      accordion.querySelector('.train-sound-tone').addEventListener('input', (e) => {
        this._normalizeTrainSoundConfig(train);
        train.soundTone = Math.max(0, Math.min(1, parseFloat(e.target.value) / 100));
        accordion.querySelector('.train-sound-tone-val').textContent = train.soundTone.toFixed(2);
        if (this.selectedTrain && this.selectedTrain.id === train.id) {
          document.getElementById('train-edit-snd-tone').value = e.target.value;
          document.getElementById('train-edit-snd-tone-val').textContent = train.soundTone.toFixed(2);
        }
      });

      // Per-train direction
      accordion.querySelector('.train-dir').addEventListener('click', (e) => {
        train.direction *= -1;
        train.triggeredStations.clear();
        e.target.textContent = train.direction === 1 ? '→' : '←';
        
        if (this.selectedTrain && this.selectedTrain.id === train.id) {
          document.getElementById('train-edit-dir').textContent = train.direction === 1 ? 'Forward →' : '← Reverse';
        }
      });

      // Remove train
      accordion.querySelector('.train-remove').addEventListener('click', () => {
        this.audio.removeTrainDrone(train.id);
        this.trains.removeTrain(train.id);
        
        if (this.selectedTrain && this.selectedTrain.id === train.id) {
          this._closePanel();
        } else {
          this._renderTrainControls();
        }
      });
    });
  }
}

// Bootstrap
const app = new App();
app.init().catch(console.error);
