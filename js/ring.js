/**
 * TRENFASE — Ring Renderer v2
 * Rounded rectangle path that adapts to screen size
 * Stations distributed evenly along the path
 */

class Ring {
  constructor(containerId, stations, onStationClick, onTrainClick) {
    this.container = document.getElementById(containerId);
    this.stations = stations;
    this.onStationClick = onStationClick;
    this.onTrainClick = onTrainClick;
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
  }

  render() {
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;

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

    // Create SVG
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    this.svg.setAttribute('class', 'ring-svg');
    this.svg.setAttribute('id', 'ring-svg');

    // Draw the rounded rectangle track
    const pathD = `M ${x1 + r} ${y1}
      L ${x2 - r} ${y1}
      A ${r} ${r} 0 0 1 ${x2} ${y1 + r}
      L ${x2} ${y2 - r}
      A ${r} ${r} 0 0 1 ${x2 - r} ${y2}
      L ${x1 + r} ${y2}
      A ${r} ${r} 0 0 1 ${x1} ${y2 - r}
      L ${x1} ${y1 + r}
      A ${r} ${r} 0 0 1 ${x1 + r} ${y1}
      Z`;

    const track = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    track.setAttribute('d', pathD);
    track.setAttribute('class', 'ring-track');
    this.svg.appendChild(track);

    // Precompute path segments for point-at-t lookups
    this._precomputePath(x1, y1, x2, y2, r);

    // Draw stations
    this.stations.forEach((station) => {
      const pos = this._getPointAtT(station.t);
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('class', 'station-group');
      group.setAttribute('data-station', station.id);

      // Station dot
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', pos.x);
      dot.setAttribute('cy', pos.y);
      dot.setAttribute('r', 6);
      dot.setAttribute('class', 'station-dot station--active');
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
      const labelPos = this._getLabelPosition(pos, station.t);
      label.setAttribute('x', labelPos.x);
      label.setAttribute('y', labelPos.y);
      label.setAttribute('class', 'station-label');
      label.setAttribute('text-anchor', labelPos.anchor);
      label.setAttribute('dominant-baseline', labelPos.baseline);
      label.textContent = station.nameJp;

      hitArea.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onStationClick) this.onStationClick(station);
      });

      group.appendChild(dot);
      group.appendChild(label);
      group.appendChild(hitArea);
      this.svg.appendChild(group);

      this.stationElements.set(station.id, dot);
      this.labelElements.set(station.id, label);
    });

    this.container.innerHTML = '';
    this.container.appendChild(this.svg);
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

  /**
   * Get x, y position for a parametric value t (0-1) along the rounded rect path
   */
  _getPointAtT(t) {
    // Wrap t
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
    return this._getPointAtT(station.t);
  }
}

export { Ring };
