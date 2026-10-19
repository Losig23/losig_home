/*
Ink pass: screen-space line art + anime color grade.

Each frame renders the scene twice: once in color (MSAA, half float), once
with a normal override into a target that also keeps depth. A full-screen
shader then inks pixels where depth jumps (silhouettes) or normals bend
(creases), grades the color toward a soft cel palette, and adds a little
paper grain. Overlay objects (labels, petals) are drawn after, un-inked.

The scene is passed per frame (the apartment and the outdoors are separate
scenes), and lines fade out over a per-area distance band (setFade): the
apartment's 55-110 ft, much further outside.
*/import * as THREE from 'three';

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */`
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 texel;
uniform float near;
uniform float far;
uniform float thickness;
uniform float time;
uniform vec3 ink;
uniform vec2 fade;
varying vec2 vUv;

float viewZ(vec2 uv) {
  float ndc = texture2D(tDepth, uv).x * 2.0 - 1.0;
  return (2.0 * near * far) / (far + near - ndc * (far - near));
}
vec3 nrm(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }

vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 ox = vec2(texel.x * thickness, 0.0);
  vec2 oy = vec2(0.0, texel.y * thickness);

  // depth edges: Laplacian of 1/z is ~0 on any plane, spikes at silhouettes
  float z = viewZ(vUv);
  float iz = 1.0 / z;
  float lap = abs(1.0 / viewZ(vUv - ox) + 1.0 / viewZ(vUv + ox) - 2.0 * iz)
            + abs(1.0 / viewZ(vUv - oy) + 1.0 / viewZ(vUv + oy) - 2.0 * iz);
  float dEdge = smoothstep(0.012, 0.03, lap * z);

  // crease edges: neighbouring normals disagree
  vec3 n = nrm(vUv);
  float nd = max(max(1.0 - dot(n, nrm(vUv - ox)), 1.0 - dot(n, nrm(vUv + ox))),
                 max(1.0 - dot(n, nrm(vUv - oy)), 1.0 - dot(n, nrm(vUv + oy))));
  float nEdge = smoothstep(0.3, 0.6, nd);

  float edge = max(dEdge, nEdge) * (1.0 - smoothstep(fade.x, fade.y, z));

  vec3 col = texture2D(tColor, vUv).rgb;
  col = toSRGB(clamp(col, 0.0, 1.0));

  // cel grade: a touch more saturation, lifted blacks pushed toward violet
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 1.15);
  col = col * 0.9 + vec3(0.07, 0.065, 0.11) * (1.0 - col * 0.6);

  col = mix(col, ink, edge * 0.92);

  // paper grain + soft vignette
  col += (hash(vUv * 917.0 + fract(time) * 13.0) - 0.5) * 0.03;
  float v = length((vUv - 0.5) * vec2(1.1, 1.0));
  col *= mix(1.0, 0.86, smoothstep(0.45, 0.85, v));

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;


export function createInk(renderer, camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());

  const colorRT = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const normalRT = new THREE.WebGLRenderTarget(size.x, size.y, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthTexture: new THREE.DepthTexture(size.x, size.y),
  });
  const normalMat = new THREE.MeshNormalMaterial();

  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tColor: { value: colorRT.texture },
      tNormal: { value: normalRT.texture },
      tDepth: { value: normalRT.depthTexture },
      texel: { value: new THREE.Vector2(1 / size.x, 1 / size.y) },
      near: { value: camera.near },
      far: { value: camera.far },
      thickness: { value: Math.max(1, renderer.getPixelRatio() * 0.9) },
      time: { value: 0 },
      // display-space (sRGB) components: the shader inks after its sRGB encode
      ink: { value: new THREE.Vector3(0x2a / 255, 0x24 / 255, 0x33 / 255) },
      fade: { value: new THREE.Vector2(55, 110) },
    },
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const postScene = new THREE.Scene();
  postScene.add(quad);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  function setSize() {
    const s = renderer.getDrawingBufferSize(new THREE.Vector2());
    colorRT.setSize(s.x, s.y);
    normalRT.setSize(s.x, s.y);
    mat.uniforms.texel.value.set(1 / s.x, 1 / s.y);
  }

  function setFade(start, end) {
    mat.uniforms.fade.value.set(start, end);
  }

  function render(scene, overlay, t) {
    // cameras change far plane between areas
    mat.uniforms.near.value = camera.near;
    mat.uniforms.far.value = camera.far;

    // 1) color
    renderer.setRenderTarget(colorRT);
    renderer.render(scene, camera);

    // 2) normals + depth, reusing this frame's shadow map
    const bg = scene.background, fog = scene.fog, autoShadow = renderer.shadowMap.autoUpdate;
    scene.background = null;
    scene.fog = null;
    scene.overrideMaterial = normalMat;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(normalRT);
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    scene.background = bg;
    scene.fog = fog;
    renderer.shadowMap.autoUpdate = autoShadow;

    // 3) composite to screen, then un-inked overlay on top
    mat.uniforms.time.value = t;
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCam);
    if (overlay) {
      const ac = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(overlay, camera);
      renderer.autoClear = ac;
    }
  }

  return { render, setSize, setFade };
}
