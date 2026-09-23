import * as THREE from 'three';
import { USDLoader } from 'three/addons/loaders/USDLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeScreenTexture } from './screen-texture.js?v=17';

const viewport = document.querySelector('#viewport');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 250);
camera.position.set(0, 0, 40);
camera.lookAt(0, 0, 0.275454);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
viewport.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0.275454);
controls.enablePan = true;
controls.minDistance = 12;
controls.maxDistance = 100;
controls.update();
// Start with a slight view from below, while leaving orbit controls free.
camera.position.set(9, -5, 40);
controls.update();
let manualView = false;
controls.addEventListener('start', () => { manualView = true; });

const environment = new RoomEnvironment();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(environment, 0.04).texture;
environment.dispose();
pmrem.dispose();
scene.environmentIntensity = 1.35;
scene.add(new THREE.HemisphereLight(0xffffff, 0xb5baa8, 1.8));
const key = new THREE.DirectionalLight(0xfffcf5, 2.6);
key.position.set(-15, 25, 30);
scene.add(key);
const rim = new THREE.DirectionalLight(0xe8edf5, 2);
rim.position.set(15, 5, -15);
scene.add(rim);

const phone = new THREE.Group();
scene.add(phone);
const bend = { value: 0 };
let angle = 0;
let transition = null;
let ready = false;
const screens = {};
const uiReferenceEye = new THREE.Vector3(0, 0, 40);
// Keep the screenshot aligned with the actual inner-display mesh. The model
// already contains the physical rim; shrinking the texture adds a second one.
const innerDisplayBounds = new THREE.Vector4(-7.89935, 0.34562 - 5.8974, 15.7987, 11.1035);
const innerUIFrame = innerDisplayBounds.clone();
const outerUIFrame = new THREE.Vector4(0.23396, 0.27173 - 5.8974, 7.73936, 11.2513)
  .multiplyScalar((uiReferenceEye.z - 0.24948) / (uiReferenceEye.z - 0.825538));

const placeholder = new THREE.DataTexture(new Uint8Array([22, 22, 26, 255]), 1, 1);
placeholder.needsUpdate = true;
for (const kind of ['inner', 'outer']) {
  screens[kind] = {
    material: new THREE.MeshBasicMaterial({ map: placeholder, toneMapped: false }),
    frame: { value: (kind === 'inner' ? innerUIFrame : outerUIFrame).clone() },
    gradient: { value: new THREE.Vector2(kind === 'inner' ? 0.5 : 0, kind === 'inner' ? 0 : 1) },
    pixel: { value: new THREE.Vector2(1, 1) },
  };
}

const textureLoader = new THREE.TextureLoader();
textureLoader.setCrossOrigin('anonymous');
let latestScreensRequest = 0;

function applyTexture(kind, url, siteUrl, requestId) {
  textureLoader.load(
    url,
    async (source) => {
      if (requestId !== latestScreensRequest) {
        source.dispose();
        return;
      }
      let texture;
      try {
        texture = new THREE.CanvasTexture(await makeScreenTexture(kind, source.image, siteUrl));
      } catch (error) {
        source.dispose();
        console.warn('Duo3D: failed to compose screen texture', kind, error);
        toParent({ type: 'texture-error', kind, requestId });
        return;
      }
      source.dispose();
      if (requestId !== latestScreensRequest) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      const screen = screens[kind];
      if (screen.material.map !== placeholder) screen.material.map.dispose();
      screen.material.map = texture;
      screen.material.needsUpdate = true;
      screen.pixel.value.set(1 / texture.image.width, 1 / texture.image.height);
      screen.frame.value.copy(kind === 'inner' ? innerUIFrame : outerUIFrame);
      screen.gradient.value.set(kind === 'inner' ? 0.5 : 0, kind === 'inner' ? 0 : 1);
      toParent({ type: 'texture-ready', kind, requestId });
    },
    undefined,
    () => {
      if (requestId !== latestScreensRequest) return;
      console.warn('Duo3D: failed to load screen texture', kind);
      toParent({ type: 'texture-error', kind, requestId });
    },
  );
}

