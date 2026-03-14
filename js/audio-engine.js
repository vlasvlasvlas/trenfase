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

    const buffer = reverse
      ? this.reverseBuffers.get(station.id)
      : this.buffers.get(station.id);
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

  // === Drone System ===

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
  playTrainClack(volume = 1.0, pitch = 1.0) {
    if (!this.ctx || volume <= 0.01) return;
    
    const t = this.ctx.currentTime;
    
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
    noiseFilter.frequency.value = 1000 * pitch;
    noiseFilter.Q.value = 1.5;
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(volume * 0.3, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterBus);
    
    // 2. Low thump (impact)
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    // pitch bend down
    osc.frequency.setValueAtTime(150 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.05);
    
    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(volume * 0.8, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    
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
