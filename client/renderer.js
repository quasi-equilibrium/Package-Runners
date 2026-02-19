import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { CHARACTERS, LEVELS } from "../shared/constants.js";

function buildTextSprite(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(0, 6, 256, 44);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 28px Nunito";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.slice(0, 16), 128, 29);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.7, 0.9, 1);
  sprite.position.set(0, 2.7, 0);
  return sprite;
}

function createBody(characterId) {
  const character = CHARACTERS[characterId] ?? CHARACTERS.doritos_like;
  const group = new THREE.Group();

  let body;
  if (character.shape === "tube") {
    body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 2.4, 18),
      new THREE.MeshStandardMaterial({ color: character.colorA, roughness: 0.42, metalness: 0.06 })
    );
  } else if (character.shape === "horizontal-pack") {
    body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.52, 1.3, 7, 12),
      new THREE.MeshStandardMaterial({ color: character.colorA, roughness: 0.5, metalness: 0.03 })
    );
    body.rotation.z = Math.PI / 2;
  } else {
    body = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 2.2, 0.7),
      new THREE.MeshStandardMaterial({ color: character.colorA, roughness: 0.48, metalness: 0.04 })
    );
    if (character.shape === "tri-pack") {
      body.scale.x = 1.16;
      body.scale.y = 1.1;
      body.rotation.z = 0.08;
    }
  }

  const stripe = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.55),
    new THREE.MeshStandardMaterial({ color: character.colorB, roughness: 0.6, metalness: 0.01 })
  );
  stripe.position.set(0, 0.4, 0.37);

  const armL = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.11, 0.9, 8),
    new THREE.MeshStandardMaterial({ color: "#f4c7b8" })
  );
  const armR = armL.clone();
  armL.position.set(-0.75, 0.2, 0);
  armR.position.set(0.75, 0.2, 0);
  armL.rotation.z = 0.5;
  armR.rotation.z = -0.5;

  const legY = -1.25;
  const legScale = character.legScale ?? 1;
  const legL = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 0.9 * legScale, 8),
    new THREE.MeshStandardMaterial({ color: "#2e3748" })
  );
  const legR = legL.clone();
  legL.position.set(-0.34, legY, 0);
  legR.position.set(0.34, legY, 0);

  group.add(body, stripe, armL, armR, legL, legR);
  group.userData.legs = [legL, legR];
  return group;
}

function createHazardMesh(hazard) {
  const group = new THREE.Group();
  let mesh;
  if (hazard.requires === "jump") {
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 1.7, 0.45),
      new THREE.MeshStandardMaterial({ color: "#d84a4a", emissive: "#5c1414", emissiveIntensity: 0.25 })
    );
    mesh.position.y = 0.85;
  } else {
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.9, 0.45),
      new THREE.MeshStandardMaterial({ color: "#4a9ed8", emissive: "#14305c", emissiveIntensity: 0.25 })
    );
    mesh.position.y = 1.45;
  }
  group.add(mesh);
  return group;
}

