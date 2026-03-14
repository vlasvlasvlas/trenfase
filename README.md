# TRENFASE 🚃🎶

**TRENFASE** is an interactive, generative audio-visual sequencer inspired by the Yamanote Line (山手線) in Tokyo. 

It functions as a dynamic sound machine where autonomous trains traverse a track (the circuit), triggering individual station melodies. The system blends generative ambient drones, raycast dynamic lighting, and per-station audio effects to create a deeply mesmerizing and customizable ambient experience.

![TRENFASE](https://img.shields.io/badge/Status-Active-brightgreen) ![Tech](https://img.shields.io/badge/Tech-Vanilla%20JS%20%7C%20Canvas%20%7C%20Web%20Audio-blue)

## ✨ Core Features

### 🎵 Audio Engine
- **Generative Polyphony:** Each train acts as a playhead. When a train passes a station, it triggers that station's unique chime (or melody), allowing for emergent polyphonic rhythms when multiple trains are moving.
- **Rhythmic Drone (Traqueteo):** A synthesized, procedural background drone simulates the rhythmic "clackety-clack" of train wheels on the tracks, reacting dynamically to the global speed of the trains.
- **Per-Station FX Chain:** Complete Web Audio API integration allowing granular control over each station's audio buffer:
  - **Trim:** Real-time waveform editor to crop the start and end of the audio sample.
  - **Volume & Pitch.**
  - **Lowpass Filter:** Frequency and Q-factor controls.
  - **Delay:** Time, Feedback, and Wet mix controls.

### 🎨 Visuals & Lighting
- **Ray-cast Shadows:** A custom Canvas 2D lighting engine. Trains emit light cones (headlights) that dynamically cast realistic shadows behind user-drawn obstacles (walls).
- **Interactive Environment:** Users can draw solid or dashed walls directly on the canvas (using `Shift + Drag`). Dashed walls allow light to realistically filter through the gaps.
- **Per-Train Lighting:** Trains can be configured to emit light Forward, Backward, or Omnidirectionally, with customizable radius, color, and intensity.
- **Responsive Geometry:** The track is a mathematically generated rounded-rectangle (stadium shape) that perfectly fits and scales to the user's browser window.

---

## 🚀 Installation & Setup

TRENFASE is entirely built in Vanilla HTML, CSS, and JavaScript. It does not require Node.js, Webpack, or any build step.

To run it locally, you just need a basic HTTP server to avoid CORS issues when loading the audio files.

### 1. Clone the Repository
```bash
git clone https://github.com/vladimirobellini/trenfase.git
cd trenfase
```

### 2. Start a Local Server
You can use any local server tool. 

**Using Python:**
```bash
python3 -m http.server 8080
```

**Using Node / npm:**
```bash
npx http-server -p 8080
```

### 3. Open in Browser
Navigate to `http://localhost:8080` in your preferred web browser.

---

## 🕹 Usage Guide

### Global Controls (Settings ⚙️)
Click **⚙️ Settings** in the top right corner to open the global panel. Here you can:
- **Add New Trains:** Spawn a new train on the track. By default, trains start at `0.25` speed.
- **Global Speed Slider:** Adjust the master speed modifier for all trains.
- **Drone Controls:** Toggle the rhythmic background drone and adjust its volume and base frequency.
- **Environment:** Toggle between `Solid` and `Dashed` wall drawing modes, or clear all drawn walls. 

### Train Controls
- **Edit a Train:** Click directly on a moving train dot on the track to open its dedicated configuration panel.
- **Adjustments:** Modify its individual speed, direction (CW/CCW), light color (HEX), intensity, radius, and light orientation (Forward / Backward / Omni).

### Station Controls
- **Edit a Station:** Click on any station node on the track.
- **Trim Audio:** Drag the waveform handles to select exactly what portion of the MP3 triggers.
- **Mix & FX:** Apply delay chains and lowpass filters specific to that node.
- **States:** 
  - `Active`: Plays audio and emits a visual glow.
  - `Off`: Muted and visually inactive.
  - `Ghost`: Muted but visually pulses when a train passes.

### Drawing Walls
Hold **`Shift` and Click + Drag** your mouse anywhere on the background canvas to draw walls. When train lights sweep past these walls, they will cast dynamic shadows.

---

## 🛠 Technical Architecture

TRENFASE is built to be extremely lightweight and dependency-free.

### File Structure
- `index.html`: Main application layout, side panel UI, and SVG/Canvas layering.
- `css/base.css`: All styling, layout structures, and CSS variables.
- `js/app.js`: Master orchestrator. Connects the UI events, the render loop (`requestAnimationFrame`), the audio engine, and train management.
- `js/color-bg.js`: Canvas 2D renderer responsible for fading tails, drawing walls, clipping light cones, and generating real-time shadow polygons using raycasting algorithms.
- `js/ring.js`: Handles the SVG overlay. Computes the parametric `(x,y)` positions and tangential angles of the rounded rectangle track to perfectly position stations and train SVGs.
- `js/audio-engine.js`: Web Audio API wrapper. Manages the `AudioContext`, loads buffers, creates routing graphs (Gain -> Filter -> Delay -> Destination), and synthesizes the background drone.
- `js/trim-editor.js`: Custom UI component that renders raw audio array buffer data into a visual waveform canvas with draggable interactive handles.
- `js/train.js`: Pure data model for trains (speed, position, color, lighting properties).
- `js/stations.js`: Data structures containing metadata (names, audio paths) for all Yamanote line stations.

### The Rendering Pipeline
The app leverages a hybrid rendering approach:
1. **SVG Layer (`ring.js`):** Used for sharp, resolution-independent rendering of the track line, station nodes, and train dots. Excellent for crisp UI elements and attachable DOM click events.
2. **Canvas Layer (`color-bg.js`):** Sits beneath the SVG. Used for high-performance pixel operations. It handles the fading motion blur of the stations, the radial gradients of the lights, and the complex clipping masks required for dynamic shadow casting.

### Sound Scheduling
When `train.shouldTrigger(station)` returns true, `app.js` issues a command to the `AudioEngine`. The engine creates a new `AudioBufferSourceNode`, respects the custom Trim Start/End points, routes it through the specific FX nodes owned by that station, and fires the playback precisely.

---
*Built with ❤️ in Vanilla JS.*
