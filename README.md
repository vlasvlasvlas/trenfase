# TRENFASE 🚃🎶

**TRENFASE** es un secuenciador audiovisual interactivo inspirado en la Yamanote Line (山手線) de Tokio.

El proyecto combina:
- disparo musical por estaciones,
- trenes autónomos con control individual,
- iluminación dinámica con sombras por raycasting,
- y un espacio de creación para construir escenas vivas (líneas, rotación, walkers).

---

## 1. Origen e inspiración

TRENFASE trabaja con una idea central: usar el lenguaje sonoro ferroviario japonés como material compositivo.

- Los sonidos base del circuito corresponden a **melodías de salida de estaciones** (train melodies / 発車メロディー) usadas en contexto real ferroviario.
- Estas melodías funcionan como señales auditivas reconocibles para el flujo de pasajeros y forman parte de la identidad urbana de muchas estaciones.
- En esta interfaz, ese material se reorganiza como instrumento generativo: cada tren recorre el anillo y activa estaciones, creando patrones rítmicos y armónicos emergentes.

Referencias de contexto:
- https://en.wikipedia.org/wiki/Train_melody
- https://github.com/morgansleeper/Yamanotes

---

## 2. Estado actual del proyecto (implementado)

### Estado de fases (snapshot final)

| Fase | Nombre | Estado |
|---|---|---|
| 1 | Foundation & Custom Audio | Complete |
| 2 | The Core Ecosystem Engine | Complete |
| 3 | Generative Algorithms | Complete |
| 4 | Acoustic Translation & Dynamic Audio | Complete |
| 5 | What-If Gameplay Mechanics (Drag & Drop) | Pending |
| 6 | Stabilization, QA & Release Hardening | Complete |

Resumen: Fases 1, 2, 3, 4 y 6 cerradas. Fase 5 pendiente como siguiente objetivo principal.

- 30 estaciones de Yamanote (`JY-01` a `JY-30`) con audio por estación.
- Tren(es) con configuración totalmente individual:
  - velocidad,
  - dirección CW/CCW,
  - luz (color, intensidad, radio, orientación),
  - sonido interno (on/off, volumen, frecuencia, rate, tone).
- Menú principal con tabs:
  - `Settings`,
  - `Creación`,
  - `¿Qué es esto?`.
- Barra inferior minimal:
  - `+ 🚃 Nuevo Tren`,
  - `⛶ Fullscreen`,
  - contador de estaciones activas/ghost.
- Fullscreen con ocultación automática del header.
- Escalado adaptativo de entidades de creación y walls en cambios de viewport/fullscreen.

---

## 3. Instalación y ejecución local

No hay build step. Es Vanilla HTML/CSS/JS.

### 3.1 Clonar

```bash
git clone https://github.com/vladimirobellini/trenfase.git
cd trenfase
```

### 3.2 Levantar servidor estático

```bash
python3 -m http.server 8080
```

Alternativa:

```bash
npx http-server -p 8080
```

### 3.3 Abrir en navegador

Ir a `http://localhost:8080`.

---

## 4. Mapa de interfaz

### 4.1 Header

- Botón `☰ Menu` abre/cierra panel lateral.
- En fullscreen, el header se oculta automáticamente.

### 4.2 Barra inferior

- `+ 🚃 Nuevo Tren`: crea tren con velocidad default `0.25`.
- `⛶ Fullscreen`: alterna fullscreen.
- `station-count`: muestra cuántas estaciones están en estado `Active` o `Ghost`.

### 4.3 Panel de estación (click en estación)

- Estado: `Active`, `Off`, `Ghost`.
- Trim del audio por waveform.
- Volumen y pitch.
- FX por estación: Delay + Filter.

### 4.4 Panel de tren (click en tren)

- Dirección, velocidad, color de luz, tipo de luz, intensidad y radio.
- Sonido interno del tren con 5 controles.
- Botón `Remove Train ✕` elimina ese tren.

### 4.5 Menú lateral (panel settings)

### Tab `Settings`

- Master Volume global.
- Lista de trenes con control rápido por tren:
  - speed, light int/rad,
  - sound on/off, vol, freq, rate, tone,
  - dirección,
  - eliminar.

### Tab `Creación`

- Herramientas de entidad (`select`, `line-solid`, `line-dashed`, `rotating-line`, `walker`, `walker-waypoint`).
- Sección de walls (`Wall Type`, `Clear All Walls`).
- Acciones (`Undo`, `Redo`, `Delete Selected`, `Clear Scene`).
- Performance (`Normal` / `Eco`).
- Lista de entidades + inspector.
- Export/Import JSON + Save/Load Local.