function blend(a, b, alpha) {
  return a + (b - a) * alpha;
}

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-16, 16, 9, -9, 0.1, 100);
    this.camera.position.set(0, 3, 24);

    this.bgGroup = new THREE.Group();
    this.worldGroup = new THREE.Group();
    this.scene.add(this.bgGroup, this.worldGroup);

    this.ambient = new THREE.AmbientLight("#ffffff", 1.2);
    this.sun = new THREE.DirectionalLight("#ffffff", 0.8);
    this.sun.position.set(5, 12, 8);
    this.scene.add(this.ambient, this.sun);

    this.racerMeshes = new Map();
    this.hazardMeshes = new Map();
    this.oilMeshes = new Map();
    this.personalBoxMesh = null;
    this.snapshotBuffer = [];
    this.currentLevelId = "ice";
    this.selfPlayerId = null;
    this.animStart = performance.now();

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2200, 6),
      new THREE.MeshStandardMaterial({ color: "#7bc8f6", roughness: 0.85, metalness: 0.03 })
    );
    this.ground.position.set(500, -2.3, 0);
    this.worldGroup.add(this.ground);

    this.resize = this.resize.bind(this);
    this.animate = this.animate.bind(this);
    window.addEventListener("resize", this.resize);
    this.resize();
    this.frameHandle = requestAnimationFrame(this.animate);
  }

  destroy() {
    cancelAnimationFrame(this.frameHandle);
    window.removeEventListener("resize", this.resize);
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    const aspect = width / Math.max(1, height);
    const viewHeight = 18;
    this.camera.left = (-viewHeight * aspect) / 2;
    this.camera.right = (viewHeight * aspect) / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
  }

  setLevel(levelId) {
    const level = LEVELS[levelId] ?? LEVELS.ice;
    this.currentLevelId = level.id;
    this.scene.background = new THREE.Color(level.sky[0]);
    this.ground.material.color = new THREE.Color(level.ground);
    this.bgGroup.clear();

    const skyPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(2200, 180),
      new THREE.MeshBasicMaterial({ color: level.sky[1] })
    );
    skyPanel.position.set(500, 58, -8);
    this.bgGroup.add(skyPanel);

    for (let i = 0; i < 18; i += 1) {
      const cloud = new THREE.Mesh(
        new THREE.CircleGeometry(2 + Math.random() * 2.8, 16),
        new THREE.MeshBasicMaterial({ color: level.accent, transparent: true, opacity: 0.15 })
      );
      cloud.position.set(i * 58 + Math.random() * 12, 9 + Math.random() * 9, -5);
      this.bgGroup.add(cloud);
    }
  }

  start(matchStartPayload, selfPlayerId) {
    this.selfPlayerId = selfPlayerId;
    this.snapshotBuffer = [];
    this.worldGroup.remove(...this.racerMeshes.values());
    this.worldGroup.remove(...this.hazardMeshes.values());
    this.worldGroup.remove(...this.oilMeshes.values());
    this.racerMeshes.clear();
    this.hazardMeshes.clear();
    this.oilMeshes.clear();
    if (this.personalBoxMesh) {
      this.worldGroup.remove(this.personalBoxMesh);
      this.personalBoxMesh = null;
    }
    this.setLevel(matchStartPayload.levelId);
  }

  pushSnapshot(snapshot) {
    this.snapshotBuffer.push({
      t: performance.now(),
      snapshot
    });
    if (this.snapshotBuffer.length > 18) {
      this.snapshotBuffer.shift();
    }
  }

  ensureRacerMesh(racer) {
    if (this.racerMeshes.has(racer.id)) {
      return this.racerMeshes.get(racer.id);
    }
    const root = new THREE.Group();
    const body = createBody(racer.characterId);
    const label = buildTextSprite(racer.nickname);
    root.add(body);
    root.add(label);
    root.userData.body = body;
    root.userData.label = label;
    root.userData.botHalo = null;
    if (racer.isBot) {
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(0.95, 1.2, 20),
        new THREE.MeshBasicMaterial({ color: "#ff9f1c", side: THREE.DoubleSide })
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.y = -1.35;
      root.add(halo);
      root.userData.botHalo = halo;
    }
    this.worldGroup.add(root);
    this.racerMeshes.set(racer.id, root);
    return root;
  }

  syncHazards(hazards = []) {
    const activeIds = new Set();
    for (const hazard of hazards) {
      activeIds.add(hazard.id);
      if (!this.hazardMeshes.has(hazard.id)) {
        const mesh = createHazardMesh(hazard);
        mesh.position.set(hazard.x, 0, 0);
        this.hazardMeshes.set(hazard.id, mesh);
        this.worldGroup.add(mesh);
      }
    }
    for (const [id, mesh] of this.hazardMeshes) {
      if (!activeIds.has(id)) {
        this.worldGroup.remove(mesh);
        this.hazardMeshes.delete(id);
      }
    }
  }

  syncOils(oils = []) {
    const activeIds = new Set();
    for (const oil of oils) {
      activeIds.add(oil.id);
      if (!this.oilMeshes.has(oil.id)) {
        const mesh = new THREE.Mesh(
          new THREE.CircleGeometry(oil.radius, 24),
          new THREE.MeshBasicMaterial({ color: "#ffd100", transparent: true, opacity: 0.56 })
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(oil.x, -1.48, 0);
        this.oilMeshes.set(oil.id, mesh);
        this.worldGroup.add(mesh);
      } else {
        const mesh = this.oilMeshes.get(oil.id);
        mesh.position.x = oil.x;
      }
    }
    for (const [id, mesh] of this.oilMeshes) {
      if (!activeIds.has(id)) {
        this.worldGroup.remove(mesh);
        this.oilMeshes.delete(id);
      }
    }
  }

  syncPersonalBox(personalBox) {
    if (!personalBox) {
      if (this.personalBoxMesh) {
        this.worldGroup.remove(this.personalBoxMesh);
        this.personalBoxMesh = null;
      }
      return;
    }
    if (!this.personalBoxMesh) {
      this.personalBoxMesh = new THREE.Group();
      const cube = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 1.1, 1.1),
        new THREE.MeshStandardMaterial({ color: "#ffec99", emissive: "#8a651a", emissiveIntensity: 0.34 })
      );
      const mark = new THREE.Mesh(
        new THREE.PlaneGeometry(0.45, 0.45),
        new THREE.MeshBasicMaterial({ color: "#1a1a1a" })
      );
      mark.position.z = 0.56;
      this.personalBoxMesh.add(cube, mark);
      this.worldGroup.add(this.personalBoxMesh);
    }
    this.personalBoxMesh.position.set(personalBox.x, 0.5, 0);
    this.personalBoxMesh.rotation.y += 0.02;
  }

  animate() {
    this.frameHandle = requestAnimationFrame(this.animate);
    const targetTime = performance.now() - 80;
    if (this.snapshotBuffer.length === 0) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    let from = this.snapshotBuffer[0];
    let to = this.snapshotBuffer[this.snapshotBuffer.length - 1];
    for (let i = 0; i < this.snapshotBuffer.length - 1; i += 1) {
      const first = this.snapshotBuffer[i];
      const second = this.snapshotBuffer[i + 1];
      if (targetTime >= first.t && targetTime <= second.t) {
        from = first;
        to = second;
        break;
      }
    }

    const delta = Math.max(1, to.t - from.t);
    const alpha = clamp01((targetTime - from.t) / delta);
    const racersA = new Map(from.snapshot.racers.map((entry) => [entry.id, entry]));
    const racersB = new Map(to.snapshot.racers.map((entry) => [entry.id, entry]));
    const ids = new Set([...racersA.keys(), ...racersB.keys()]);

    for (const id of ids) {
      const a = racersA.get(id) ?? racersB.get(id);
      const b = racersB.get(id) ?? a;
      const mesh = this.ensureRacerMesh(b);
      const x = blend(a.x, b.x, alpha);
      const y = blend(a.y, b.y, alpha);
      mesh.position.set(x, y, 0);
      const bob = Math.sin((performance.now() - this.animStart) * 0.009 + x) * 0.1;
      const legs = mesh.userData.body.userData.legs ?? [];
      const stride = Math.sin((performance.now() - this.animStart) * 0.018 + x);
      if (legs[0]) {
        legs[0].rotation.z = stride * 0.38 + (b.state === "slide" ? 0.3 : 0);
      }
      if (legs[1]) {
        legs[1].rotation.z = -stride * 0.38 - (b.state === "slide" ? 0.3 : 0);
      }
      mesh.userData.body.position.y = bob;
      if (b.activePower === "rocket") {
        mesh.userData.body.scale.set(1.05, 1.05, 1.05);
      } else {
        mesh.userData.body.scale.set(1, 1, 1);
      }
    }

    this.syncHazards(to.snapshot.hazards);
    this.syncOils(to.snapshot.oils);
    this.syncPersonalBox(to.snapshot.personalBox);

    const self = to.snapshot.racers.find((entry) => entry.id === this.selfPlayerId);
    const cameraTargetX = self ? self.x + 10 : 10;
    this.camera.position.x = blend(this.camera.position.x, cameraTargetX, 0.18);
    this.camera.position.y = 3.5;
    this.renderer.render(this.scene, this.camera);
  }
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
