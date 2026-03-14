/**
 * TRENFASE — Ring Renderer v2
 * Rounded rectangle path that adapts to screen size
 * Stations distributed evenly along the path
 */

class Ring {
  constructor(containerId, stations, onStationClick, onTrainClick, options = {}) {
    this.container = document.getElementById(containerId);
    this.stations = stations;
    this.onStationClick = onStationClick;
    this.onTrainClick = onTrainClick;
    this.options = options;
    this.svg = null;
    this.width = 0;
    this.height = 0;
    this.padding = 60;
    this.cornerRadius = 60;
    this.stationElements = new Map();
    this.trainElements = new Map();
    this.labelElements = new Map();
    this.pathLength = 0;
    this.pathPoints = []; // precomputed points along the path
    this.totalLength = 0;
    this.latestTrains = [];
    this.mode = options.mode || 'yamanote';

    this._onWindowPointerMove = this._onWindowPointerMove.bind(this);
    this._onWindowPointerUp = this._onWindowPointerUp.bind(this);
    this.dragState = null;
    window.addEventListener('pointermove', this._onWindowPointerMove);
    window.addEventListener('pointerup', this._onWindowPointerUp);
  }

  render() {
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    this.stationElements.clear();
    this.labelElements.clear();
    this.trainElements.clear();

    const dynamicStations = this.stations.filter((s) => s && s.x != null && s.y != null);
    const useDynamicTrack = this.mode === 'creator' && dynamicStations.length > 0;

    // Create SVG
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    this.svg.setAttribute('class', 'ring-svg');
    this.svg.setAttribute('id', 'ring-svg');

    let pathD = '';
    if (useDynamicTrack) {
      this._precomputeDynamicPath(dynamicStations);
      pathD = this._pathPointsToSvgD(this.pathPoints);
    } else {
      const pad = this.padding;
      const r = this.cornerRadius;
      const x1 = pad;
      const y1 = pad;
      const x2 = this.width - pad;
      const y2 = this.height - pad;
      const w = x2 - x1;
      const h = y2 - y1;

      // Compute perimeter of rounded rectangle
      const straightH = w - 2 * r;
      const straightV = h - 2 * r;
      const cornerArc = (Math.PI / 2) * r;
      this.pathLength = 2 * straightH + 2 * straightV + 4 * cornerArc;

      // Draw the rounded rectangle track
      pathD = `M ${x1 + r} ${y1}
      L ${x2 - r} ${y1}
      A ${r} ${r} 0 0 1 ${x2} ${y1 + r}
      L ${x2} ${y2 - r}
      A ${r} ${r} 0 0 1 ${x2 - r} ${y2}
      L ${x1 + r} ${y2}
      A ${r} ${r} 0 0 1 ${x1} ${y2 - r}
      L ${x1} ${y1 + r}
      A ${r} ${r} 0 0 1 ${x1 + r} ${y1}
      Z`;

      this._precomputePath(x1, y1, x2, y2, r);
    }

    const track = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    track.setAttribute('d', pathD);
    track.setAttribute('class', 'ring-track');
    this.svg.appendChild(track);

    // Draw stations
    this.stations.forEach((station) => {
      const isManual = (station.x != null && station.y != null);
      const pos = isManual ? { x: station.x, y: station.y } : this._getPointAtT(station.t);
      
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('class', 'station-group');
      group.setAttribute('data-station', station.id);

      // Station dot
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', pos.x);
      dot.setAttribute('cy', pos.y);
      dot.setAttribute('r', 6);
      const stateClass = station.ghost ? 'station--ghost' : (station.active ? 'station--active' : 'station--inactive');
      dot.setAttribute('class', `station-dot ${stateClass}`);
      dot.setAttribute('id', `station-${station.id}`);

      // Hit area
      const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      hitArea.setAttribute('cx', pos.x);
      hitArea.setAttribute('cy', pos.y);
      hitArea.setAttribute('r', 16);
      hitArea.setAttribute('class', 'station-hit');
      hitArea.style.fill = 'transparent';
      hitArea.style.cursor = 'pointer';

      // Label
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      const labelPos = isManual 
        ? { x: pos.x, y: pos.y + 18, anchor: 'middle', baseline: 'hanging' } 
        : this._getLabelPosition(pos, station.t);
        
      label.setAttribute('x', labelPos.x);
      label.setAttribute('y', labelPos.y);
      label.setAttribute('class', 'station-label');
      label.setAttribute('text-anchor', labelPos.anchor);
      label.setAttribute('dominant-baseline', labelPos.baseline);
      label.textContent = station.name || station.nameJp; // fallback to generic name if jp undefined

      hitArea.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onStationClick) this.onStationClick(station);
      });