### Tab `¿Qué es esto?`

- Contexto conceptual, historia breve de inspiración sonora y links de fuente.

---

## 5. Referencia exhaustiva de controles y rangos

### 5.1 Controles globales

| Control | Rango UI | Valor interno |
|---|---:|---:|
| Master Volume | `0..100` | `0.00..1.00` |
| Add Train (default) | fijo | `0.25` UI speed |
| Fullscreen | toggle | `document.fullscreenElement` |

### 5.2 Controles por tren

| Control | Rango UI | Valor interno |
|---|---:|---:|
| Speed | `1..1000` | `0.01..10.00` UI speed |
| Direction | toggle | `1` (CW) / `-1` (CCW) |
| Light Type | `forward/backward/omni` | enum |
| Light Intensity | `0..100` | `0.00..1.00` |
| Light Radius | `50..1000` | px |
| Sound Enabled | toggle | boolean |
| Sound Volume | `0..30` | `0.00..0.30` |
| Sound Frequency | `20..200` | Hz |
| Sound Rate | `10..400` | `0.10..4.00` |
| Sound Tone | `0..100` | `0.00..1.00` |

Defaults de tren nuevo:
- `speed = 0.25` (UI)
- `direction = CW`
- `lightIntensity = 0.6`
- `lightRadius = 300`
- `lightType = forward`
- `soundEnabled = true`
- `soundVolume = 0.08`
- `soundFrequency = 55`
- `soundRate = 1.0`
- `soundTone = 0.5`

Límites de sistema:
- `maxTrains = 5`

### 5.3 Controles por estación

| Control | Rango UI | Valor interno |
|---|---:|---:|
| Station Volume | `0..100` | `0.00..1.00` |
| Station Pitch | `25..200` | `0.25..2.00` |
| Delay Time | `0..200` | `0.00..2.00 s` |
| Delay Feedback | `0..90` | `0.00..0.90` |
| Delay Wet | `0..100` | `0.00..1.00` |
| Filter Freq | `0..100` | mapeo log `20..20000 Hz` |
| Filter Q | `1..150` | `0.1..15.0` |

Estados de estación:
- `Active`: reproduce audio y responde visualmente.
- `Off`: no reproduce.
- `Ghost`: no reproduce, pero reacciona visualmente al paso del tren.

### 5.4 Creación: entidades e inspector

### Line
- dashed: bool
- color
- width: `1..12`
- shadow: bool
- collider: bool

### Rotating Line
- color
- width: `1..12`
- length: `20..500`
- angle: `0..360`
- speed: `-180..180 deg/s`
- dashed: bool
- shadow: bool

### Walker
- diameter: `4..60`
- speed: `10..240`
- loop: bool
- board radius: `10..80`
- light enabled: bool
- light radius: `40..500`
- light intensity: `0..100` -> `0..1`
- light color
- waypoints add/clear

---

## 6. Espacio de creación en detalle

### 6.1 Herramientas

- `Select`: selecciona y arrastra entidades.
- `Line Solid`: crea segmento sólido.
- `Line Dashed`: crea segmento punteado (deja pasar luz entre gaps).
- `Rotating`: crea línea centrada que rota.
- `Walker`: crea entidad móvil circular.
- `Waypoint`: agrega waypoints al walker seleccionado.

### 6.2 Interacciones clave

- `Undo/Redo`: historial de escena (stack máximo `120` snapshots).
- `Delete Selected`: borra entidad seleccionada.
- `Clear Scene`: limpia entidades de creación.
- Import/Load aplican normalización de estado para evitar corrupción.
- En select+drag, el undo se guarda al mover de verdad (evita estados basura).

### 6.3 Walker FSM (comportamiento)

Estados:
- `walk` -> recorre waypoints.
- `wait` -> espera en estación cercana.
- `ride` -> sube al tren cercano y lo sigue.
- `unboard` -> baja en otra estación y vuelve a `walk`.

Umbrales relevantes:
- `stationRadius` (default `20`)
- `boardRadius` (default `24`)
- `minRideMs` (default `3500`)

### 6.4 Walls

- Se dibujan con `Shift + Drag`.
- El tipo (`Solid`/`Dashed`) se define en tab `Creación`.
- `Clear All Walls` limpia solo walls del fondo.
- Participan en el cálculo de sombras junto con obstáculos del espacio de creación.

---

## 7. Audio: cómo está modelado

### 7.1 Disparo por estación

Cuando un tren cruza el umbral de una estación:
- se evalúa estado (`Active`/`Ghost`),
- si corresponde, se dispara `AudioBufferSourceNode`,
- se aplica trim, pitch, volumen y cadena FX por estación.

