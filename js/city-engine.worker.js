/**
 * Pixel-SimCity: City Engine Web Worker
 *
 * Phase 2 closed: stable transferable rendering pipeline.
 * Phase 3: generative roads (space-colonization inspired),
 * A* routing on road graph, and data-oriented agent update loop.
 */

const MAX_PIXELS = 12000;
const FLOATS_PER_PIXEL = 4; // x, y, kind, alpha

const PIXEL_KIND = {
  ROAD_LOCAL: 1,
  HUB: 2,
  WALKER: 3,
  CAR: 4,
  ROAD_INTERCITY: 5,
  BLOCK: 6,
};

const AGENT_TYPE = {
  WALKER: 0,
  CAR: 1,
};

const MAX_AGENTS = 320;

const GROWTH_PROFILES = {
  slow: {
    growthStartDelaySec: 3.0,
    nodeGrowthSecPerUnit: 0.29,
    nodeBirthJitterSec: 5.6,
    edgeLocalExtraSec: 1.55,
    edgeIntercityExtraSec: 5.1,
    edgeBirthJitterSec: 3.4,
    attractorSpreadScale: 0.84,
    attractorCountScale: 0.8,
    branchRejectBias: 0.58,
    nearEdgeRejectDistance: 5.4,
    parcelBirthJitter: 28,
    parcelBlockScale: 0.86,
  },
  balanced: {
    growthStartDelaySec: 2.5,
    nodeGrowthSecPerUnit: 0.23,
    nodeBirthJitterSec: 4.6,
    edgeLocalExtraSec: 1.2,
    edgeIntercityExtraSec: 4.2,
    edgeBirthJitterSec: 2.8,
    attractorSpreadScale: 1.0,
    attractorCountScale: 1.0,
    branchRejectBias: 0.45,
    nearEdgeRejectDistance: 4.5,
    parcelBirthJitter: 22,
    parcelBlockScale: 1.0,
  },
  dense: {
    growthStartDelaySec: 2.0,
    nodeGrowthSecPerUnit: 0.18,
    nodeBirthJitterSec: 3.2,
    edgeLocalExtraSec: 0.95,
    edgeIntercityExtraSec: 3.6,
    edgeBirthJitterSec: 2.0,
    attractorSpreadScale: 1.12,
    attractorCountScale: 1.3,
    branchRejectBias: 0.32,
    nearEdgeRejectDistance: 3.8,
    parcelBirthJitter: 17,
    parcelBlockScale: 1.28,
  },
};

const AGENT_BIRTH_BASE_SEC = 3.2;
const AGENT_BIRTH_JITTER_SEC = 8.5;
const PARCEL_GRID_STEP = 3;

let growthProfile = 'balanced';

function gp() {
  return GROWTH_PROFILES[growthProfile] || GROWTH_PROFILES.balanced;
}

function setGrowthProfile(profile) {
  const next = profile === 'slow' || profile === 'dense' ? profile : 'balanced';
  if (next !== growthProfile) {
    growthProfile = next;
    worldDirty = true;
  }
}

const stations = new Map();
let isRunning = false;
let worldDirty = true;
let frameMs = 16.67;
let lastTimestamp = 0;
let worldAgeSec = 0;

let nodes = []; // {id,x,y,stationId?}
let edges = []; // {a,b,kind}
let adjacency = new Map(); // nodeId -> [{to,cost}]
let stationNodeById = new Map();
let attractors = [];
let parcels = []; // {x,y,birth,stationId}

let physicsRequested = true;
let physicsEnabled = false;
let physicsChecked = false;
let physicsWorld = null;
let planckLib = null;

const agentBody = new Array(MAX_AGENTS).fill(null);
const agentDesiredX = new Float32Array(MAX_AGENTS);
const agentDesiredY = new Float32Array(MAX_AGENTS);

// Data-oriented agent storage.
const agentActive = new Uint8Array(MAX_AGENTS);
const agentType = new Uint8Array(MAX_AGENTS);
const agentX = new Float32Array(MAX_AGENTS);
const agentY = new Float32Array(MAX_AGENTS);
const agentSpeed = new Float32Array(MAX_AGENTS);
const agentCurrentNode = new Int32Array(MAX_AGENTS);
const agentSegmentIndex = new Uint16Array(MAX_AGENTS);
const agentSegmentT = new Float32Array(MAX_AGENTS);
const agentPath = new Array(MAX_AGENTS).fill(null);
const agentBirthSec = new Float32Array(MAX_AGENTS);

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function nodeDist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function addNode(x, y, stationId = null) {
  const id = nodes.length;
  nodes.push({ id, x, y, stationId, birth: 0 });
  adjacency.set(id, []);
  return id;
}

