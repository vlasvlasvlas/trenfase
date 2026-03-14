/**
 * Pixel-SimCity: City Engine Web Worker
 * Phase 2 - Core Engine Ecosystem & Float32Array Render Test
 * 
 * This worker processes generative logic off the main thread.
 * It uses Transferable Objects (Float32Array) to send 10,000 pixels
 * to the main thread at 60 FPS without Garbage Collection pauses.
 */

const MAX_PIXELS = 10000;
const FLOATS_PER_PIXEL = 4; // x, y, color (unused), alpha

let stations = new Map();
let isRunning = false;
let time = 0;

self.onmessage = function(e) {
  const msg = e.data;

  switch (msg.type) {
    case 'INIT':
      console.log('[City Worker] Initialized. Awaiting buffer...');
      break;

    case 'START':
      isRunning = true;
      console.log('[City Worker] Simulation Started.');
      break;

    case 'STOP':
      isRunning = false;
      break;

    case 'UPDATE_STATION':
      if (msg.station) {
        stations.set(msg.station.id, msg.station);
      }
      break;

    case 'REMOVE_STATION':
      if (msg.stationId) {
        stations.delete(msg.stationId);
      }
      break;

    case 'FRAME_REQUEST':
      if (!isRunning) return;
      
      const buffer = msg.buffer; // We now own the ArrayBuffer
      const view = new Float32Array(buffer);
      
      // Clear the buffer
      view.fill(0);
      
      // Process active stations
      const activeStations = Array.from(stations.values());
      //.filter(s => s.active); // We render for ALL stations in Creator Mode
      
      if (activeStations.length > 0) {
        let pixelIndex = 0;
        time += 0.05;
        
        // Distribute 10k pixels evenly among active stations
        const pixelsPerStation = Math.floor(MAX_PIXELS / activeStations.length);
        
        for (const station of activeStations) {
          // Visual Test Phase 2: Pulsating Neural Matrix
          // Create an expanding radius that resets
          const pulseRadius = (time * 15) % 150 + 20;
          const alphaFade = Math.max(0, 1 - (pulseRadius / 170));
          
          for (let p = 0; p < pixelsPerStation; p++) {
            if (pixelIndex >= MAX_PIXELS) break;
            
            // Generate dots in a ring
            const angle = (p / pixelsPerStation) * Math.PI * 2 + (time * 0.1);
            
            // Slight noise
            const noise = (Math.random() - 0.5) * 10;
            
            const px = station.x + Math.cos(angle) * (pulseRadius + noise);
            const py = station.y + Math.sin(angle) * (pulseRadius + noise);
            
            const offset = pixelIndex * FLOATS_PER_PIXEL;
            view[offset] = px;           // X
            view[offset + 1] = py;       // Y
            view[offset + 2] = 0;        // Color (unused by canvas atm)
            view[offset + 3] = alphaFade;// Alpha
            
            pixelIndex++;
          }
        }
      }

      // Transfer back to main thread
      self.postMessage({
        type: 'FRAME_DATA',
        buffer: buffer
      }, [buffer]);
      
      break;

    default:
      console.warn(`[City Worker] Unknown message type: ${msg.type}`);
  }
};