function setScreens(inner, outer, siteUrl, requestId) {
  if (!Number.isSafeInteger(requestId) || requestId <= latestScreensRequest) return;
  latestScreensRequest = requestId;
  if (inner) applyTexture('inner', inner, siteUrl, requestId);
  if (outer) applyTexture('outer', outer, siteUrl, requestId);
}

function setAngle(value) {
  angle = value;
  bend.value = ((180 - value) / 180) * Math.PI;
  screens.outer.material.color.setScalar(value >= 180 ? 0 : 1);
  screens.inner.material.color.setScalar(1);
}

const tmpV = new THREE.Vector3();
const viewSize = { w: 1, h: 1 };
let safeInsets = { top: 0, bottom: 0 };
function readViewSize() {
  const rect = viewport.getBoundingClientRect();
  viewSize.w = rect.width;
  viewSize.h = rect.height;
}
function project(x, y, z, out) {
  tmpV.set(x, y, z).project(camera);
  out[0] = (tmpV.x * 0.5 + 0.5) * viewSize.w;
  out[1] = (-tmpV.y * 0.5 + 0.5) * viewSize.h;
  return out;
}
function foldXZ(x, z) {
  const c = Math.cos(bend.value);
  const s = Math.sin(bend.value);
  const y = z - 0.275454;
  return [c * x + s * y, -s * x + c * y + 0.275454];
}
const innerQuad = [[0, 0], [0, 0], [0, 0], [0, 0]];
const outerQuad = [[0, 0], [0, 0], [0, 0], [0, 0]];

function innerWorldCorners() {
  return [
    [-7.89935, 5.55172],
    [7.89935, 5.55172],
    [7.89935, -5.55178],
    [-7.89935, -5.55178],
  ].map(([x, y]) => {
    if (x < 0) {
      const [px, pz] = foldXZ(x, 0.24948);
      return [px, y, pz];
    }
    return [x, y, 0.24948];
  });
}

function outerWorldCorners() {
  return [
    [-0.23396, 5.62563],
    [-7.97332, 5.62563],
    [-7.97332, -5.62567],
    [-0.23396, -5.62567],
  ].map(([x, y]) => {
    const [px, pz] = foldXZ(x, 0.825538);
    return [px, y, pz];
  });
}

function computeQuads() {
  readViewSize();
  const ox = phone.position.x;
  innerWorldCorners().forEach((c, i) => project(c[0] + ox, c[1], c[2], innerQuad[i]));
  outerWorldCorners().forEach((c, i) => project(c[0] + ox, c[1], c[2], outerQuad[i]));
}

function centerPhone() {
  const corners = [...innerWorldCorners(), ...outerWorldCorners()];
  const minX = Math.min(...corners.map((c) => c[0]));
  const maxX = Math.max(...corners.map((c) => c[0]));
  phone.position.x = -(minX + maxX) / 2;
  uiReferenceEye.set(-phone.position.x, 0, 40);
}

let lastPost = { angle: null, inner: null };
function postQuads(force) {
  const signature = innerQuad[0][0].toFixed(1);
  if (!force && signature === lastPost.inner && angle === lastPost.angle) return;
  lastPost = { angle, inner: signature };
  toParent({
    type: 'quads',
    angle,
    inner: innerQuad.map((p) => [p[0], p[1]]),
    outer: outerQuad.map((p) => [p[0], p[1]]),
  });
}


function foldTo(value, animate = true) {
  const target = Math.max(0, Math.min(180, Number(value)));
  if (!animate || Math.abs(target - angle) < 0.01) {
    transition = null;
    setAngle(target);
    return;
  }
  transition = { from: angle, to: target, elapsed: 0 };
}