function addEdge(a, b, kind = PIXEL_KIND.ROAD_LOCAL) {
  if (a === b) return;
  const cost = nodeDist(nodes[a], nodes[b]);
  if (cost < 1) return;

  const aAdj = adjacency.get(a);
  const bAdj = adjacency.get(b);
  if (!aAdj || !bAdj) return;

  // Keep local road mesh readable (avoid over-connected spaghetti graph).
  if (kind === PIXEL_KIND.ROAD_LOCAL && (aAdj.length >= 5 || bAdj.length >= 5)) {
    return;
  }

  if (!aAdj.some((e) => e.to === b)) {
    aAdj.push({ to: b, cost });
  }
  if (!bAdj.some((e) => e.to === a)) {
    bAdj.push({ to: a, cost });
  }
  const existing = edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  if (!existing) {
    edges.push({ a, b, kind, birth: 0 });
  } else if (kind === PIXEL_KIND.ROAD_INTERCITY) {
    existing.kind = PIXEL_KIND.ROAD_INTERCITY;
  }
}

function nodeOwnerStationId(nodeId, stationList) {
  const n = nodes[nodeId];
  if (!n) return null;
  if (n.stationId) return n.stationId;
  let best = null;
  let bestD = Infinity;
  for (const s of stationList) {
    const d = Math.hypot(n.x - s.x, n.y - s.y);
    if (d < bestD) {
      bestD = d;
      best = s.id;
    }
  }
  return best;
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 0.0001) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + dx * t;
  const cy = y1 + dy * t;
  return Math.hypot(px - cx, py - cy);
}

function minDistanceToEdges(x, y) {
  let best = Infinity;
  for (const e of edges) {
    const a = nodes[e.a];
    const b = nodes[e.b];
    if (!a || !b) continue;
    const d = pointToSegmentDistance(x, y, a.x, a.y, b.x, b.y);
    if (d < best) best = d;
  }
  return best;
}

function pickTargetStation(startStationId, liveStations, preferIntercity = false) {
  if (!liveStations || liveStations.length === 0) return null;
  if (!preferIntercity || liveStations.length === 1) {
    return liveStations[Math.floor(Math.random() * liveStations.length)];
  }

  const candidates = liveStations.filter((s) => s.id !== startStationId);
  if (candidates.length === 0) return liveStations[0];

  // Favor farther destinations to make cross-city traffic more obvious.
  let picked = candidates[0];
  if (Math.random() < 0.72) {
    let best = -1;
    const startNode = stationNodeById.get(startStationId);
    for (const s of candidates) {
      const sn = stationNodeById.get(s.id);
      if (startNode == null || sn == null) continue;
      const d = nodeDist(nodes[startNode], nodes[sn]);
      if (d > best) {
        best = d;
        picked = s;
      }
    }
  } else {
    picked = candidates[Math.floor(Math.random() * candidates.length)];
  }
  return picked;
}

function buildParcels(stationList) {
  parcels = [];
  if (nodes.length === 0 || stationList.length === 0) return;
  const profile = gp();

  const stationById = new Map(stationList.map((s) => [s.id, s]));

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const sid = nodeOwnerStationId(i, stationList);
    const s = stationById.get(sid);
    if (!s || s.active === false) continue;

    const vitality = clamp(Number(s.vitality ?? 0.5), 0, 1);
    const population = clamp(Number(s.population ?? 0), 0, 1000);
    const decayThreshold = clamp(Number(s.decayThreshold ?? 0.8), 0, 1);
    const strain = Math.max(0, population / 1000 - decayThreshold);
    const resilience = clamp(1 - strain * 1.4, 0.2, 1);

    const blockCount = Math.max(
      1,
      Math.min(7, Math.round((0.6 + vitality * 2.6 + population / 520) * resilience * profile.parcelBlockScale)),
    );

    for (let b = 0; b < blockCount; b++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * (5 + vitality * 10);
      const cx = n.x + Math.cos(a) * r;
      const cy = n.y + Math.sin(a) * r;

      const cols = 2 + Math.floor(Math.random() * 3);
      const rows = 2 + Math.floor(Math.random() * 2);
      const wobble = 0.65 + Math.random() * 0.35;

      for (let iy = 0; iy < rows; iy++) {
        for (let ix = 0; ix < cols; ix++) {
          const ox = (ix - (cols - 1) * 0.5) * PARCEL_GRID_STEP;
          const oy = (iy - (rows - 1) * 0.5) * PARCEL_GRID_STEP;
          const x = cx + ox + (Math.random() - 0.5) * wobble;
          const y = cy + oy + (Math.random() - 0.5) * wobble;
          const birth = (n.birth || 0) + 2 + (ix + iy) * 1.4 + Math.random() * profile.parcelBirthJitter;
          parcels.push({ x, y, birth, stationId: sid });
        }
      }
    }
  }
}

