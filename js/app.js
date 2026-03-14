/**
 * TRENFASE — Main Application v2
 * Orchestrates all modules with per-station FX controls,
 * drone generator, slower speed, and rounded-rect layout
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
    this.stations = STATIONS;
    this.running = false;
    this.lastTime = 0;
    this.selectedStation = null;
    this.selectedTrain = null;
    this.globalDirection = 1;
    this.rhythmEnabled = true;
    
    this._onTrainClack = this._onTrainClack.bind(this);
  }

  _onTrainClack(train) {
    if (!this.rhythmEnabled) return;
    const volInput = document.getElementById('drone-vol');
    const freqInput = document.getElementById('drone-freq');
    const vol = volInput ? volInput.value / 100 : 0.08;
    const pitch = freqInput ? parseFloat(freqInput.value) / 55 : 1.0;
    
    // Slight randomization for organic feel
    const randPitch = pitch * (0.95 + Math.random() * 0.1);
    const randVol = vol * (0.8 + Math.random() * 0.4);
    
    this.audio.playTrainClack(randVol, randPitch);
  }

  async init() {
    const loadingBar = document.getElementById('loading-bar');
    const startBtn = document.getElementById('start-btn');

    this.audio.init();
    loadingBar.style.width = '20%';

    await this.audio.loadAll(this.stations);
    loadingBar.style.width = '100%';

    startBtn.style.display = 'block';
    startBtn.addEventListener('click', () => this._start());
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

    // Init ring (now rounded rectangle)
    this.ring = new Ring('ring-container', this.stations, 
      (station) => this._onStationClick(station),
      (train) => this._onTrainClick(train)
    );
    this.ring.render();

    // Init trim editor
    this.trimEditor = new TrimEditor('trim-editor', this.audio);

    // Add first train with slow speed
    this.trains.addTrain(0.06, this.globalDirection, this._onTrainClack);
    this._renderTrainControls();

    this._setupControls();

    this.running = true;
    this.lastTime = performance.now();
    this._loop();

    // Handle resize
    window.addEventListener('resize', () => {
      if (this.ring) this.ring.render();
      if (this.bg) this.bg.resize();
    });
  }

  _loop() {
    if (!this.running) return;

    const now = performance.now();
    const deltaTime = now - this.lastTime;
    this.lastTime = now;

    this.trains.updateAll(deltaTime);

    for (const train of this.trains.getAll()) {
      for (const station of this.stations) {
        if (station.active && train.shouldTrigger(station)) {
          const reverse = train.direction === -1;
          this.audio.play(station, reverse);
          this.ring.flashStation(station.id);

          // Get screen position for glow
          const pos = this.ring.getStationScreenPosition(station);
          this.bg.addGlowAt(pos.x, pos.y, station.color);
        }
      }
    }

    this.ring.updateTrains(this.trains.getAll());

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
    this.bg.render(analyserData, trainLights);

    requestAnimationFrame(() => this._loop());
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
    
    // Scale 1.0 UI = 0.005 actual speed
    const uiSpeed = train.speed / 0.005;
    document.getElementById('train-edit-spd').value = uiSpeed * 100;
    document.getElementById('train-edit-spd-val').textContent = uiSpeed.toFixed(2);
    
    document.getElementById('train-edit-col').value = train.color;
    
    document.getElementById('train-edit-int').value = train.lightIntensity * 100;
    document.getElementById('train-edit-int-val').textContent = train.lightIntensity.toFixed(2);
    
    document.getElementById('train-edit-rad').value = train.lightRadius;
    document.getElementById('train-edit-rad-val').textContent = train.lightRadius.toFixed(0);
    
    document.getElementById('train-edit-light-type').value = train.lightType || 'forward';
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
    
    document.getElementById('panel-station-jp').textContent = '⚙️ SETTINGS';
    document.getElementById('panel-station-en').textContent = 'Global Controls';
    document.getElementById('panel-station-code').textContent = '';
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

  _setupControls() {
    // Header Settings Button
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
      this.selectedStation.active = true;
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

    // === Train Edit Panel Controls ===
    document.getElementById('train-edit-dir').addEventListener('click', (e) => {
      if (!this.selectedTrain) return;
      this.selectedTrain.direction *= -1;
      this.selectedTrain.triggeredStations.clear();
      e.target.textContent = this.selectedTrain.direction === 1 ? 'Forward →' : '← Reverse';
    });
    
    document.getElementById('train-edit-spd').addEventListener('input', (e) => {
      if (!this.selectedTrain) return;
      const uiSpeed = e.target.value / 100; // 0 to 2.0
      this.selectedTrain.speed = uiSpeed * 0.005; // max speed 0.01 actual
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
    
    document.getElementById('train-edit-remove').addEventListener('click', () => {
      if (!this.selectedTrain) return;
      this.trains.removeTrain(this.selectedTrain.id);
      this._closePanel();
    });

    // === Master controls ===
    document.getElementById('master-vol').addEventListener('input', (e) => {
      this.audio.setMasterVolume(e.target.value / 100);
    });
    this.audio.setMasterVolume(0.8);

    // Play/Stop
    const btnPlay = document.getElementById('btn-play');
    btnPlay.addEventListener('click', () => {
      this.running = !this.running;
      btnPlay.textContent = this.running ? '⏸' : '▶';
      btnPlay.classList.toggle('btn--active', this.running);
      if (this.running) {
        this.lastTime = performance.now();
        this._loop();
      } else {
        this.audio.stopAll();
      }
    });
    btnPlay.textContent = '⏸';
    btnPlay.classList.add('btn--active');

    // Add/Remove train
    document.getElementById('btn-add-train').addEventListener('click', () => {
      const uiSpeed = parseFloat(document.getElementById('speed-slider').value) / 100; // 0 to 2 scaling
      const actualSpeed = uiSpeed * 0.005;
      this.trains.addTrain(actualSpeed, this.globalDirection, this._onTrainClack);
      this._renderTrainControls();
    });
    
    // Duplicate button inside the settings panel
    document.getElementById('btn-add-train-panel').addEventListener('click', () => {
      const uiSpeed = parseFloat(document.getElementById('speed-slider').value) / 100;
      const actualSpeed = uiSpeed * 0.005;
      this.trains.addTrain(actualSpeed, this.globalDirection, this._onTrainClack);
      this._renderTrainControls();
    });
    
    document.getElementById('btn-remove-train').addEventListener('click', () => {
      this.trains.removeLastTrain();
      this._renderTrainControls();
      if (this.selectedTrain && !this.trains.getAll().find(t => t.id === this.selectedTrain.id)) {
        this._closePanel();
      }
    });

    // UI Speed mapping: Slider 1 to 200 (0.01 to 2.0). 1.0 represents standard actual speed 0.005.
    const speedSlider = document.getElementById('speed-slider');
    const speedValue = document.getElementById('speed-value');
    speedSlider.max = 200;
    speedSlider.value = 25;
    speedValue.textContent = '0.25';
    
    speedSlider.addEventListener('input', (e) => {
      const uiSpeed = e.target.value / 100;
      const actualSpeed = uiSpeed * 0.005;
      speedValue.textContent = uiSpeed.toFixed(2);
      for (const train of this.trains.getAll()) {
        train.speed = actualSpeed;
      }
      
      // Update UI for selected train if panel open
      if (this.selectedTrain) {
        document.getElementById('train-edit-spd').value = e.target.value;
        document.getElementById('train-edit-spd-val').textContent = uiSpeed.toFixed(2);
      }
    });

    // Direction toggle
    const btnDir = document.getElementById('btn-direction');
    btnDir.addEventListener('click', () => {
      this.globalDirection *= -1;
      btnDir.textContent = this.globalDirection === 1 ? 'CW →' : '← CCW';
      btnDir.classList.toggle('btn--active', this.globalDirection === -1);
      for (const train of this.trains.getAll()) {
        train.direction = this.globalDirection;
        train.triggeredStations.clear();
      }
    });

    // === Rhythm Drone (traqueteo) controls ===
    const droneToggle = document.getElementById('btn-drone');
    droneToggle.addEventListener('click', () => {
      this.rhythmEnabled = !this.rhythmEnabled;
      droneToggle.classList.toggle('btn--active', this.rhythmEnabled);
    });
    droneToggle.classList.add('btn--active'); // starts on

    document.getElementById('drone-vol').addEventListener('input', (e) => {
      document.getElementById('drone-vol-val').textContent = (e.target.value / 100).toFixed(2);
    });

    // === Environment (Walls) controls ===
    const btnSolid = document.getElementById('wall-type-solid');
    const btnDashed = document.getElementById('wall-type-dashed');
    
    btnSolid.addEventListener('click', () => {
      this.bg.setWallType('solid');
      btnSolid.classList.add('btn--active');
      btnDashed.classList.remove('btn--active');
    });
    
    btnDashed.addEventListener('click', () => {
      this.bg.setWallType('dashed');
      btnDashed.classList.add('btn--active');
      btnSolid.classList.remove('btn--active');
    });
    
    document.getElementById('btn-clear-walls').addEventListener('click', () => {
      this.bg.clearWalls();
    });

    document.getElementById('drone-freq').addEventListener('input', (e) => {
      document.getElementById('drone-freq-val').textContent = e.target.value + 'Hz';
    });

    // Controls panel toggle
    document.getElementById('btn-controls').addEventListener('click', () => {
      const panel = document.getElementById('station-panel');
      if (panel.classList.contains('open')) {
        this._closePanel();
      }
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
      const item = document.createElement('div');
      item.className = 'train-item';

      item.innerHTML = `
        <div class="train-item__color" style="background: ${train.color}"></div>
        <span class="train-item__id">T${i + 1}</span>
        
        <div style="flex:1; display:flex; flex-direction:column; gap:4px;">
          <div class="slider-row">
            <label style="min-width:30px;">Spd</label>
            <input type="range" class="train-speed" data-train-id="${train.id}" min="1" max="200" value="${Math.round(train.speed / 0.005 * 100)}" style="flex:1;">
            <span class="value train-speed-val" style="min-width:30px;">${(train.speed / 0.005).toFixed(2)}</span>
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
        </div>
        
        <div style="display:flex; flex-direction:column; gap:4px;">
          <button class="btn btn--small train-dir" data-train-id="${train.id}" title="Toggle direction">
            ${train.direction === 1 ? '→' : '←'}
          </button>
          <button class="btn btn--small train-remove" data-train-id="${train.id}" title="Remove">✕</button>
        </div>
      `;

      container.appendChild(item);

      // Per-train speed
      item.querySelector('.train-speed').addEventListener('input', (e) => {
        const uiSpeed = e.target.value / 100;
        train.speed = uiSpeed * 0.005;
        item.querySelector('.train-speed-val').textContent = uiSpeed.toFixed(2);
        
        // Keep synced with focused panel if open
        if (this.selectedTrain && this.selectedTrain.id === train.id) {
          document.getElementById('train-edit-spd').value = e.target.value;
          document.getElementById('train-edit-spd-val').textContent = uiSpeed.toFixed(2);
        }
      });

      // Per-train light intensity
      item.querySelector('.train-light-int').addEventListener('input', (e) => {
        train.lightIntensity = e.target.value / 100;
        item.querySelector('.train-light-int-val').textContent = train.lightIntensity.toFixed(2);
      });

      // Per-train light radius
      item.querySelector('.train-light-rad').addEventListener('input', (e) => {
        train.lightRadius = parseFloat(e.target.value);
        item.querySelector('.train-light-rad-val').textContent = Math.round(train.lightRadius);
      });

      // Per-train direction
      item.querySelector('.train-dir').addEventListener('click', () => {
        train.direction *= -1;
        train.triggeredStations.clear();
        item.querySelector('.train-dir').textContent = train.direction === 1 ? '→' : '←';
      });

      // Per-train remove
      item.querySelector('.train-remove').addEventListener('click', () => {
        this.trains.removeTrain(train.id);
        this._renderTrainControls();
      });
    });
  }
}

// Bootstrap
const app = new App();
app.init().catch(console.error);