function fitCamera() {
  const corners = [...innerWorldCorners(), ...outerWorldCorners()];
  // The folding half moves toward the camera. Fit its projected height too,
  // otherwise it can leave the iframe at intermediate angles.
  const focusZ = 0.275454;
  const projected = corners.map(([x, y, z]) => {
    const perspective = (camera.position.z - focusZ) / (camera.position.z - z);
    return [(x + phone.position.x) * perspective, y * perspective];
  });
  const xs = projected.map((point) => point[0]);
  const ys = projected.map((point) => point[1]);
  const modelWidth = Math.max(...xs) - Math.min(...xs);
  const modelHeight = Math.max(...ys) - Math.min(...ys);
  const margin = 2.2;
  const safeHeight = Math.max(1, viewSize.h - safeInsets.top - safeInsets.bottom);
  const pixelsPerUnit = Math.min(viewSize.w / (modelWidth + margin), safeHeight / (modelHeight + margin));
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(viewSize.h / pixelsPerUnit / 2 / 40));
  // Shift the image into the space between the header and bottom controls.
  const offsetY = (safeInsets.bottom - safeInsets.top) / 2;
  camera.setViewOffset(viewSize.w, viewSize.h, 0, offsetY, viewSize.w, viewSize.h);
}

function resize() {
  const { width, height } = viewport.getBoundingClientRect();
  renderer.setSize(width, height);
  camera.aspect = width / height;
  readViewSize();
  if (manualView) camera.setViewOffset(viewSize.w, viewSize.h, 0,
    (safeInsets.bottom - safeInsets.top) / 2, viewSize.w, viewSize.h);
  else fitCamera();
}
new ResizeObserver(resize).observe(viewport);

const screenShader = `
uniform float foldAngle;
uniform vec2 uiPixel;
uniform vec4 uiFrame;
uniform vec2 uiGradient;
uniform vec3 uiReferenceEye;
varying vec3 vUIPosition;
vec3 screenColor() {
  float depth = (0.24948 - uiReferenceEye.z) / (vUIPosition.z - uiReferenceEye.z);
  vec2 projected = uiReferenceEye.xy + (vUIPosition.xy - uiReferenceEye.xy) * depth;
  vec2 sourceUV = (projected - uiFrame.xy) / uiFrame.zw;
  #ifdef INNER_UI
    float progress = clamp(foldAngle / 1.570796327, 0.0, 1.0);
  #else
    float c = cos(foldAngle), s = sin(foldAngle);
    vec2 hingeEdge = vec2(-0.23396, -0.27463 - 0.275454);
    vec2 foldedEdge = vec2(c * hingeEdge.x + s * hingeEdge.y,
      -s * hingeEdge.x + c * hingeEdge.y + 0.275454);
    float edgeDepth = (0.24948 - uiReferenceEye.z) / (foldedEdge.y - uiReferenceEye.z);
    float anchorX = uiReferenceEye.x + (foldedEdge.x - uiReferenceEye.x) * edgeDepth;
    sourceUV.x = uiGradient.x + (projected.x - anchorX) / uiFrame.z;
    float progress = clamp((3.141592654 - foldAngle) / 1.570796327, 0.0, 1.0);
  #endif
  float edge = (sourceUV.x - uiGradient.x) / (uiGradient.y - uiGradient.x);
  float motion = smoothstep(0.0, 1.0, progress);
  float blurGradient = clamp(edge, 0.0, 1.0);
  float darkenGradient = clamp((edge - 0.2) / 0.8, 0.0, 1.0);
  float effect = motion * pow(darkenGradient, 1.35);
  float radius = 72.0 * motion * pow(blurGradient, 1.35);
  vec2 aa = max(fwidth(sourceUV), uiPixel * 0.5);
  vec2 dx = dFdx(sourceUV) / uiPixel;
  vec2 dy = dFdy(sourceUV) / uiPixel;
  // Preserve fine browser UI text when the native-resolution image is
  // minified on the 3D screen. Folding blur still adds its own LOD below.
  float baseLod = max(0.0, log2(max(1.0, max(length(dx), length(dy)))) - 0.8);
  vec2 coverage = smoothstep(-aa, aa, sourceUV)
    * (1.0 - smoothstep(vec2(1.0) - aa, vec2(1.0) + aa, sourceUV));
  vec3 color = textureLod(map, clamp(sourceUV, vec2(0.0), vec2(1.0)), baseLod).rgb * coverage.x * coverage.y;
  if (radius > 0.0) {
    float lod = max(baseLod, log2(max(1.0, radius)));
    vec2 footprint = max(aa, uiPixel * radius * 0.75);
    color = vec3(0.0);
    for (int y = -2; y <= 2; y++) {
      for (int x = -2; x <= 2; x++) {
        float wx = x == 0 ? 6.0 : (abs(x) == 1 ? 4.0 : 1.0);
        float wy = y == 0 ? 6.0 : (abs(y) == 1 ? 4.0 : 1.0);
        vec2 sampleUV = sourceUV + vec2(float(x), float(y)) * uiPixel * radius;
        vec2 coverage = smoothstep(-footprint, footprint, sampleUV)
          * (1.0 - smoothstep(vec2(1.0) - footprint, vec2(1.0) + footprint, sampleUV));
        color += textureLod(map, clamp(sampleUV, vec2(0.0), vec2(1.0)), lod).rgb
          * coverage.x * coverage.y * wx * wy / 256.0;
      }
    }
  }
  return color * (1.0 - min(1.0, effect * 2.0));
}
`;