function assignGrowthTimeline(stationList) {
  const profile = gp();
  const stationRoots = stationList
    .map((s) => stationNodeById.get(s.id))
    .filter((id) => id != null);

  if (stationRoots.length === 0) {
    for (const n of nodes) n.birth = Infinity;
    for (const e of edges) e.birth = Infinity;
    return;
  }

  const nodeDistance = new Array(nodes.length).fill(Infinity);
  const visited = new Array(nodes.length).fill(false);
  for (const rootId of stationRoots) {
    nodeDistance[rootId] = 0;
  }

  // Naive Dijkstra: enough for current graph sizes and gives stable radial growth.
  for (let step = 0; step < nodes.length; step++) {
    let current = -1;
    let best = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      if (visited[i]) continue;
      if (nodeDistance[i] < best) {
        best = nodeDistance[i];
        current = i;
      }
    }

    if (current < 0 || !Number.isFinite(best)) break;
    visited[current] = true;

    const base = nodeDistance[current];
    const neighbors = adjacency.get(current) || [];
    for (const e of neighbors) {
      const next = e.to;
      const d = base + e.cost;
      if (d < nodeDistance[next]) {
        nodeDistance[next] = d;
      }
    }
  }

  for (let i = 0; i < nodes.length; i++) {
    const d = Number.isFinite(nodeDistance[i]) ? nodeDistance[i] : 0;
    const jitter = Math.random() * profile.nodeBirthJitterSec;
    nodes[i].birth = profile.growthStartDelaySec + d * profile.nodeGrowthSecPerUnit + jitter;
  }

  for (const e of edges) {
    const aBirth = nodes[e.a] ? nodes[e.a].birth : 0;
    const bBirth = nodes[e.b] ? nodes[e.b].birth : 0;
    const base = Math.max(aBirth, bBirth);
    const kindDelay = e.kind === PIXEL_KIND.ROAD_INTERCITY ? profile.edgeIntercityExtraSec : profile.edgeLocalExtraSec;
    const jitter = Math.random() * profile.edgeBirthJitterSec;
    e.birth = base + kindDelay + jitter;
  }
}

