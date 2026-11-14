// WebGL scene for a GLB part model. This module is only ever loaded with a dynamic import
// (see PartViewer.tsx), so three.js stays out of the main bundle and phones that only see
// the wireframe never download it.
import {
  ACESFilmicToneMapping,
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Vector3,
  WebGLRenderer,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { View } from './wireframe';

export interface ThreeScene {
  canvas: HTMLCanvasElement;
  resize(width: number, height: number, dpr: number): void;
  draw(view: View): void;
  destroy(): void;
}

const FOV_DEG = 30;

function disposeObject(root: Object3D) {
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mats: Material[] = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) {
      for (const value of Object.values(m as unknown as Record<string, unknown>)) {
        if (value && typeof value === 'object' && (value as Texture).isTexture) (value as Texture).dispose();
      }
      m.dispose();
    }
  });
}

/**
 * Parses a binary glTF and returns a scene that draws it centred and fitted to the view.
 * Rejects when the file cannot be parsed or a WebGL context cannot be created.
 */
export async function createThreeScene(glb: ArrayBuffer): Promise<ThreeScene> {
  const gltf = await new Promise<{ scene: Group }>((resolve, reject) => {
    new GLTFLoader().parse(glb, '', (g) => resolve(g as unknown as { scene: Group }), (err) => reject(err));
  });

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envTarget = pmrem.fromScene(room, 0.04);
  scene.environment = envTarget.texture;
  pmrem.dispose();
  disposeObject(room);

  scene.add(new HemisphereLight(0xcfe6ff, 0x0b1020, 0.45));
  const key = new DirectionalLight(0xffe2b8, 1.1);
  key.position.set(2.5, 3, 4);
  scene.add(key);
  const rim = new DirectionalLight(0x55c5cd, 0.9);
  rim.position.set(-3, 1.5, -3);
  scene.add(rim);

  // Centre the model on the origin and scale it into a unit sphere, like the wireframes.
  const pivot = new Group();
  const box = new Box3().setFromObject(gltf.scene);
  const centre = box.getCenter(new Vector3());
  const radius = Math.max(1e-6, box.getSize(new Vector3()).length() / 2);
  gltf.scene.position.sub(centre);
  const fit = new Group();
  fit.scale.setScalar(1 / radius);
  fit.add(gltf.scene);
  pivot.add(fit);
  scene.add(pivot);

  const camera = new PerspectiveCamera(FOV_DEG, 1, 0.05, 50);
  let aspect = 1;
  let lost = false;
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
  };
  renderer.domElement.addEventListener('webglcontextlost', onLost);

  return {
    canvas: renderer.domElement,
    resize(width, height, dpr) {
      aspect = width / Math.max(1, height);
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    },
    draw(view) {
      if (lost) return;
      // Same convention as the wireframe: yaw about the vertical axis, then pitch.
      pivot.rotation.set(view.pitch, view.yaw, 0, 'XYZ');
      const halfV = (FOV_DEG / 2) * (Math.PI / 180);
      const half = aspect >= 1 ? halfV : Math.atan(Math.tan(halfV) * aspect);
      camera.position.set(0, 0, 1.08 / Math.sin(half) / view.zoom);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    },
    destroy() {
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      disposeObject(scene);
      envTarget.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