### 7.2 Sonido interno por tren (clack/rhythmic)

Cada tren tiene su propio patrón. El motor usa:
- distancia acumulada de movimiento,
- `soundRate` para densidad,
- `minGapMs` para evitar ráfaga excesiva,
- `maxSilenceMs` para evitar silencios largos a baja velocidad,
- `soundTone` para balance snap/thump del timbre.

Resultado: cada tren puede sonar distinto y estable en un rango amplio de velocidades.

---

## 8. Render, luces y adaptación responsive

Pipeline híbrido:
- `SVG` (`ring.js`) para vía, estaciones y dots de tren.
- `Canvas` (`color-bg.js`) para glow, luces y sombras.

Tipos de luz por tren:
- `forward` (cono frontal),
- `backward` (cono invertido),
- `omni` (halo 360).

Performance:
- `Normal`: sombras completas.
- `Eco`: proyección/iteración reducida en sombras.

Resize/fullscreen:
- se re-renderiza el ring,
- se reescala el espacio de creación (entidades, waypoints, walls, draft segment),
- en fullscreen se oculta el header.

---

## 9. Persistencia de escena de creación

Formato general:

```json
{
  "version": 1,
  "entities": [],
  "nextId": 1,
  "performanceMode": "normal"
}
```

Operaciones:
- `Export JSON`: dump al textarea.
- `Import JSON`: parse + normalización.
- `Save Local`: `localStorage` key `trenfase.creation.scene.v1`.
- `Load Local`: restauración + normalización.

---

## 10. QA completo recomendado

1. Abrir app y verificar carga de audio (pantalla inicial + botón start).
2. Crear 2-3 trenes desde barra inferior.
3. Click en cada tren y validar panel completo de controles.
4. Llevar speed de un tren a `10.00` y otro a `0.25`.
5. Cambiar dirección individual y verificar trigger reset correcto.
6. Probar `Light Type` forward/backward/omni.
7. Ajustar `Snd Vol/Freq/Rate/Tone` y confirmar cambios audibles por tren.
8. Eliminar un tren desde panel de tren.
9. Abrir `Menu -> Settings` y usar la lista de trenes para editar los mismos parámetros.
10. Verificar `Master Volume` global.
11. Editar una estación: trim, volume, pitch, delay, filter.
12. Probar estados `Active`, `Off`, `Ghost`.
13. En `Creación`, activar modo creación y dibujar `Line Solid`.
14. Cambiar a `Line Dashed` y confirmar diferencia visual/luz.
15. Crear `Rotating`, ajustar speed positivo/negativo.
16. Crear `Walker`, agregar waypoints, observar FSM (walk/wait/ride/unboard).
17. Probar `Undo/Redo`, luego `Delete Selected`, y volver a crear líneas de distinto tipo.
18. Probar `Export/Import` y `Save/Load Local`.
19. Cambiar a `Performance = Eco` y comparar costo visual.
20. Entrar/salir fullscreen y validar header oculto en fullscreen y adaptación correcta de entidades/walls a nuevo viewport.

---

## 11. Arquitectura de código

- `index.html`: estructura principal, paneles, tabs y controles.
- `css/base.css`: layout, componentes y estados UI.
- `css/themes/60s.css`: variables visuales del tema activo.
- `js/app.js`: orquestador principal (UI, loop, paneles, creación, resize/fullscreen).
- `js/train.js`: modelo de tren + lógica de update/trigger/clack.
- `js/audio-engine.js`: Web Audio API (buffers estaciones + síntesis clack tren).
- `js/ring.js`: geometría del circuito y render SVG de estaciones/trenes.
- `js/color-bg.js`: render canvas (glows, lights, shadows, walls).
- `js/trim-editor.js`: editor de waveform para trim por estación.
- `js/stations.js`: catálogo de estaciones y defaults de audio/FX.

---

## 12. Decisiones y límites actuales

- Proyecto sin dependencias de build (simple y portable).
- Máximo 5 trenes para mantener claridad visual y costo controlado.
- Más de 8 rotating lines muestra warning de performance.
- `Eco` prioriza costo sobre precisión de sombra.
- El sistema no busca exactitud ferroviaria 1:1; prioriza expresividad audiovisual interactiva.

---

## 13. Créditos

- Inspiración ferroviaria y cultura sonora: Yamanote Line / train melodies.
- Referencias:
  - https://en.wikipedia.org/wiki/Train_melody
  - https://github.com/morgansleeper/Yamanotes

---

Hecho en Vanilla JS, Canvas 2D, SVG y Web Audio API.