function nearestNodeToPoint(x, y, maxDistance = Infinity) {
  let best = -1;
  let bestD = maxDistance;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const d = Math.hypot(n.x - x, n.y - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function buildStationAttractors(station) {
  if (station.active === false) return [];
  const out = [];
  const profile = gp();
  const vitality = clamp(Number(station.vitality ?? 0.5), 0, 1);
  const population = clamp(Number(station.population ?? 0), 0, 1000);
  const decayThreshold = clamp(Number(station.decayThreshold ?? 0.8), 0, 1);
  const saturation = population / 1000;
  const strain = Math.max(0, saturation - decayThreshold);
  const resilience = clamp(1 - strain * 1.4, 0.25, 1);
  const spread = (55 + vitality * 185) * (0.82 + resilience * 0.28) * profile.attractorSpreadScale;
  const count = Math.max(
    10,
    Math.min(48, Math.round((10 + vitality * 14 + population * 0.018) * (0.72 + resilience * 0.58) * profile.attractorCountScale)),
  );
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * spread;
    out.push({
      x: station.x + Math.cos(a) * r,
      y: station.y + Math.sin(a) * r,
      stationId: station.id,
    });
  }
  return out;
}

function growClusterForStation(station, rootNodeId) {
  const localNodeIds = [rootNodeId];
  let localAttractors = buildStationAttractors(station);
  const profile = gp();

  const vitality = clamp(Number(station.vitality ?? 0.5), 0, 1);
  const population = clamp(Number(station.population ?? 0), 0, 1000);
  const popNorm = population / 1000;

  const influenceRadius = 88 + vitality * 42 + popNorm * 18;
  const killRadius = 10 + vitality * 2;
  const stepSize = 9.5 + vitality * 3;
  const iterations = Math.round(22 + vitality * 14 + popNorm * 10);

  for (let iter = 0; iter < iterations; iter++) {
    if (localAttractors.length === 0) break;

    const accum = new Map();
    const survivors = [];

    for (const a of localAttractors) {
      let bestNode = -1;
      let bestD = Infinity;

      for (const id of localNodeIds) {
        const n = nodes[id];
        const d = Math.hypot(a.x - n.x, a.y - n.y);
        if (d < bestD) {
          bestD = d;
          bestNode = id;
        }
      }

      if (bestNode < 0) continue;
      if (bestD <= killRadius) continue;
      if (bestD > influenceRadius) {
        survivors.push(a);
        continue;
      }

      const n = nodes[bestNode];
      const dx = (a.x - n.x) / Math.max(bestD, 0.0001);
      const dy = (a.y - n.y) / Math.max(bestD, 0.0001);
      const prev = accum.get(bestNode) || { dx: 0, dy: 0, count: 0 };
      prev.dx += dx;
      prev.dy += dy;
      prev.count += 1;
      accum.set(bestNode, prev);
      survivors.push(a);
    }

    localAttractors = survivors;
    if (accum.size === 0) break;

    const created = [];
    for (const [nodeId, v] of accum.entries()) {
      if (v.count < 2 && Math.random() < profile.branchRejectBias) continue;

      const base = nodes[nodeId];
      const mag = Math.hypot(v.dx, v.dy);
      if (mag < 0.0001) continue;

      const nx = base.x + (v.dx / mag) * stepSize;
      const ny = base.y + (v.dy / mag) * stepSize;

      // Prevent over-dense noisy scribbles by rejecting nodes too close to existing streets.
      if (edges.length > 5 && minDistanceToEdges(nx, ny) < profile.nearEdgeRejectDistance) {
        continue;
      }

      let near = -1;
      let nearD = stepSize * 0.65;
      for (const id of localNodeIds) {
        const n = nodes[id];
        const d = Math.hypot(nx - n.x, ny - n.y);
        if (d < nearD) {
          nearD = d;
          near = id;
        }
      }

      if (near >= 0) {
        addEdge(nodeId, near, PIXEL_KIND.ROAD_LOCAL);
        continue;
      }

      const newId = addNode(nx, ny, station.id);
      addEdge(nodeId, newId, PIXEL_KIND.ROAD_LOCAL);
      localNodeIds.push(newId);
      created.push(newId);
    }

    for (let i = 1; i < created.length; i++) {
      if (Math.random() < 0.16) {
        addEdge(created[i - 1], created[i], PIXEL_KIND.ROAD_LOCAL);
      }
    }
  }

  return localNodeIds;
}

function addInterCityRoads(stationList) {
  if (stationList.length <= 1) return;

  const stationNodes = stationList
    .map((s) => ({ station: s, nodeId: stationNodeById.get(s.id) }))
    .filter((v) => v.nodeId != null);
  if (stationNodes.length <= 1) return;

  // MST-style backbone to always connect all station cities.
  const connected = new Set([stationNodes[0].nodeId]);
  while (connected.size < stationNodes.length) {
    let best = null;
    for (const from of stationNodes) {
      if (!connected.has(from.nodeId)) continue;
      for (const to of stationNodes) {
        if (connected.has(to.nodeId)) continue;
        const d = nodeDist(nodes[from.nodeId], nodes[to.nodeId]);
        if (!best || d < best.d) {
          best = { a: from.nodeId, b: to.nodeId, d };
        }
      }
    }
    if (!best) break;
    addEdge(best.a, best.b, PIXEL_KIND.ROAD_INTERCITY);
    connected.add(best.b);
  }

  // Secondary inter-city routes for emergent regional mesh.
  for (let i = 0; i < stationNodes.length; i++) {
    for (let j = i + 1; j < stationNodes.length; j++) {
      if (Math.random() < 0.18) {
        addEdge(stationNodes[i].nodeId, stationNodes[j].nodeId, PIXEL_KIND.ROAD_INTERCITY);
      }
    }
  }
}

function growRoadNetwork(stationList) {
  nodes = [];
  edges = [];
  adjacency = new Map();
  stationNodeById = new Map();
  attractors = [];

  for (const s of stationList) {
    const id = addNode(s.x, s.y, s.id);
    stationNodeById.set(s.id, id);
  }

  for (const s of stationList) {
    const rootId = stationNodeById.get(s.id);
    if (rootId == null) continue;
    growClusterForStation(s, rootId);
  }

  addInterCityRoads(stationList);
}

function astar(start, goal) {
  if (start < 0 || goal < 0 || start === goal) return [start, goal];
  if (!nodes[start] || !nodes[goal]) return null;

  const open = new Set([start]);
  const cameFrom = new Map();
  const gScore = new Map([[start, 0]]);
  const fScore = new Map([[start, nodeDist(nodes[start], nodes[goal])]]);

  while (open.size > 0) {
    let current = -1;
    let bestF = Infinity;
    for (const id of open) {
      const f = fScore.get(id) ?? Infinity;
      if (f < bestF) {
        bestF = f;
        current = id;
      }
    }

    if (current === goal) {
      const path = [current];
      while (cameFrom.has(current)) {
        current = cameFrom.get(current);
        path.push(current);
      }
      path.reverse();
      return path;
    }

    open.delete(current);
    const neighbors = adjacency.get(current) || [];
    for (const edge of neighbors) {
      const tentative = (gScore.get(current) ?? Infinity) + edge.cost;
      if (tentative < (gScore.get(edge.to) ?? Infinity)) {
        cameFrom.set(edge.to, current);
        gScore.set(edge.to, tentative);
        fScore.set(edge.to, tentative + nodeDist(nodes[edge.to], nodes[goal]));
        open.add(edge.to);
      }
    }
  }

  return null;
}

function clearAgents() {
  for (let i = 0; i < MAX_AGENTS; i++) {
    agentActive[i] = 0;
    agentPath[i] = null;
    agentCurrentNode[i] = -1;
    agentSegmentIndex[i] = 0;
    agentSegmentT[i] = 0;
    agentBirthSec[i] = 0;
    if (physicsWorld && agentBody[i]) {
      physicsWorld.destroyBody(agentBody[i]);
      agentBody[i] = null;
    }
  }
}

function tryEnablePlanck() {
  if (physicsChecked) return;
  physicsChecked = true;
  if (!physicsRequested) return;

  try {
    importScripts('https://cdn.jsdelivr.net/npm/planck@1.0.0/dist/planck.min.js');
    if (self.planck) {
      planckLib = self.planck;
      physicsEnabled = true;
    }
  } catch (err) {
    physicsEnabled = false;
  }
}

function initPhysicsWorld() {
  if (!physicsEnabled || !planckLib) {
    physicsWorld = null;
    return;
  }

  const Vec2 = planckLib.Vec2;
  physicsWorld = new planckLib.World(Vec2(0, 0));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x);
    maxY = Math.max(maxY, n.y);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    minX = 0;
    minY = 0;
    maxX = 1200;
    maxY = 800;
  }

  const margin = 140;
  minX -= margin;
  minY -= margin;
  maxX += margin;
  maxY += margin;

  const bounds = physicsWorld.createBody();
  bounds.createFixture(planckLib.Edge(Vec2(minX, minY), Vec2(maxX, minY)), { friction: 0.15, restitution: 0.1 });
  bounds.createFixture(planckLib.Edge(Vec2(maxX, minY), Vec2(maxX, maxY)), { friction: 0.15, restitution: 0.1 });
  bounds.createFixture(planckLib.Edge(Vec2(maxX, maxY), Vec2(minX, maxY)), { friction: 0.15, restitution: 0.1 });
  bounds.createFixture(planckLib.Edge(Vec2(minX, maxY), Vec2(minX, minY)), { friction: 0.15, restitution: 0.1 });
}

