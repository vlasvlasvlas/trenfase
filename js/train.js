/**
 * TRENFASE — Train System
 * Train objects that move around the circle and trigger station audio
 */

let trainIdCounter = 0;

class Train {
  constructor(speed = 0.005, direction = 1, color = '#C41E3A') {
    this.id = ++trainIdCounter;
    this.angle = 0;           // current angle in degrees (0-360)
    this.speed = speed;        // degrees per frame (~60fps)
    this.direction = direction; // 1 = CW, -1 = CCW (reverse)
    this.color = color;
    this.colorRGB = this._hexToRgb(color);
    this.lightIntensity = 0.6;
    this.lightRadius = 300;
    this.lightType = 'forward'; // 'forward', 'backward', 'omni'

    // Per-train wheel/drone-like sound settings
    this.soundEnabled = true; // clack sound
    this.droneEnabled = false; // continuous drone
    this.soundVolume = 0.08;
    this.soundFrequency = 55;
    this.soundRate = 1.0;
    this.soundTone = 0.5;
    
    this.triggeredStations = new Set(); // avoid re-triggering same station
    this.triggerThreshold = 4; // degrees proximity to trigger
    
    // Rhythm tracking
    this.distanceTraveled = 0;
    this.clackIntervalBase = 0.25; // degrees between clacks at rate=1
    this.clackMinGapMsBase = 160;  // minimum spacing to avoid machine-gun at high speed
    this.clackMaxSilenceMsBase = 2200; // force a clack if moving slowly
    this.clackElapsedMs = 0;
    this.onClack = null;    // callback when a clack should occur
  }

  update(deltaTime) {
    const normalizedDelta = deltaTime / 16.67; // normalize to 60fps
    const moveDist = this.speed * normalizedDelta;
    const moveAbs = Math.abs(moveDist);
    
    this.angle += moveDist * this.direction;
    this.distanceTraveled += moveAbs;
    this.clackElapsedMs += deltaTime;

    const rate = Math.max(0.1, Math.min(4.0, this.soundRate || 1));
    const clackInterval = Math.max(0.08, this.clackIntervalBase / rate);
    const minGapMs = Math.max(60, this.clackMinGapMsBase / rate);
    const maxSilenceMs = this.clackMaxSilenceMsBase / rate;

    const isMoving = this.speed > 0.00001;
    const byDistance = this.distanceTraveled >= clackInterval;
    const bySilence = isMoving && this.clackElapsedMs >= maxSilenceMs;
    const canEmit = this.clackElapsedMs >= minGapMs;

    if (this.soundEnabled && isMoving && canEmit && (byDistance || bySilence)) {
      this.distanceTraveled = byDistance ? (this.distanceTraveled % clackInterval) : 0;
      this.clackElapsedMs = 0;
      if (this.onClack) this.onClack(this);
    }

    // Wrap around
    if (this.angle >= 360) {
      this.angle -= 360;
      this.triggeredStations.clear();
    }
    if (this.angle < 0) {
      this.angle += 360;
      this.triggeredStations.clear();
    }
  }

  /**
   * Check if the train is close enough to trigger a station
   * @param {Object} station - Station with .angle or explicit x,y properties
   * @param {Object} trainPos - (Optional) The current {x,y} screen coordinates of the train
   * @returns {boolean}
   */
  shouldTrigger(station, trainPos = null) {
    if (this.triggeredStations.has(station.id)) return false;

    // Euclidean distance check for explicit (x,y) Creator mode stations
    if (trainPos && station.x != null && station.y != null) {
      const dx = trainPos.x - station.x;
      const dy = trainPos.y - station.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // If the train is within the station's ring radius (plus a bit of tolerance), trigger it
      const triggerDist = (station.ringRadius || 15) + 10;
      if (dist < triggerDist) {
        this.triggeredStations.add(station.id);
        return true;
      }
      return false;
    }

    // Fallback/Yamanote Mode: Angle based trigger
    if (station.angle != null) {
      const diff = Math.abs(this.angle - station.angle);
      const wrappedDiff = Math.min(diff, 360 - diff);

      if (wrappedDiff < this.triggerThreshold) {
        this.triggeredStations.add(station.id);
        return true;
      }
    }
    
    return false;
  }

  // Helper
  _hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? 
      `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` 
      : '196, 30, 58';
  }
}

class TrainManager {
  constructor() {
    this.trains = [];
    this.maxTrains = 5;
    this.colors = ['#C41E3A', '#2E5AA7', '#4A9B3F', '#C8A951', '#8B4DAB'];
  }

  addTrain(speed = 0.005, direction = 1, onClack = null) {
    if (this.trains.length >= this.maxTrains) return null;
    const color = this.colors[this.trains.length % this.colors.length];
    const train = new Train(speed, direction, color);
    train.onClack = onClack;
    this.trains.push(train);
    return train;
  }

  removeTrain(id) {
    this.trains = this.trains.filter(t => t.id !== id);
  }

  removeLastTrain() {
    if (this.trains.length > 0) {
      this.trains.pop();
    }
  }

  updateAll(deltaTime) {
    for (const train of this.trains) {
      train.update(deltaTime);
    }
  }

  getAll() {
    return this.trains;
  }
}

export { Train, TrainManager };
