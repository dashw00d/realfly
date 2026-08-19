/** Thread-safe spike hand-off from the sim worker to the brain window. */

export type SpikeEvent = {
  neuron: number
  isGF: boolean
}

const CAP = 256

/** Ring of the newest 256 spike events (Sim.swift SpikeBus). */
export class SpikeBus {
  private readonly buf: SpikeEvent[] = new Array(CAP)
  private head = 0
  private length = 0

  push(events: SpikeEvent[]): void {
    for (const e of events) {
      if (this.length < CAP) {
        this.buf[(this.head + this.length) % CAP] = e
        this.length++
      } else {
        this.buf[this.head] = e
        this.head = (this.head + 1) % CAP
      }
    }
  }

  popAll(): SpikeEvent[] {
    const out: SpikeEvent[] = new Array(this.length)
    for (let i = 0; i < this.length; i++) {
      out[i] = this.buf[(this.head + i) % CAP]
    }
    this.head = 0
    this.length = 0
    return out
  }
}
