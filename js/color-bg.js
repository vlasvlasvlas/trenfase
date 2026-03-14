/**
 * TRENFASE — Color Background v2
 * Reactive background canvas driven by audio analyser data
 * Works with screen-space positions from rounded-rect ring
 */

class ColorBackground {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.glowPoints = [];
    this.walls = [];
    this.wallType = 'solid'; // 'solid' or 'dashed'
    this.wallDrawingEnabled = true;
    this.isDrawingWall = false;
    this.currentWall = null; // {x1, y1, x2, y2}

    this.resize();
    window.addEventListener('resize', () => this.resize());
    
    // Wall drawing events (Shift + Drag)
    window.addEventListener('mousedown', this._onMouseDown.bind(this));
    window.addEventListener('mousemove', this._onMouseMove.bind(this));
    window.addEventListener('mouseup', this._onMouseUp.bind(this));
  }

  _onMouseDown(e) {
    if (!this.wallDrawingEnabled) return;
    if (!e.shiftKey) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.isDrawingWall = true;
    this.currentWall = { x1: x, y1: y, x2: x, y2: y };
  }

  _onMouseMove(e) {
    if (!this.wallDrawingEnabled && this.isDrawingWall) {
      this._cancelWallDrawing();
      return;
    }
    if (!this.isDrawingWall || !this.currentWall) return;
    const rect = this.canvas.getBoundingClientRect();
    this.currentWall.x2 = e.clientX - rect.left;
    this.currentWall.y2 = e.clientY - rect.top;
  }

  _onMouseUp(e) {
    if (!this.isDrawingWall) return;
    if (!this.wallDrawingEnabled) {
      this._cancelWallDrawing();
      return;
    }
    this.isDrawingWall = false;
    
    if (this.currentWall) {
      const dx = this.currentWall.x2 - this.currentWall.x1;
      const dy = this.currentWall.y2 - this.currentWall.y1;
      const dist = Math.hypot(dx, dy);
      
      if (dist > 5) {
        if (this.wallType === 'dashed') {
          // Break the line into smaller solid segments with gaps
          const dashLen = 15;
          const gapLen = 20;
          let currentDist = 0;
          
          while (currentDist < dist) {
            const segEnd = Math.min(currentDist + dashLen, dist);
            const t1 = currentDist / dist;
            const t2 = segEnd / dist;
            
            this.walls.push({
              x1: this.currentWall.x1 + dx * t1,
              y1: this.currentWall.y1 + dy * t1,
              x2: this.currentWall.x1 + dx * t2,
              y2: this.currentWall.y1 + dy * t2
            });
            
            currentDist += dashLen + gapLen;
          }
        } else {
          // Solid wall
          this.walls.push({ ...this.currentWall });
        }
      }
      this.currentWall = null;
    }
  }

  setWallType(type) {
    this.wallType = type;
  }

  setWallDrawingEnabled(enabled) {
    this.wallDrawingEnabled = !!enabled;
    if (!this.wallDrawingEnabled) {
      this._cancelWallDrawing();
    }
  }

  _cancelWallDrawing() {
    this.isDrawingWall = false;
    this.currentWall = null;
  }

  clearWalls() {
    this.walls = [];
  }

  resize() {
    this.canvas.width = this.canvas.offsetWidth;
    this.canvas.height = this.canvas.offsetHeight;
  }

  /**
   * Add a glow point at a specific screen position
   */
  addGlowAt(x, y, color) {
    this.glowPoints.push({
      x, y,
      h: color.h,
      s: color.s,
      l: color.l,
      intensity: 0.8,
      decay: 0.003
    });
  }

  /**
   * Legacy: add glow from angle (still works for compat)
   */
  addGlow(angleDeg, color) {
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const radius = Math.min(cx, cy) * 0.4;
    this.addGlowAt(
      cx + radius * Math.cos(angleRad),
      cy + radius * Math.sin(angleRad),
      color
    );
  }

  render(analyserData, trainLights = [], world = null, cityBuffer = null) {
    const { width, height } = this.canvas;
    const worldObstacles = world && world.obstacles ? world.obstacles : [];
    const worldWalkers = world && world.walkers ? world.walkers : [];
    const worldLights = world && world.lights ? world.lights : [];
    const draftSegment = world && world.draftSegment ? world.draftSegment : null;
    const performanceMode = world && world.performanceMode ? world.performanceMode : 'normal';
    const allLights = [...trainLights, ...worldLights];
    const shadowWalls = [
      ...this.walls.map((w) => ({ ...w, shadow: true })),
      ...worldObstacles.filter((w) => w.shadow !== false)
    ];

    // Fade to dark
    this.ctx.fillStyle = 'rgba(26, 26, 26, 0.08)';
    this.ctx.fillRect(0, 0, width, height);

    // Render City Engine Pixels (Phase 2)
    if (cityBuffer) {
      this.ctx.fillStyle = 'rgba(200, 255, 200, 0.8)'; // Temporary dot color
      let i = 0;
      while (i < cityBuffer.length) {
        const x = cityBuffer[i];
        const y = cityBuffer[i+1];
        // const color = cityBuffer[i+2]; // reserved for future
        const alpha = cityBuffer[i+3];
        
        if (alpha > 0) { // Only read active pixels
          this.ctx.fillRect(x, y, 2, 2);
        }
        i += 4; // floatsPerPixel
      }
    }

    let avgAmplitude = 0;
    if (analyserData && analyserData.length > 0) {
      for (let i = 0; i < analyserData.length; i++) {
        avgAmplitude += analyserData[i];
      }
      avgAmplitude = avgAmplitude / analyserData.length / 255;
    }

    // 1. Draw station glowing points
    for (let i = this.glowPoints.length - 1; i >= 0; i--) {
      const gp = this.glowPoints[i];
      const boosted = gp.intensity * (1 + avgAmplitude * 0.5);
      const radius = 100 + boosted * 180;

      const gradient = this.ctx.createRadialGradient(
        gp.x, gp.y, 0, gp.x, gp.y, radius
      );
      gradient.addColorStop(0, `hsla(${gp.h}, ${gp.s}%, ${gp.l}%, ${boosted * 0.35})`);
      gradient.addColorStop(1, `hsla(${gp.h}, ${gp.s}%, ${gp.l}%, 0)`);

      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(gp.x - radius, gp.y - radius, radius * 2, radius * 2);

      gp.intensity -= gp.decay;
      if (gp.intensity <= 0) {
        this.glowPoints.splice(i, 1);
      }
    }

    // 2. Draw train lights & compute shadows
    for (const light of allLights) {
      this.ctx.save();
      
      const radius = light.radius || 300;
      
      if (light.type !== 'omni') {
        const coneArc = Math.PI / 1.5; // 120 degree cone for headlights
        let drawAngle = light.angle;
        if (light.type === 'backward') {
          drawAngle += Math.PI; // point 180 degrees back
        }

        // Create clipping path for the headlight cone
        this.ctx.beginPath();
        this.ctx.moveTo(light.x, light.y);
        this.ctx.arc(light.x, light.y, radius, drawAngle - coneArc/2, drawAngle + coneArc/2);
        this.ctx.closePath();
        this.ctx.clip();
      }

      // Draw the radial gradient inside the cone (or omni if no clip applied)
      const gradient = this.ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, radius);
      gradient.addColorStop(0, `rgba(${light.colorRGB}, ${light.intensity || 0.6})`);
      gradient.addColorStop(1, `rgba(${light.colorRGB}, 0)`);
      
      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(light.x - radius, light.y - radius, radius * 2, radius * 2);

      // Cast shadows from walls
      this._drawShadows(light.x, light.y, shadowWalls, performanceMode);
      
      this.ctx.restore();
    }

    // 3. Draw static walls
    this.ctx.strokeStyle = 'rgba(245, 240, 225, 0.4)';
    this.ctx.lineWidth = 2;
    this.ctx.lineCap = 'round';
    
    this.ctx.beginPath();
    for (const wall of this.walls) {
      this.ctx.moveTo(wall.x1, wall.y1);
      this.ctx.lineTo(wall.x2, wall.y2);
    }
    this.ctx.stroke();

    // 4. Draw scene obstacles (creation entities)
    for (const obstacle of worldObstacles) {
      this.ctx.strokeStyle = obstacle.selected ? '#C41E3A' : (obstacle.color || 'rgba(245, 240, 225, 0.6)');
      this.ctx.lineWidth = obstacle.selected ? Math.max(2, (obstacle.width || 2) + 1) : (obstacle.width || 2);
      this.ctx.beginPath();
      this.ctx.moveTo(obstacle.x1, obstacle.y1);
      this.ctx.lineTo(obstacle.x2, obstacle.y2);
      this.ctx.stroke();
    }

    // 5. Draw walkers
    for (const walker of worldWalkers) {
      this.ctx.beginPath();
      this.ctx.arc(walker.x, walker.y, walker.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = walker.color || 'rgba(245, 240, 225, 0.9)';
      this.ctx.fill();
      if (walker.selected) {
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = '#C41E3A';
        this.ctx.stroke();
      }
    }
    
    if (this.currentWall) {
      this.ctx.strokeStyle = '#C41E3A';
      
      if (this.wallType === 'dashed') {
        this.ctx.setLineDash([15, 20]);
      } else {
        this.ctx.setLineDash([]);
      }
      
      this.ctx.beginPath();
      this.ctx.moveTo(this.currentWall.x1, this.currentWall.y1);
      this.ctx.lineTo(this.currentWall.x2, this.currentWall.y2);
      this.ctx.stroke();
      this.ctx.setLineDash([]); // reset for next frame
    }

    // 6. Draft segment while creating
    if (draftSegment) {
      this.ctx.strokeStyle = draftSegment.color || '#C41E3A';
      this.ctx.lineWidth = draftSegment.width || 2;
      if (draftSegment.dashed) this.ctx.setLineDash([15, 20]);
      this.ctx.beginPath();
      this.ctx.moveTo(draftSegment.x1, draftSegment.y1);
      this.ctx.lineTo(draftSegment.x2, draftSegment.y2);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }
  }

  _drawShadows(lightX, lightY, walls, performanceMode = 'normal') {
    this.ctx.fillStyle = 'rgba(26, 26, 26, 0.95)'; // Shadow darkness
    const EXT = performanceMode === 'eco' ? 2200 : 4000; // Far projection distance
    const STEP = performanceMode === 'eco' ? 2 : 1;

    for (let i = 0; i < walls.length; i += STEP) {
      const wall = walls[i];
      const dx1 = wall.x1 - lightX;
      const dy1 = wall.y1 - lightY;
      const mag1 = Math.hypot(dx1, dy1) || 1;
      
      const dx2 = wall.x2 - lightX;
      const dy2 = wall.y2 - lightY;
      const mag2 = Math.hypot(dx2, dy2) || 1;
      
      const px1 = wall.x1 + (dx1 / mag1) * EXT;
      const py1 = wall.y1 + (dy1 / mag1) * EXT;
      const px2 = wall.x2 + (dx2 / mag2) * EXT;
      const py2 = wall.y2 + (dy2 / mag2) * EXT;
      
      this.ctx.beginPath();
      this.ctx.moveTo(wall.x1, wall.y1);
      this.ctx.lineTo(px1, py1);
      this.ctx.lineTo(px2, py2);
      this.ctx.lineTo(wall.x2, wall.y2);
      this.ctx.closePath();
      this.ctx.fill();
    }
  }
}

export { ColorBackground };
