/**
 * TRENFASE — Trim Editor
 * Waveform display with draggable trim handles
 */

class TrimEditor {
  constructor(containerId, audioEngine) {
    this.container = document.getElementById(containerId);
    this.audioEngine = audioEngine;
    this.station = null;
    this.canvas = null;
    this.ctx = null;
    this.handleStart = null;
    this.handleEnd = null;
    this.selection = null;
    this.isDragging = null; // 'start', 'end', 'selection'
    this.dragStartX = 0;
    this.selStartAtDrag = 0;
    this.selEndAtDrag = 0;

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
  }

  open(station) {
    this.station = station;
    this.container.style.display = 'block';
    this._buildUI();
    this._drawWaveform();
    this._updatePositions();
  }

  close() {
    this.station = null;
    this.container.style.display = 'none';
  }

  _buildUI() {
    this.container.innerHTML = '';

    // Waveform canvas container
    const waveContainer = document.createElement('div');
    waveContainer.className = 'waveform-container';
    waveContainer.id = 'waveform-container';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'waveform-canvas';
    waveContainer.appendChild(this.canvas);

    // Selection overlay
    this.selection = document.createElement('div');
    this.selection.className = 'trim-selection';
    waveContainer.appendChild(this.selection);

    // Start handle
    this.handleStart = document.createElement('div');
    this.handleStart.className = 'trim-handle trim-handle--start';
    this.handleStart.addEventListener('mousedown', (e) => this._startDrag(e, 'start'));
    waveContainer.appendChild(this.handleStart);

    // End handle
    this.handleEnd = document.createElement('div');
    this.handleEnd.className = 'trim-handle trim-handle--end';
    this.handleEnd.addEventListener('mousedown', (e) => this._startDrag(e, 'end'));
    waveContainer.appendChild(this.handleEnd);

    // Selection drag
    this.selection.style.pointerEvents = 'auto';
    this.selection.style.cursor = 'grab';
    this.selection.addEventListener('mousedown', (e) => this._startDrag(e, 'selection'));

    this.container.appendChild(waveContainer);

    // Preview button
    const previewBtn = document.createElement('button');
    previewBtn.className = 'btn btn--small';
    previewBtn.textContent = '▶ Preview';
    previewBtn.style.marginTop = '8px';
    previewBtn.addEventListener('click', () => this._preview());
    this.container.appendChild(previewBtn);
  }

  _drawWaveform() {
    if (!this.station || !this.canvas) return;

    const waveData = this.audioEngine.getWaveformData(this.station.id);
    if (waveData.length === 0) return;

    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;

    const ctx = this.canvas.getContext('2d');
    const { width, height } = this.canvas;

    ctx.clearRect(0, 0, width, height);

    // Draw waveform
    const step = Math.max(1, Math.floor(waveData.length / width));
    const mid = height / 2;

    ctx.beginPath();
    ctx.strokeStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-waveform').trim() || 'rgba(245,240,225,0.5)';
    ctx.lineWidth = 1;

    for (let x = 0; x < width; x++) {
      const sampleIndex = Math.floor((x / width) * waveData.length);
      // Get min/max in this bucket for better visualization
      let min = 1, max = -1;
      for (let j = 0; j < step; j++) {
        const idx = sampleIndex + j;
        if (idx < waveData.length) {
          if (waveData[idx] < min) min = waveData[idx];
          if (waveData[idx] > max) max = waveData[idx];
        }
      }
      ctx.moveTo(x, mid + min * mid);
      ctx.lineTo(x, mid + max * mid);
    }
    ctx.stroke();
  }

  _updatePositions() {
    if (!this.station || !this.canvas) return;

    const duration = this.audioEngine.getDuration(this.station.id);
    if (duration === 0) return;

    const containerWidth = this.canvas.parentElement.getBoundingClientRect().width;
    const startPx = ((this.station.trimStart || 0) / duration) * containerWidth;
    const endVal = this.station.trimEnd != null ? this.station.trimEnd : duration;
    const endPx = (endVal / duration) * containerWidth;

    this.handleStart.style.left = `${startPx}px`;
    this.handleEnd.style.left = `${endPx}px`;
    this.selection.style.left = `${startPx}px`;
    this.selection.style.width = `${endPx - startPx}px`;
  }

  _startDrag(e, type) {
    e.preventDefault();
    this.isDragging = type;
    this.dragStartX = e.clientX;

    if (type === 'selection') {
      this.selStartAtDrag = this.station.trimStart || 0;
      this.selEndAtDrag = this.station.trimEnd != null
        ? this.station.trimEnd
        : this.audioEngine.getDuration(this.station.id);
    }

    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mouseup', this._onMouseUp);
  }

  _onMouseMove(e) {
    if (!this.isDragging || !this.station) return;

    const duration = this.audioEngine.getDuration(this.station.id);
    const containerRect = this.canvas.parentElement.getBoundingClientRect();
    const containerWidth = containerRect.width;

    if (this.isDragging === 'start') {
      const localX = Math.max(0, Math.min(e.clientX - containerRect.left, containerWidth));
      this.station.trimStart = (localX / containerWidth) * duration;
    } else if (this.isDragging === 'end') {
      const localX = Math.max(0, Math.min(e.clientX - containerRect.left, containerWidth));
      this.station.trimEnd = (localX / containerWidth) * duration;
    } else if (this.isDragging === 'selection') {
      const deltaX = e.clientX - this.dragStartX;
      const deltaSec = (deltaX / containerWidth) * duration;
      const selDuration = this.selEndAtDrag - this.selStartAtDrag;

      let newStart = this.selStartAtDrag + deltaSec;
      let newEnd = this.selEndAtDrag + deltaSec;

      // Clamp
      if (newStart < 0) { newStart = 0; newEnd = selDuration; }
      if (newEnd > duration) { newEnd = duration; newStart = duration - selDuration; }

      this.station.trimStart = newStart;
      this.station.trimEnd = newEnd;
    }

    // Ensure start < end
    if (this.station.trimEnd != null && this.station.trimStart > this.station.trimEnd) {
      [this.station.trimStart, this.station.trimEnd] = [this.station.trimEnd, this.station.trimStart];
    }

    this._updatePositions();
  }

  _onMouseUp() {
    this.isDragging = null;
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);
  }

  _preview() {
    if (!this.station) return;
    this.audioEngine.play(this.station, false);
  }
}

export { TrimEditor };
