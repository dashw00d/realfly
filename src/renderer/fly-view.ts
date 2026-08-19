/**
 * Binds a headless Fly (creature/fly.ts) to a Three.Group each frame.
 *
 * Frame conversion (Swift local → Three overlay world):
 *   Fly local (FlyModel.swift): +Y forward, +Z up (dorsal), ground at local z≈0.
 *   Overlay world matches SceneKit `buildScene`: X right, Y screen-up, Z altitude
 *   toward the camera (camera at (0,0,300) looking at the origin). Three.js is
 *   Y-up with the same camera convention, so desktop XY is already the view plane.
 *   Apply SceneKit Euler('ZYX') (pitch, 0, heading−π/2) on the fly group — local
 *   +Y maps onto the heading in XY, local +Z stays world +Z (off the desktop).
 *   Do not Rx=−90 here; that would put the walk plane on XZ and break overlay coords.
 */

import type { Fly } from '../creature/fly'
import { buildFlyModel, FlyModel3D, setScnEuler } from './fly-model'

export class FlyView {
  readonly model: FlyModel3D
  readonly group: FlyModel3D['group']

  constructor(readonly fly: Fly, model: FlyModel3D = buildFlyModel()) {
    this.model = model
    this.group = model.group
    this.sync()
  }

  /** Copy numeric pose from the headless Fly onto the mesh. */
  sync(): void {
    const fly = this.fly
    const n = fly.node
    this.group.position.set(n.position.x, n.position.y, n.position.z)
    setScnEuler(this.group, n.eulerAngles.x, n.eulerAngles.y, n.eulerAngles.z)
    this.model.setScale(n.scale.x, n.scale.y, n.scale.z)

    const legs = fly.model.legs
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i]!
      this.model.setLegPose(i, leg.angle, leg.lift)
    }

    const wings = fly.model.foldedWings.childNodes
    for (let i = 0; i < wings.length; i++) {
      this.model.setWingEuler(i, wings[i]!.eulerAngles)
    }
    this.model.setFoldedWingsVisible(!fly.model.foldedWings.isHidden)

    const abd = fly.model.abdomen.scale
    this.model.setAbdomenScale(abd.x, abd.y, abd.z)

    const bl = fly.model.blurWingL
    this.model.setBlurWing('L', { hidden: bl.isHidden, opacity: bl.opacity, euler: bl.eulerAngles })
    const br = fly.model.blurWingR
    this.model.setBlurWing('R', { hidden: br.isHidden, opacity: br.opacity, euler: br.eulerAngles })
  }
}

export function bindFly(fly: Fly, model?: FlyModel3D): FlyView {
  return new FlyView(fly, model)
}