function ensureAgentBody(i) {
  if (!physicsWorld || !planckLib || !agentActive[i]) return;
  if (agentBody[i]) return;

  const Vec2 = planckLib.Vec2;
  const body = physicsWorld.createDynamicBody({
    position: Vec2(agentX[i], agentY[i]),
    linearDamping: 5.5,
    angularDamping: 10,
    fixedRotation: true,
    bullet: false,
  });

  const radius = agentType[i] === AGENT_TYPE.CAR ? 2.8 : 2.0;
  body.createFixture(planckLib.Circle(radius), {
    density: 1,
    friction: 0.1,
    restitution: 0.15,
  });
  agentBody[i] = body;
}

function rebuildAgents(stationList) {
  clearAgents();
  if (stationList.length === 0 || nodes.length < 2) return;

  const liveStations = stationList.filter((s) => s.active !== false);
  if (liveStations.length === 0) return;

  let slot = 0;
  for (const station of liveStations) {
    const stationNode = stationNodeById.get(station.id);
    if (stationNode == null) continue;

    const population = clamp(Number(station.population ?? 0), 0, 1000);
    const vitality = clamp(Number(station.vitality ?? 0.5), 0, 1);
    const decayThreshold = clamp(Number(station.decayThreshold ?? 0.8), 0, 1);
    const saturation = population / 1000;
    const strain = Math.max(0, saturation - decayThreshold);
    const resilience = clamp(1 - strain * 1.3, 0.2, 1);
    const spawnCount = Math.max(10, Math.min(70, Math.round((10 + vitality * 16 + population * 0.04) * resilience)));

    for (let i = 0; i < spawnCount && slot < MAX_AGENTS; i++) {
      const isCar = (i % 3 === 0);
      const targetStation = pickTargetStation(station.id, liveStations, isCar);
      if (!targetStation) continue;
      const goal = stationNodeById.get(targetStation.id);
      if (goal == null) continue;

      const path = astar(stationNode, goal);
      if (!path || path.length < 2) continue;

      agentActive[slot] = 1;
      agentType[slot] = isCar ? AGENT_TYPE.CAR : AGENT_TYPE.WALKER;
      agentSpeed[slot] = agentType[slot] === AGENT_TYPE.CAR ? 48 + Math.random() * 26 : 24 + Math.random() * 16;
      agentCurrentNode[slot] = path[0];
      agentPath[slot] = path;
      agentSegmentIndex[slot] = 0;
      agentSegmentT[slot] = Math.random() * 0.99;
      agentX[slot] = nodes[path[0]].x;
      agentY[slot] = nodes[path[0]].y;
      agentDesiredX[slot] = agentX[slot];
      agentDesiredY[slot] = agentY[slot];
      const startNode = nodes[path[0]];
      const baseBirth = startNode ? startNode.birth : 0;
      if (agentType[slot] === AGENT_TYPE.CAR) {
        agentBirthSec[slot] = baseBirth + 1.0 + Math.random() * 5.0;
      } else {
        agentBirthSec[slot] = baseBirth + AGENT_BIRTH_BASE_SEC + Math.random() * AGENT_BIRTH_JITTER_SEC;
      }
      slot++;
    }
  }

  if (physicsEnabled) {
    initPhysicsWorld();
    for (let i = 0; i < MAX_AGENTS; i++) {
      ensureAgentBody(i);
    }
  }
}

