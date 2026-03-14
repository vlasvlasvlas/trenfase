/**
 * TRENFASE — Audio Engine v2
 * Web Audio API: load, play, trim, reverse, per-station FX (delay, filter, reverb)
 * + ambient drone generator
 */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.reverseBuffers = new Map();
    this.activeSources = new Map();
    this.masterGain = null;
    this.analyser = null;
    this.masterBus = null;

    // Drone
    this.droneOscillators = [];
    this.droneGain = null;
    this.droneFilter = null;
    this.droneRunning = false;

    // Per-train Continuous Drones
    this.trainDrones = new Map();
  }

  init() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Master bus → analyser → master gain → destination
    this.masterBus = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.masterGain = this.ctx.createGain();

    this.masterBus.connect(this.analyser);
    this.analyser.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // Setup drone
    this._setupDrone();
  }

  async loadAll(stations) {
    if (!this.ctx) this.init();

    const loadPromises = stations.map(async (station) => {
      try {
        const response = await fetch(station.audioFile);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
        this.buffers.set(station.id, audioBuffer);
        const reversed = this._reverseBuffer(audioBuffer);
        this.reverseBuffers.set(station.id, reversed);
      } catch (e) {
        console.warn(`Failed to load audio for ${station.id}:`, e);
      }
    });

    await Promise.all(loadPromises);
    console.log(`Loaded ${this.buffers.size} audio buffers`);
  }

  /**
   * Play a station's audio with trim, pitch, volume, and per-station FX
   */
  play(station, reverse = false) {
    if (!this.ctx) return null;

    const audioKey = station.customAudioId || station.id;

    const buffer = reverse
      ? this.reverseBuffers.get(audioKey) || this.reverseBuffers.get(String(audioKey)) || this.buffers[audioKey]
      : this.buffers.get(audioKey) || this.buffers.get(String(audioKey)) || this.buffers[audioKey];
    if (!buffer) return null;

    this.stop(station.id);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = station.pitch;

    // === Per-station FX chain ===
    // source → gainNode → filterNode → delayNode → masterBus

    // 1. Gain
    const gainNode = this.ctx.createGain();
    gainNode.gain.value = station.volume;

    // 2. Filter (lowpass/highpass)
    const filterNode = this.ctx.createBiquadFilter();
    const fx = station.fx || {};
    filterNode.type = fx.filterType || 'lowpass';
    filterNode.frequency.value = fx.filterFreq != null ? fx.filterFreq : 20000;
    filterNode.Q.value = fx.filterQ != null ? fx.filterQ : 1;

    // 3. Delay with feedback
    const delayNode = this.ctx.createDelay(5.0);
    delayNode.delayTime.value = fx.delayTime || 0;
    const delayFeedback = this.ctx.createGain();
    delayFeedback.gain.value = fx.delayFeedback || 0;
    const delayDry = this.ctx.createGain();
    delayDry.gain.value = 1;
    const delayWet = this.ctx.createGain();
    delayWet.gain.value = fx.delayWet || 0;

    // Connect FX chain
    source.connect(gainNode);
    gainNode.connect(filterNode);

    // Dry signal
    filterNode.connect(delayDry);
    delayDry.connect(this.masterBus);

    // Delay (wet) signal
    filterNode.connect(delayNode);
    delayNode.connect(delayFeedback);
    delayFeedback.connect(delayNode); // feedback loop
    delayNode.connect(delayWet);
    delayWet.connect(this.masterBus);

    // Calculate trim
    const duration = buffer.duration;
    let offset = station.trimStart || 0;
    let playDuration = (station.trimEnd != null ? station.trimEnd : duration) - offset;

    if (reverse) {
      const end = station.trimEnd != null ? station.trimEnd : duration;
      offset = duration - end;
      playDuration = end - (station.trimStart || 0);
    }

    offset = Math.max(0, Math.min(offset, duration));
    playDuration = Math.max(0.01, Math.min(playDuration, duration - offset));

    source.start(0, offset, playDuration);
    source.onended = () => {
      this.activeSources.delete(station.id);
    };

    this.activeSources.set(station.id, {
      source, gain: gainNode, filter: filterNode,
      delay: delayNode, delayFeedback, delayDry, delayWet
    });
    return source;
  }

  stop(stationId) {
    const active = this.activeSources.get(stationId);
    if (active) {
      try { active.source.stop(); } catch (e) {}
      try {
        active.source.disconnect();
        active.gain.disconnect();
        active.filter.disconnect();
        active.delay.disconnect();
        active.delayFeedback.disconnect();
        active.delayDry.disconnect();
        active.delayWet.disconnect();
      } catch (e) {}
      this.activeSources.delete(stationId);
    }
  }

  stopAll() {
    for (const [id] of this.activeSources) {
      this.stop(id);
    }
  }

  // === Per-Train Continuous Drone System ===

  ensureTrainDrone(trainId) {
    if (!this.ctx) return null;
    if (this.trainDrones.has(trainId)) return this.trainDrones.get(trainId);

    // Create a drone synthesizer for this train
    const droneGain = this.ctx.createGain();
    droneGain.gain.value = 0; // Starts silent

    const droneFilter = this.ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 400; // Deep rumble by default
    droneFilter.Q.value = 3;

    // 2 Oscillators for a rich, gutural drone (detuned square + sine)
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'square';
    osc1.frequency.value = 55;
    
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 54.5; // slight beating

    // Sub oscillator for deep rumble
    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.value = 27.5; // an octave below
    
    const oscGain1 = this.ctx.createGain();
    oscGain1.gain.value = 0.2;
    const oscGain2 = this.ctx.createGain();
    oscGain2.gain.value = 0.5;
    const subGain = this.ctx.createGain();
    subGain.gain.value = 0.6; // Heavy low end

    osc1.connect(oscGain1);
    osc2.connect(oscGain2);
    subOsc.connect(subGain);

    oscGain1.connect(droneFilter);
    oscGain2.connect(droneFilter);
    subGain.connect(droneFilter);

    droneFilter.connect(droneGain);
    droneGain.connect(this.masterBus);

    osc1.start();
    osc2.start();
    subOsc.start();

    // LFO tremolo — rate controlled by soundRate
    const lfoOsc = this.ctx.createOscillator();
    lfoOsc.type = 'sine';
    lfoOsc.frequency.value = 1.0; // Hz, updated from soundRate
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0; // silent until drone is running
    lfoOsc.connect(lfoGain);
    lfoGain.connect(droneGain.gain); // modulates the main gain AudioParam
    lfoOsc.start();

    const droneData = {
      gainNode: droneGain,
      filterNode: droneFilter,
      osc1, osc2, subOsc, lfoOsc, lfoGain,
      isRunning: false
    };

    this.trainDrones.set(trainId, droneData);
    return droneData;
  }

  updateTrainDrone(train) {
    if (!this.ctx) return;
    const drone = this.ensureTrainDrone(train.id);
    if (!drone) return;

    if (!train.droneEnabled || train.speed <= 0.00001) {
      // Fade out
      if (drone.isRunning) {
        drone.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
        drone.gainNode.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
        drone.lfoGain.gain.cancelScheduledValues(this.ctx.currentTime);
        drone.lfoGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
        drone.isRunning = false;
      }
      return;
    }

    // Train is moving and drone is enabled
    if (!drone.isRunning) {
      drone.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
      drone.gainNode.gain.setTargetAtTime(train.soundVolume, this.ctx.currentTime, 0.5);
      drone.isRunning = true;
    } else {
      drone.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
      drone.gainNode.gain.setTargetAtTime(train.soundVolume, this.ctx.currentTime, 0.1);
    }

    // Dynamic pitch based on train speed and configured frequency
    // Normalized speed: assuming 0 to 0.1 is normal range
    const normalizedSpeed = Math.min(1.0, train.speed / 0.05); // cap at something high
    
    // Pitch goes up as speed goes up. 
    // If speed is 0, base freq. If max speed, go up to an octave higher.
    const pitchMultiplier = 1.0 + (normalizedSpeed * 1.5); // up to 2.5x pitch modifier based on speed
    
    const baseFreq = train.soundFrequency || 55;
    const targetFreq = baseFreq * pitchMultiplier;

    drone.osc1.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
    drone.osc2.frequency.setTargetAtTime(targetFreq * 0.99, this.ctx.currentTime, 0.1); // detune
    drone.subOsc.frequency.setTargetAtTime(targetFreq * 0.5, this.ctx.currentTime, 0.1); // sub octave

    // Filter opens up as train goes faster and soundTone goes up
    const tone = train.soundTone || 0.5;
    const filterTarget = 100 + (tone * 800) + (normalizedSpeed * 2000);
    drone.filterNode.frequency.setTargetAtTime(filterTarget, this.ctx.currentTime, 0.1);

    // LFO tremolo: soundRate (0.1–4.0) maps to 0.1–8 Hz
    const rate = (train.soundRate || 1.0) * 2;
    drone.lfoOsc.frequency.setTargetAtTime(rate, this.ctx.currentTime, 0.1);
    const lfoDepth = train.soundVolume * 0.4; // tremolo depth as fraction of volume
    drone.lfoGain.gain.cancelScheduledValues(this.ctx.currentTime);
    drone.lfoGain.gain.setTargetAtTime(lfoDepth, this.ctx.currentTime, 0.1);
  }

  removeTrainDrone(trainId) {
    const drone = this.trainDrones.get(trainId);
    if (drone) {
      try { drone.gainNode.gain.cancelScheduledValues(this.ctx.currentTime); } catch(e){}
      try { drone.gainNode.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); } catch (e){}
      setTimeout(() => {
        try { drone.osc1.stop(); drone.osc1.disconnect(); } catch (e) {}
        try { drone.osc2.stop(); drone.osc2.disconnect(); } catch (e) {}
        try { drone.subOsc.stop(); drone.subOsc.disconnect(); } catch (e) {}
        try { drone.lfoOsc.stop(); drone.lfoOsc.disconnect(); } catch (e) {}
        try { drone.lfoGain.disconnect(); } catch (e) {}
        try { drone.filterNode.disconnect(); } catch (e) {}
        try { drone.gainNode.disconnect(); } catch (e) {}
        this.trainDrones.delete(trainId);
      }, 500);
    }
  }

  // === Global Ambient Drone System ===

  _setupDrone() {
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0;

    this.droneFilter = this.ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 200;
    this.droneFilter.Q.value = 2;

    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.masterBus);
  }

  startDrone(config = {}) {
    if (this.droneRunning) this.stopDrone();

    const baseFreq = config.frequency || 55; // Low A
    const volume = config.volume || 0.15;
    const filterFreq = config.filterFreq || 200;

    this.droneFilter.frequency.value = filterFreq;

    // Create layered oscillators for rich drone
    const detunes = [0, 7, -5, 12, -12];
    const types = ['sawtooth', 'sine', 'triangle', 'sine', 'sine'];

    this.droneOscillators = detunes.map((detune, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = types[i] || 'sine';
      osc.frequency.value = baseFreq;
      osc.detune.value = detune;

      const oscGain = this.ctx.createGain();
      oscGain.gain.value = i === 0 ? 0.4 : 0.15;

      osc.connect(oscGain);
      oscGain.connect(this.droneFilter);
      osc.start();

      return { osc, gain: oscGain };
    });

    // Fade in
    this.droneGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.5);
    this.droneRunning = true;
  }

  stopDrone() {
    if (!this.droneRunning) return;

    // Fade out
    this.droneGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);

    setTimeout(() => {
      this.droneOscillators.forEach(({ osc }) => {
        try { osc.stop(); } catch (e) {}
      });
      this.droneOscillators = [];
    }, 1000);

    this.droneRunning = false;
  }

  setDroneParams(params) {
    if (params.volume != null) {
      this.droneGain.gain.setTargetAtTime(params.volume, this.ctx.currentTime, 0.1);
    }
    if (params.filterFreq != null) {
      this.droneFilter.frequency.setTargetAtTime(params.filterFreq, this.ctx.currentTime, 0.1);
    }
    if (params.frequency != null && this.droneOscillators.length > 0) {
      this.droneOscillators.forEach(({ osc }) => {
        osc.frequency.setTargetAtTime(params.frequency, this.ctx.currentTime, 0.1);
      });
    }
  }

  // === Rhythmic Train Clack ===
  playTrainClack(volume = 1.0, pitch = 1.0, options = {}) {
    if (!this.ctx || volume <= 0.01) return;
    
    const t = this.ctx.currentTime;
    const tone = Math.max(0, Math.min(1, options.tone != null ? options.tone : 0.5));
    const snapFreq = (500 + tone * 2600) * pitch;
    const snapAmount = 0.12 + tone * 0.48;
    const thumpAmount = 0.95 - tone * 0.5;
    const snapDecay = 0.03 + (1 - tone) * 0.03;
    const thumpDecay = 0.06 + (1 - tone) * 0.06;
    
    // 1. Noise burst (high frequency snap of the wheels)
    const bufferSize = this.ctx.sampleRate * 0.1; // 100ms
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buffer;
    
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = snapFreq;
    noiseFilter.Q.value = 1.2 + tone * 2.4;
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(volume * snapAmount, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + snapDecay);
    
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterBus);
    
    // 2. Low thump (impact)
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    // pitch bend down
    osc.frequency.setValueAtTime((110 + tone * 120) * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.05);
    
    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(volume * thumpAmount, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + thumpDecay);
    
    osc.connect(oscGain);
    oscGain.connect(this.masterBus);
    
    noiseSource.start(t);
    osc.start(t);
    noiseSource.stop(t + 0.1);
    osc.stop(t + 0.1);
  }

  // === Utilities ===

  getDuration(stationId) {
    const buffer = this.buffers.get(stationId);
    return buffer ? buffer.duration : 0;
  }

  getWaveformData(stationId) {
    const buffer = this.buffers.get(stationId);
    if (!buffer) return new Float32Array(0);
    return buffer.getChannelData(0);
  }

  getAnalyserData() {
    if (!this.analyser) return new Uint8Array(0);
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  setMasterVolume(value) {
    if (this.masterGain) {
      this.masterGain.gain.value = value;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      return this.ctx.resume();
    }
  }

  _reverseBuffer(buffer) {
    const numChannels = buffer.numberOfChannels;
    const reversed = this.ctx.createBuffer(numChannels, buffer.length, buffer.sampleRate);
    for (let ch = 0; ch < numChannels; ch++) {
      const srcData = buffer.getChannelData(ch);
      const dstData = reversed.getChannelData(ch);
      for (let i = 0; i < srcData.length; i++) {
        dstData[i] = srcData[srcData.length - 1 - i];
      }
    }
    return reversed;
  }
}

export { AudioEngine };
