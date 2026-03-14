# TRENFASE: Pixel-SimCity Expansion Concept
**Documento de Diseño Conceptual y Arquitectura Avanzada**
*Elaborado mediante iteraciones de un Comité de 3 Expertos (Sistemas, Audio, Curaduría/UX).*

---

## 1. Visión General: El Sintetizador Bio-Urbano
TRENFASE dejará de ser únicamente una caja de ritmos ferroviaria para convertirse en un **Motor de Hábitats Sonoros Generativos**. 

El usuario toma el rol de creador ecosistémico: al plantar una "Estación" (nodo) en un lienzo vacío, no solo define un punto de parada para trenes, sino que siembra una "semilla urbana". A partir de esa semilla, un ecosistema de píxeles (caminos, casas, vehículos y personas) crece orgánicamente, generando su propio paisaje sonoro. El usuario moldea este paisaje ajustando parámetros sociológicos que dictan la vida y la muerte de estas micro-ciudades.

---

## 2. Paradigma de Interacción (UX/UI)

### 2.1 El Lienzo Vacío y la Semilla
- **Landing Page:** El usuario elige entre "Explorar Yamamote" o "Crear Ecosistema".
- **Nueva Estación:** Al plantar un nodo, se le asigna un nombre y un sonido fundamental. Este sonido puede ser una muestra subida (WAV/MP3) o audio grabado directamente usando la API del micrófono del navegador (Apropiación performática).

### 2.2 Variables Sociológicas (Inspector de Estación)
Cada estación controla a su respectiva población mediante parámetros de alto nivel que rigen las matemáticas ocultas:
1. **Vitalidad / Atracción (Growth Rate):** La velocidad a la que la estación genera nuevas ramificaciones (carreteras) y asienta nuevos píxeles habitables (zonas urbanas).
2. **Capacidad de Carga (Carrying Capacity):** El límite geográfico y demográfico que puede sostener el nodo antes de estancarse.
3. **Tolerancia a Saturación (Decay/Ruin Threshold):** Define qué tan resistente es la ciudad a la sobrepoblación o al aislamiento. Si la ciudad excede su límite o pierde su flujo de trenes, colapsa en estado de "Ruina".

### 2.3 Controles de Mezcla Sensorial
El usuario controla "qué escucha" de la ciudad mediante niveles de síntesis aditiva:
- **Volumen Peatonal (Burbujeo):** Clicks granulares, cortos y aleatorios que representan el tránsito peatonal.
- **Zumbido de Tráfico (Dron):** Onda de baja frecuencia filtrada (Low-pass noise) que representa el tráfico pesado, escalando en distorsión según la densidad.

---

## 3. Arquitectura del Motor de Simulación (Sistemas)

Para evitar el colapso del hilo principal (Main Thread) del navegador y garantizar que WebAudio funcione sin interrupciones, el crecimiento no se calcula en `app.js`.

### 3.1 Web Workers y Paralelismo
Se implementará un `city-engine.worker.js` dedicado exclusivamente a la matemática del enjambre y el crecimiento. El hilo principal y el Worker se comunican enviando matrices de datos tipados (`Float32Array`) para el renderizado súper-rápido en Canvas.

### 3.2 Algoritmos Generativos
- **Space Colonization (Crecimiento Fractal):** El motor no usa grillas (grids) rgidas. Esparce puntos de "atracción" invisibles y la estación lanza ramas (caminos) buscando esos puntos, creando redes orgánicas similares a vasos sanguíneos o raíces.
- **Pathfinding A* Optimizado:** Los píxeles-autos usan grafos de navegación ligeros para moverse estricta y obligatoriamente por los píxeles de carretera.

### 3.3 Data-Oriented Design (ECS)
Se abandonará la Orientación a Objetos tradicional (`new Auto()`) para las entidades microscópicas. Los miles de caminantes y autos serán gobernados por Sistemas de Entidades/Componentes (ECS) para que la CPU procese bucles matemáticos secos y eficientes.

---

## 4. Traducción Acústica (Audio Dinámico)

El componente sonoro reacciona de forma análoga al estado vital del nodo, calculado por el Worker de simulación.