function reseedAgentPath(i, stationList) {
  if (!agentActive[i] || nodes.length < 2 || stationList.length === 0) return;
  const liveStations = stationList.filter((s) => s.active !== false);
  if (liveStations.length === 0) return;
  const currentNode = nearestNodeToPoint(agentX[i], agentY[i], Infinity);
  if (currentNode < 0) return;

  const currentStationId = nodeOwnerStationId(currentNode, liveStations);
  const targetStation = pickTargetStation(currentStationId, liveStations, agentType[i] === AGENT_TYPE.CAR);
  if (!targetStation) return;
  const goalNode = stationNodeById.get(targetStation.id);
  if (goalNode == null) return;

  const path = astar(currentNode, goalNode);
  if (!path || path.length < 2) return;

  agentCurrentNode[i] = path[0];
  agentPath[i] = path;
  agentSegmentIndex[i] = 0;
  agentSegmentT[i] = 0;
}

function updateAgents(dt, stationList) {
  const clampedDt = Math.max(1 / 90, Math.min(1 / 25, dt));

  // 1) Path-following target computation (data-oriented).
  for (let i = 0; i < MAX_AGENTS; i++) {
    if (!agentActive[i]) continue;
    if (worldAgeSec < agentBirthSec[i]) continue;
    const path = agentPath[i];
    if (!path || path.length < 2) {
      reseedAgentPath(i, stationList);
      continue;
    }

    let segIndex = agentSegmentIndex[i];
    if (segIndex >= path.length - 1) {
      reseedAgentPath(i, stationList);
      continue;
    }

    const a = nodes[path[segIndex]];
    const b = nodes[path[segIndex + 1]];
    if (!a || !b) {
      reseedAgentPath(i, stationList);
      continue;
    }

    const len = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    const tStep = (agentSpeed[i] * dt) / len;
    agentSegmentT[i] += tStep;

    while (agentSegmentT[i] >= 1 && segIndex < path.length - 1) {
      agentSegmentT[i] -= 1;
      segIndex += 1;
      agentSegmentIndex[i] = segIndex;
      if (segIndex >= path.length - 1) break;
    }

    if (segIndex >= path.length - 1) {
      agentDesiredX[i] = b.x;
      agentDesiredY[i] = b.y;
      reseedAgentPath(i, stationList);
      continue;
    }

    const n0 = nodes[path[segIndex]];
    const n1 = nodes[path[segIndex + 1]];
    const t = agentSegmentT[i];
    agentDesiredX[i] = n0.x + (n1.x - n0.x) * t;
    agentDesiredY[i] = n0.y + (n1.y - n0.y) * t;
  }

  // 2) Physics steering (Planck) if available.
  if (physicsEnabled && physicsWorld && planckLib) {
    const Vec2 = planckLib.Vec2;
    for (let i = 0; i < MAX_AGENTS; i++) {
      if (!agentActive[i]) continue;
      if (worldAgeSec < agentBirthSec[i]) continue;
      ensureAgentBody(i);
      const body = agentBody[i];
      if (!body) continue;

      const pos = body.getPosition();
      const dx = agentDesiredX[i] - pos.x;
      const dy = agentDesiredY[i] - pos.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.0001) {
        const dirX = dx / d;
        const dirY = dy / d;
        const stiffness = agentType[i] === AGENT_TYPE.CAR ? 90 : 65;
        const fx = dirX * stiffness;
        const fy = dirY * stiffness;
        body.applyForceToCenter(Vec2(fx, fy), true);
      }

      const vel = body.getLinearVelocity();
      const maxSpeed = agentType[i] === AGENT_TYPE.CAR ? 72 : 48;
      const speed = Math.hypot(vel.x, vel.y);
      if (speed > maxSpeed && speed > 0) {
        const scale = maxSpeed / speed;
        body.setLinearVelocity(Vec2(vel.x * scale, vel.y * scale));
      }
    }

    physicsWorld.step(clampedDt, 8, 3);

    for (let i = 0; i < MAX_AGENTS; i++) {
      if (!agentActive[i]) continue;
      if (worldAgeSec < agentBirthSec[i]) continue;
      const body = agentBody[i];
      if (!body) continue;
      const pos = body.getPosition();
      agentX[i] = pos.x;
      agentY[i] = pos.y;
    }
    return;
  }

  // 3) Kinematic fallback.
  for (let i = 0; i < MAX_AGENTS; i++) {
    if (!agentActive[i]) continue;
    if (worldAgeSec < agentBirthSec[i]) continue;
    agentX[i] = agentDesiredX[i];
    agentY[i] = agentDesiredY[i];
  }
}

