/**
 * Per-display overlay scene. Port of vendor/desktop-fly/main.swift `buildScene`.
 * Orthographic camera: 1 world unit = 1 CSS pixel, origin at display center.
 */

import * as THREE from 'three'

/** Matches FlyModel.swift `SHADOWS_ENABLED`. */
export const SHADOWS_ENABLED = true

export type FlyScene = {
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  renderer: THREE.WebGLRenderer
  canvas: HTMLCanvasElement
  add(object: THREE.Object3D): void
  resize(width: number, height: number): void
  render(): void
  dispose(): void
}

function attachKeyLight(scene: THREE.Scene, shadows: boolean): THREE.DirectionalLight {
  const key = new THREE.DirectionalLight(0xffffff, 1.0)
  // SceneKit directional light emits along the node's −Z after euler (−0.35, 0.30, 0).
  const euler = new THREE.Euler(-0.35, 0.3, 0, 'ZYX')
  const toward = new THREE.Vector3(0, 0, -1).applyEuler(euler)
  key.position.copy(toward).multiplyScalar(-800)
  key.target.position.set(0, 0, 0)
  scene.add(key)
  scene.add(key.target)
  if (shadows) {
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.radius = 6
    const cam = key.shadow.camera
    cam.left = -2000
    cam.right = 2000
    cam.top = 2000
    cam.bottom = -2000
    cam.near = 1
    cam.far = 2500
    cam.updateProjectionMatrix()
  }
  return key
}

export function createFlyScene(
  canvas: HTMLCanvasElement,
  bounds?: { width: number; height: number },
  shadows = SHADOWS_ENABLED,
): FlyScene {
  const width = bounds?.width ?? (canvas.clientWidth || window.innerWidth)
  const height = bounds?.height ?? (canvas.clientHeight || window.innerHeight)

  const scene = new THREE.Scene()

  const camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 1, 600)
  camera.position.set(0, 0, 300)
  camera.lookAt(0, 0, 0)
  camera.name = 'camera'
  scene.add(camera)

  attachKeyLight(scene, shadows)
  scene.add(new THREE.AmbientLight(0xffffff, 0.55))

  if (shadows) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.ShadowMaterial({ opacity: 0.3 }))
    plane.position.set(0, 0, -0.6)
    plane.receiveShadow = true
    plane.castShadow = false
    scene.add(plane)
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    premultipliedAlpha: false,
  })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(width, height, false)
  renderer.shadowMap.enabled = shadows
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  return {
    scene,
    camera,
    renderer,
    canvas,
    add(object: THREE.Object3D): void {
      scene.add(object)
    },
    resize(w: number, h: number): void {
      camera.left = -w / 2
      camera.right = w / 2
      camera.top = h / 2
      camera.bottom = -h / 2
      camera.updateProjectionMatrix()
      renderer.setSize(w, h, false)
    },
    render(): void {
      renderer.render(scene, camera)
    },
    dispose(): void {
      renderer.dispose()
    },
  }
}