- **Expansión (Boom):** Sonidos ágiles, síntesis FM brillante. El LFO (Low-Frequency Oscillator) del volumen de la ciudad pulsa rápidamente.
- **Estancamiento (Capacidad Llena):** Ruido de banda plana, distorsión suave (Overdrive), zumbido denso.
- **Atasco (Gridlock/Saturación):** Cuando demasiados agentes intentan usar rutas insuficientes. Musicalmente se traduce en recorte digital agresivo (Bitcrushing y Clipping), y una alarma disonante al paso del tren.
- **Decadencia (Ruina):** Si la ciudad colapsa, los motores granulares se apagan. Entran reverbs cavernosas, filtros paso-bajo y un detune (desafinación) en la nota base de la estación. Queda el viento sonoro.

---

## 5. Escenarios "What-If" de Modificación en Tiempo Real (Drag & Drop)

El usuario puede alterar radicalmente el paisaje moviendo las estaciones creadas. Estas mecánicas no son solo UX, sino *Gameplay Ecosistémico*.

1. **Rompimiento de Núcleo (Orfandad):** Si una estación (nodo) es arrastrada lejos de su Pixe-SimCity madura, la ciudad queda huérfana. Sus caminos se cortan. La ciudad vieja entra rápidamente en fase de "Ruina", apagando su luces y bajando sus frecuencias sonoras. La estación desplazada inicia un nuevo brote urbano en su nueva coordenada.
2. **Re-enraizamiento Súbito (Sprawl):** Si la estación se desplaza solo unos píxeles cortos, la ciudad no muere, sino que gasta "Vitalidad" violentamente estirando gruesos conectores viales hacia la nueva posición del nodo.
3. **El Éxodo Automático:** Si una ciudad sufre un atasco tóxico o una Ruina prolongada, sus píxeles-personas pueden usar el algoritmo de navegación para huir caminando por las carreteras interurbanas hacia una estación en mejor estado. (Paneo de audio: el grano sonoro viaja físicamente por los auriculares desde la ciudad moribunda hacia el oasis urbano).
4. **Resurrección:** Arrastrar una estación viva y colocarla en el centro de un cementerio de píxeles (una Ruina antigua). El algoritmo "adopta" la red vial muerta, inyectándole luz dorada y sonido "Power-Up" de energía restaurándose.
5. **Superpoblación Inducida (Colapso por Fusión):** Arrastrar la Estación A justo encima de la Estación B. Las poblaciones se combinan pero el espacio físico se satura al 200%, disparando inmediatamente el estado de Atasco y Distorsión Acústica crítica.
6. **Vías de Tren Elásticas vs Rutas Estáticas:** Mientras la estación se mueve en tiempo real, la vía del tren guiada por spline se estira suavemente, retrasando los trenes en tránsito. Las calles de la ciudad, en cambio, se rompen y recomponen rígidamente, mostrando el contraste entre la infraestructura dictada por el humano (tren) y el crecimiento feral de la ciudad (píxeles).

---

## 6. Estado Actual de Implementación (V2 Milestone Tracker)
*Nota: El detalle granular de todas las tareas y fases se encuentra en [pixel-simcity-phases.md](./pixel-simcity-phases.md).*

### ✅ Fases Completadas (Cimientos Estabilizados)
1. **Fase 1 (Foundation & UX):** Reseteo del proyecto a un baseline estable de V1. Integración de audio personalizado (WAV/Mic). UI mejorada para modo dual (Yamanote vs Creador).
2. **Fase 2 (Motor Ecosistémico):** Creación del hilo en paralelo (`city-engine.worker.js`) y el motor de renderizado de alta velocidad vía `Float32Array`. Renderizado visual de estaciones plantadas manualmente con colisiones de audio funcionando.

### 🚧 Próximo Horizonte (El Ecosistema)
1. **Fase 3 (Algoritmos Generativos):** Construcción del *Space Colonization* para generar las ciudades visualmente desde las estaciones, y *Pathfinding* para los caminantes.
2. **Fase 4 (Traducción Acústica):** Mapeo de densidad peatonal y de tráfico a sintetizadores de audio dinámicos (Granular/Drones).
3. **Fase 5 (Gameplay y What-Ifs):** Implementación compleja de romper ecosistemas interactuando espacialmente (Drag & Drop de estaciones).