function buildWorld(stationList) {
  tryEnablePlanck();
  growRoadNetwork(stationList);
  assignGrowthTimeline(stationList);
  buildParcels(stationList);
  rebuildAgents(stationList);
  worldAgeSec = 0;
  worldDirty = false;
}

function pushPixel(view, cursor, x, y, kind, alpha) {
  if (cursor >= MAX_PIXELS) return cursor;
  const offset = cursor * FLOATS_PER_PIXEL;
  view[offset] = x;
  view[offset + 1] = y;
  view[offset + 2] = kind;
  view[offset + 3] = alpha;
  return cursor + 1;
}

function rasterizeLine(view, cursor, x1, y1, x2, y2, kind, alpha, step = 2) {
  const d = Math.hypot(x2 - x1, y2 - y1);
  const segs = Math.max(1, Math.floor(d / step));
  for (let i = 0; i <= segs && cursor < MAX_PIXELS; i++) {
    const t = i / segs;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    cursor = pushPixel(view, cursor, x, y, kind, alpha);
  }
  return cursor;
}

function renderWorldToBuffer(view) {
  view.fill(0);
  let cursor = 0;

  // Roads
  for (let i = 0; i < edges.length && cursor < MAX_PIXELS; i++) {
    const e = edges[i];
    if (worldAgeSec < (e.birth || 0)) continue;
    const a = nodes[e.a];
    const b = nodes[e.b];
    if (!a || !b) continue;
    const kind = e.kind || PIXEL_KIND.ROAD_LOCAL;
    const alpha = kind === PIXEL_KIND.ROAD_INTERCITY ? 0.42 : 0.2;
    const step = kind === PIXEL_KIND.ROAD_INTERCITY ? 1.9 : 2.5;
    cursor = rasterizeLine(view, cursor, a.x, a.y, b.x, b.y, kind, alpha, step);
  }

  // Station hubs
  for (const station of stations.values()) {
    if (!Number.isFinite(station.x) || !Number.isFinite(station.y)) continue;
    const stationNode = stationNodeById.get(station.id);
    if (stationNode != null) {
      const node = nodes[stationNode];
      if (node && worldAgeSec < (node.birth || 0)) continue;
    }
    const r = 4;
    for (let dy = -r; dy <= r && cursor < MAX_PIXELS; dy++) {
      for (let dx = -r; dx <= r && cursor < MAX_PIXELS; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        cursor = pushPixel(view, cursor, station.x + dx, station.y + dy, PIXEL_KIND.HUB, 0.9);
      }
    }
  }

  // Building/parcel growth: appears slowly from station-city seeds.
  for (let i = 0; i < parcels.length && cursor < MAX_PIXELS; i++) {
    const b = parcels[i];
    if (worldAgeSec < b.birth) continue;
    cursor = pushPixel(view, cursor, b.x, b.y, PIXEL_KIND.BLOCK, 0.85);
  }

  // Agents
  for (let i = 0; i < MAX_AGENTS && cursor < MAX_PIXELS; i++) {
    if (!agentActive[i]) continue;
    if (worldAgeSec < agentBirthSec[i]) continue;
    const kind = agentType[i] === AGENT_TYPE.CAR ? PIXEL_KIND.CAR : PIXEL_KIND.WALKER;
    const alpha = agentType[i] === AGENT_TYPE.CAR ? 0.95 : 0.8;
    cursor = pushPixel(view, cursor, agentX[i], agentY[i], kind, alpha);
  }

  return cursor;
}