      if (isManual && this.options.enableStationDragging) {
        hitArea.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.dragState = {
            station,
            pointerStartX: e.clientX,
            pointerStartY: e.clientY,
            stationStartX: station.x,
            stationStartY: station.y,
            moved: false
          };
          if (this.onStationClick) this.onStationClick(station);
        });
      }

      group.appendChild(dot);
      group.appendChild(label);
      group.appendChild(hitArea);
      this.svg.appendChild(group);

      this.stationElements.set(station.id, dot);
      this.labelElements.set(station.id, label);
    });

    this.container.innerHTML = '';
    this.container.appendChild(this.svg);
    if (this.latestTrains.length > 0) {
      this.updateTrains(this.latestTrains);
    }
  }

  _onWindowPointerMove(e) {
    if (!this.dragState) return;
    const dx = e.clientX - this.dragState.pointerStartX;
    const dy = e.clientY - this.dragState.pointerStartY;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      this.dragState.moved = true;
    }

    const margin = 18;
    this.dragState.station.x = Math.max(margin, Math.min(this.width - margin, this.dragState.stationStartX + dx));
    this.dragState.station.y = Math.max(margin, Math.min(this.height - margin, this.dragState.stationStartY + dy));
    this.render();
    if (typeof this.options.onStationMoved === 'function') {
      this.options.onStationMoved(this.dragState.station);
    }
  }

  _onWindowPointerUp() {
    if (!this.dragState) return;
    const drag = this.dragState;
    this.dragState = null;
    if (drag.moved && typeof this.options.onStationDragEnd === 'function') {
      this.options.onStationDragEnd(drag.station);
    }
  }

  /**
   * Precompute the rounded rectangle path as segments
   * Starting from top-left corner, going clockwise
   */
  _precomputePath(x1, y1, x2, y2, r) {
    // Segments: [type, ...params, length]
    // type: 'line' or 'arc'
    this.segments = [];
    let cumLength = 0;

    const straightH = (x2 - x1) - 2 * r;
    const straightV = (y2 - y1) - 2 * r;
    const cornerArc = (Math.PI / 2) * r;

    // Top edge (left to right)
    this.segments.push({ type: 'line', x1: x1 + r, y1: y1, x2: x2 - r, y2: y1, start: cumLength, length: straightH });
    cumLength += straightH;

    // Top-right corner
    this.segments.push({ type: 'arc', cx: x2 - r, cy: y1 + r, r, startAngle: -Math.PI / 2, endAngle: 0, start: cumLength, length: cornerArc });
    cumLength += cornerArc;

    // Right edge (top to bottom)
    this.segments.push({ type: 'line', x1: x2, y1: y1 + r, x2: x2, y2: y2 - r, start: cumLength, length: straightV });
    cumLength += straightV;

    // Bottom-right corner
    this.segments.push({ type: 'arc', cx: x2 - r, cy: y2 - r, r, startAngle: 0, endAngle: Math.PI / 2, start: cumLength, length: cornerArc });
    cumLength += cornerArc;

    // Bottom edge (right to left)
    this.segments.push({ type: 'line', x1: x2 - r, y1: y2, x2: x1 + r, y2: y2, start: cumLength, length: straightH });
    cumLength += straightH;

    // Bottom-left corner
    this.segments.push({ type: 'arc', cx: x1 + r, cy: y2 - r, r, startAngle: Math.PI / 2, endAngle: Math.PI, start: cumLength, length: cornerArc });
    cumLength += cornerArc;

    // Left edge (bottom to top)
    this.segments.push({ type: 'line', x1: x1, y1: y2 - r, x2: x1, y2: y1 + r, start: cumLength, length: straightV });
    cumLength += straightV;

    // Top-left corner
    this.segments.push({ type: 'arc', cx: x1 + r, cy: y1 + r, r, startAngle: Math.PI, endAngle: Math.PI * 1.5, start: cumLength, length: cornerArc });
    cumLength += cornerArc;

    this.totalLength = cumLength;
  }

  _pathPointsToSvgD(points) {
    if (!Array.isArray(points) || points.length < 2) return '';
    const [first, ...rest] = points;
    let d = `M ${first.x} ${first.y}`;
    for (const p of rest) {
      d += ` L ${p.x} ${p.y}`;
    }
    d += ' Z';
    return d;
  }

  _distance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  _sampleClosedSpline(points, samplesPerSegment = 24) {
    const out = [];
    const n = points.length;
    if (n < 2) return out;

    const at = (i) => points[(i + n) % n];
    for (let i = 0; i < n; i++) {
      const p0 = at(i - 1);
      const p1 = at(i);
      const p2 = at(i + 1);
      const p3 = at(i + 2);

      for (let j = 0; j < samplesPerSegment; j++) {
        const t = j / samplesPerSegment;
        const t2 = t * t;
        const t3 = t2 * t;
        const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
        const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
        out.push({ x, y });
      }
    }

    return out;
  }

  _precomputeDynamicPath(stations) {
    this.segments = [];
    this.pathPoints = [];
    this.totalLength = 0;

    if (stations.length === 1) {
      // Single-station loop must pass through the station center.
      const s = stations[0];
      const radius = 95;
      const cx = s.x + radius;
      const cy = s.y;
      const samples = 120;
      for (let i = 0; i < samples; i++) {
        const a = (i / samples) * Math.PI * 2;
        this.pathPoints.push({
          x: cx + Math.cos(a) * radius,
          y: cy + Math.sin(a) * radius
        });
      }
    } else if (stations.length === 2) {
      // Two-station path must cross both station centers.
      const a = stations[0];
      const b = stations[1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const nx = -dy / len;
      const ny = dx / len;
      const offset = Math.max(80, len * 0.28);
      const m1 = {
        x: (a.x + b.x) * 0.5 + nx * offset,
        y: (a.y + b.y) * 0.5 + ny * offset
      };
      const m2 = {
        x: (a.x + b.x) * 0.5 - nx * offset,
        y: (a.y + b.y) * 0.5 - ny * offset
      };
      this.pathPoints = this._sampleClosedSpline([
        { x: a.x, y: a.y },
        m1,
        { x: b.x, y: b.y },
        m2
      ], 34);
    } else {
      const centroid = stations.reduce((acc, s) => ({ x: acc.x + s.x, y: acc.y + s.y }), { x: 0, y: 0 });
      centroid.x /= stations.length;
      centroid.y /= stations.length;

      const sorted = [...stations].sort((a, b) => {
        const aa = Math.atan2(a.y - centroid.y, a.x - centroid.x);
        const bb = Math.atan2(b.y - centroid.y, b.x - centroid.x);
        return aa - bb;
      });

      this.pathPoints = this._sampleClosedSpline(sorted.map((s) => ({ x: s.x, y: s.y })), 22);
    }

    const n = this.pathPoints.length;
    if (n < 2) return;

    let cumulative = 0;
    for (let i = 0; i < n; i++) {
      const p1 = this.pathPoints[i];
      const p2 = this.pathPoints[(i + 1) % n];
      const len = this._distance(p1, p2);
      this.segments.push({
        type: 'line',
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        start: cumulative,
        length: len
      });
      cumulative += len;
    }
    this.totalLength = cumulative;
    this.pathLength = cumulative;
  }

  /**
   * Get x, y position for a parametric value t (0-1) along the rounded rect path
   */
  _getPointAtT(t) {
    // Wrap t
    if (!this.totalLength || !this.segments || this.segments.length === 0) {
      return { x: this.width * 0.5, y: this.height * 0.5 };
    }
    t = ((t % 1) + 1) % 1;
    const dist = t * this.totalLength;

    for (const seg of this.segments) {
      if (dist >= seg.start && dist < seg.start + seg.length) {
        const localT = (dist - seg.start) / seg.length;

        if (seg.type === 'line') {
          return {
            x: seg.x1 + (seg.x2 - seg.x1) * localT,
            y: seg.y1 + (seg.y2 - seg.y1) * localT
          };
        } else {
          // Arc
          const angle = seg.startAngle + (seg.endAngle - seg.startAngle) * localT;
          return {
            x: seg.cx + seg.r * Math.cos(angle),
            y: seg.cy + seg.r * Math.sin(angle)
          };
        }
      }
    }

    // Fallback: last segment
    const lastSeg = this.segments[this.segments.length - 1];
    if (lastSeg.type === 'line') {
      return { x: lastSeg.x2, y: lastSeg.y2 };
    } else {
      return {
        x: lastSeg.cx + lastSeg.r * Math.cos(lastSeg.endAngle),
        y: lastSeg.cy + lastSeg.r * Math.sin(lastSeg.endAngle)
      };
    }
  }

  /**
   * Get the angle (in radians) of the path at t, pointing forward (clockwise)
   */
  _getAngleAtT(t) {
    const delta = 0.001;
    const p1 = this._getPointAtT(t - delta);
    const p2 = this._getPointAtT(t + delta);
    return Math.atan2(p2.y - p1.y, p2.x - p1.x);
  }

  getNearestTForPoint(x, y, sampleCount = 720) {
    if (!this.totalLength || !Number.isFinite(x) || !Number.isFinite(y)) return 0;
    let bestT = 0;
    let bestDist = Infinity;
    for (let i = 0; i < sampleCount; i++) {
      const t = i / sampleCount;
      const p = this._getPointAtT(t);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestDist) {
        bestDist = d;
        bestT = t;
      }
    }
    return bestT;
  }

  _getLabelPosition(pos, t) {
    const offset = 18;
    let x = pos.x, y = pos.y;
    let anchor = 'middle';
    let baseline = 'auto';

    // Determine which side of the rect we're on
    if (t < 0.15 || t > 0.88) {
      // Top edge — label above
      y -= offset;
      baseline = 'auto';
    } else if (t >= 0.15 && t < 0.35) {
      // Right side — label to the right
      x += offset;
      anchor = 'start';
      baseline = 'middle';
    } else if (t >= 0.35 && t < 0.62) {
      // Bottom edge — label below
      y += offset + 4;
      baseline = 'hanging';
    } else {
      // Left side — label to the left
      x -= offset;
      anchor = 'end';
      baseline = 'middle';
    }

    return { x, y, anchor, baseline };
  }

  updateStationState(station) {
    const dot = this.stationElements.get(station.id);
    if (!dot) return;

    dot.classList.remove('station--active', 'station--inactive', 'station--ghost', 'station--playing');

    if (station.ghost) {
      dot.classList.add('station--ghost');
    } else if (station.active) {
      dot.classList.add('station--active');
    } else {
      dot.classList.add('station--inactive');
    }
  }

  flashStation(stationId) {
    const dot = this.stationElements.get(stationId);
    if (!dot) return;
    dot.classList.add('station--playing');
    setTimeout(() => dot.classList.remove('station--playing'), 600);
  }

  updateTrains(trains) {
    this.latestTrains = trains || [];
    for (const [id, el] of this.trainElements) {
      if (!trains.find(t => t.id === id)) {
        el.remove();
        this.trainElements.delete(id);
      }
    }

    for (const train of trains) {
      let el = this.trainElements.get(train.id);
      if (!el) {
        el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        el.setAttribute('r', 16); // Larger click area
        el.setAttribute('class', 'train-dot');
        el.style.cursor = 'pointer';
        el.style.pointerEvents = 'auto'; // allow clicking

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.onTrainClick) this.onTrainClick(train);
        });

        this.svg.appendChild(el);
        this.trainElements.set(train.id, el);
      }

      // Convert train angle (0-360) to t (0-1)
      const t = train.angle / 360;
      const pos = this._getPointAtT(t);
      el.setAttribute('cx', pos.x);
      el.setAttribute('cy', pos.y);
      el.style.fill = train.color;
    }
  }

  /**
   * Get screen position of a station for background glow
   */
  getStationScreenPosition(station) {
    if (station.x != null && station.y != null) {
      return { x: station.x, y: station.y };
    }
    return this._getPointAtT(station.t);
  }
}

export { Ring };
