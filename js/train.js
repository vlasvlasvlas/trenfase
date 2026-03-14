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
    
    this.triggeredStations = new Set(); // avoid re-triggering same station
    this.triggerThreshold = 4; // degrees proximity to trigger
    
    // Rhythm tracking
    this.distanceTraveled = 0;
    this.clackInterval = 6; // degrees of movement between clacks
    this.onClack = null;    // callback when a clack should occur
  }

  update(deltaTime) {
    const normalizedDelta = deltaTime / 16.67; // normalize to 60fps
    const moveDist = this.speed * normalizedDelta;
    
    this.angle += moveDist * this.direction;
    this.distanceTraveled += moveDist;

    if (this.distanceTraveled >= this.clackInterval) {
      this.distanceTraveled -= this.clackInterval;
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
   * @param {Object} station - Station with .angle property
   * @returns {boolean}
   */
  shouldTrigger(station) {
    if (this.triggeredStations.has(station.id)) return false;

    const diff = Math.abs(this.angle - station.angle);
    const wrappedDiff = Math.min(diff, 360 - diff);

    if (wrappedDiff < this.triggerThreshold) {
      this.triggeredStations.add(station.id);
      return true;
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