function computeWorldMetrics(stationList, usedPixels) {
  let walkers = 0;
  let cars = 0;
  for (let i = 0; i < MAX_AGENTS; i++) {
    if (!agentActive[i]) continue;
    if (agentType[i] === AGENT_TYPE.CAR) cars += 1;
    else walkers += 1;
  }

  const activeStations = stationList.filter((s) => s.active !== false);
  let avgVitality = 0;
  let avgStrain = 0;
  if (activeStations.length > 0) {
    for (const s of activeStations) {
      const population = clamp(Number(s.population || 0), 0, 1000);
      const decayThreshold = clamp(Number(s.decayThreshold ?? 0.8), 0, 1);
      const saturation = population / 1000;
      const strain = Math.max(0, saturation - decayThreshold);
      avgVitality += clamp(Number(s.vitality ?? 0.5), 0, 1);
      avgStrain += strain;
    }
    avgVitality /= activeStations.length;
    avgStrain /= activeStations.length;
  }

  const intercityEdges = edges.filter((e) => e.kind === PIXEL_KIND.ROAD_INTERCITY).length;
  const localEdges = Math.max(0, edges.length - intercityEdges);
  const roadPressure = clamp((cars * 1.8 + walkers * 0.7) / Math.max(1, localEdges + intercityEdges * 1.5), 0, 2.5);

  let urbanState = 'stagnation';
  if (activeStations.length === 0 || avgStrain > 0.7) {
    urbanState = 'ruin';
  } else if (roadPressure > 1.25 || (cars > walkers * 1.1 && roadPressure > 0.85)) {
    urbanState = 'gridlock';
  } else if (avgVitality > 0.62 && avgStrain < 0.2 && roadPressure < 0.95) {
    urbanState = 'expansion';
  }

  return {
    stations: stationList.length,
    activeStations: activeStations.length,
    nodes: nodes.length,
    edges: edges.length,
    intercityEdges,
    localEdges,
    pixels: usedPixels,
    walkers,
    cars,
    roadPressure,
    avgVitality,
    avgStrain,
    urbanState,
    physics: physicsEnabled,
  };
}

self.onmessage = function (e) {
  const msg = e.data;

  switch (msg.type) {
    case 'INIT':
      physicsRequested = msg.enablePhysics !== false;
      setGrowthProfile(msg.growthProfile);
      tryEnablePlanck();
      break;

    case 'SET_GROWTH_PROFILE':
      setGrowthProfile(msg.growthProfile);
      break;

    case 'START':
      isRunning = true;
      break;

    case 'STOP':
      isRunning = false;
      break;

    case 'UPDATE_STATION':
      if (msg.station) {
        const prev = stations.get(msg.station.id);
        const nextStation = {
          ...msg.station,
          x: Number(msg.station.x),
          y: Number(msg.station.y),
          active: msg.station.active !== false,
          ghost: !!msg.station.ghost,
          population: Number(msg.station.population || 0),
          vitality: Number(msg.station.vitality || 0),
          decayThreshold: Number(msg.station.decayThreshold || 0),
        };
        stations.set(msg.station.id, nextStation);

        const moved = !prev
          || Math.abs((prev.x || 0) - nextStation.x) > 0.25
          || Math.abs((prev.y || 0) - nextStation.y) > 0.25;
        const activeChanged = !!prev && (prev.active !== nextStation.active);

        if (moved || activeChanged || !prev) {
          worldDirty = true;
        } else {
          const stationList = Array.from(stations.values()).filter((s) => Number.isFinite(s.x) && Number.isFinite(s.y));
          buildParcels(stationList);
          rebuildAgents(stationList);
        }
      }
      break;

    case 'REMOVE_STATION':
      if (msg.stationId) {
        stations.delete(msg.stationId);
        worldDirty = true;
      }
      break;

    case 'FRAME_REQUEST': {
      if (!isRunning) return;

      const now = performance.now();
      frameMs = lastTimestamp > 0 ? Math.max(10, Math.min(33, now - lastTimestamp)) : 16.67;
      lastTimestamp = now;

      const buffer = msg.buffer;
      const view = new Float32Array(buffer);
      const stationList = Array.from(stations.values()).filter((s) => Number.isFinite(s.x) && Number.isFinite(s.y));

      if (worldDirty) {
        buildWorld(stationList);
      }

      worldAgeSec += frameMs / 1000;

      updateAgents(frameMs / 1000, stationList);
      const usedPixels = renderWorldToBuffer(view);
      const metrics = computeWorldMetrics(stationList, usedPixels);

      self.postMessage(
        {
          type: 'FRAME_DATA',
          buffer,
          metrics,
        },
        [buffer],
      );
      break;
    }

    default:
      break;
  }
};