const foldShader = `
uniform float foldAngle;
vec2 rotateHinge(vec2 p) {
  float c = cos(foldAngle), s = sin(foldAngle);
  p.y -= 0.275454;
  return vec2(c * p.x + s * p.y, -s * p.x + c * p.y + 0.275454);
}
#ifdef FLEXIBLE_SCREEN
vec4 bendStrip(vec3 p) {
  float halfWidth = 0.35;
  if (p.x >= halfWidth) return vec4(p.x, p.z, 1.0, 0.0);
  if (p.x <= -halfWidth) return vec4(rotateHinge(p.xz), cos(foldAngle), -sin(foldAngle));
  float t = (p.x + halfWidth) / (2.0 * halfWidth);
  float t2 = t*t, t3 = t2*t;
  vec2 a = rotateHinge(vec2(-halfWidth, p.z));
  vec2 b = vec2(halfWidth, p.z);
  vec2 ta = 2.0 * halfWidth * vec2(cos(foldAngle), -sin(foldAngle));
  vec2 tb = vec2(2.0 * halfWidth, 0.0);
  vec2 point = (2.0*t3-3.0*t2+1.0)*a + (t3-2.0*t2+t)*ta + (-2.0*t3+3.0*t2)*b + (t3-t2)*tb;
  vec2 tangent = normalize((6.0*t2-6.0*t)*a + (3.0*t2-4.0*t+1.0)*ta + (-6.0*t2+6.0*t)*b + (3.0*t2-2.0*t)*tb);
  return vec4(point, tangent);
}
#endif
`;

const toParent = (message) => window.parent?.postMessage(message, window.location.origin);

try {
  const model = await new USDLoader().loadAsync('./assets/iPhone_Duo_Render.usdc');
  model.scale.multiplyScalar(100);
  model.updateMatrixWorld(true);
  model.traverse((object) => {
    if (!object.isMesh) return;
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    geometry.translate(0, -5.8974, 0);
    let ancestor = object;
    while (ancestor && !['upTUAKvMVkPOMKq', 'SiftyleUEEZwLhF'].includes(ancestor.name)) ancestor = ancestor.parent;
    const moving = ancestor?.name === 'upTUAKvMVkPOMKq';
    const flexible = ['JnJdTkxbQgUtLwU', 'xdyyaajWsatVNxN', 'UXtsBZYlaUvHoEh', 'MvKPXGSdYDVvSpk'].includes(object.name);
    const kind = object.name === 'UXtsBZYlaUvHoEh' ? 'inner' : object.name === 'hhgAIoCGsHXeDPY' ? 'outer' : null;
    const material = kind ? screens[kind].material : object.material.clone();
    if (kind) {
      const p = geometry.attributes.position;
      const uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) {
        uv[i * 2] = kind === 'inner' ? (p.getX(i) + 7.89935) / 15.7987 : (-0.23396 - p.getX(i)) / 7.73936;
        uv[i * 2 + 1] = kind === 'inner' ? (p.getY(i) + 5.8974 - 0.34562) / 11.1035 : (p.getY(i) + 5.8974 - 0.27173) / 11.2513;
      }
      geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    if (moving || flexible) {
      material.onBeforeCompile = (shader) => {
        shader.uniforms.foldAngle = bend;
        if (kind) {
          shader.uniforms.uiFrame = screens[kind].frame;
          shader.uniforms.uiGradient = screens[kind].gradient;
          shader.uniforms.uiReferenceEye = { value: uiReferenceEye };
          shader.uniforms.uiPixel = screens[kind].pixel;
          shader.fragmentShader = shader.fragmentShader.replace('#include <map_pars_fragment>', `
            #include <map_pars_fragment>
            ${kind === 'inner' ? '#define INNER_UI' : ''}
            ${screenShader}
          `).replace('#include <map_fragment>', 'diffuseColor.rgb *= screenColor();');
          shader.vertexShader = `varying vec3 vUIPosition;\n${shader.vertexShader}`;
          shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
            vUIPosition = transformed;
            #include <project_vertex>
          `);
        }
        shader.vertexShader = `${flexible ? '#define FLEXIBLE_SCREEN\n' : ''}${foldShader}\n${shader.vertexShader}`;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', flexible ? `
          vec4 folded = bendStrip(position);
          vec3 transformed = vec3(folded.x, position.y, folded.y);
        ` : `
          vec2 folded = rotateHinge(position.xz);
          vec3 transformed = vec3(folded.x, position.y, folded.y);
        `);
        shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
          vec3 objectNormal = vec3(normal);
          ${flexible ? 'vec4 strip = bendStrip(position); float a = atan(-strip.w, strip.z);' : 'float a = foldAngle;'}
          objectNormal.x = cos(a) * normal.x + sin(a) * normal.z;
          objectNormal.z = -sin(a) * normal.x + cos(a) * normal.z;
        `);
      };
      material.customProgramCacheKey = () => `${flexible ? 'fold-flexible' : 'fold-cover'}-${kind || 'body'}`;
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = object.name;
    mesh.frustumCulled = false;
    phone.add(mesh);
  });
  ready = true;
  setAngle(0);
  resize();
  centerPhone();
  computeQuads();
  postQuads(true);
  console.info('Duo3D model ready', JSON.stringify({ meshes: phone.children.length }));
  toParent({ type: 'duo3d-ready' });
} catch (error) {
  console.error(error);
  toParent({ type: 'duo3d-error', message: String(error?.message || error) });
}

window.addEventListener('message', (event) => {
  if (event.source !== window.parent || event.origin !== window.location.origin) return;
  const data = event.data || {};
  if (data.type === 'status' && ready) toParent({ type: 'duo3d-ready' });
  else if (data.type === 'screens') setScreens(data.inner, data.outer, data.siteUrl, data.requestId);
  else if (data.type === 'layout') {
    safeInsets = {
      top: Math.max(0, Number(data.top) || 0),
      bottom: Math.max(0, Number(data.bottom) || 0),
    };
    if (ready) resize();
  }
  else if (data.type === 'fold') {
    foldTo(data.value, data.animate !== false);
  }
});

let lastTime = performance.now();
renderer.setAnimationLoop((now) => {
  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  if (transition) {
    transition.elapsed += delta;
    const progress = Math.min(transition.elapsed / 1.4, 1);
    const ease = progress * progress * (3 - 2 * progress);
    setAngle(THREE.MathUtils.lerp(transition.from, transition.to, ease));
    if (progress === 1) transition = null;
  }
  if (ready) {
    centerPhone();
    if (!manualView) fitCamera();
  }
  controls.update();
  renderer.render(scene, camera);
  if (ready) {
    computeQuads();
    postQuads(false);
  }
});
