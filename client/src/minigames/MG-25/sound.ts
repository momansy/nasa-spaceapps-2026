// Optional beacon tone for MG-25: off until the player turns it on, started only from a user
// gesture (`toggle` is called from the pointer or key handler), and never needed to play: the
// waveform and the signal meter show everything the pitch tells. The pitch rises with the signal.
// Game values: 200 Hz to 800 Hz, gain at most 0.05.
type Ctor = typeof AudioContext;

export class BeaconSound {
  enabled = false;
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;

  /** Turns the tone on or off. Must be called from a user gesture so the browser allows audio. */
  toggle(): void {
    if (this.enabled) {
      this.enabled = false;
      if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
      return;
    }
    try {
      if (!this.ctx) {
        const Audio = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext) as Ctor | undefined;
        if (!Audio) return;
        this.ctx = new Audio();
        this.osc = this.ctx.createOscillator();
        this.gain = this.ctx.createGain();
        this.gain.gain.value = 0;
        this.osc.type = 'sine';
        this.osc.connect(this.gain).connect(this.ctx.destination);
        this.osc.start();
      }
      void this.ctx.resume();
      this.enabled = true;
    } catch {
      this.enabled = false;
    }
  }

  /** Called every frame with the signal strength 0–1 (0 when the search is over). */
  update(signal: number): void {
    if (!this.enabled || !this.ctx || !this.osc || !this.gain) return;
    const t = this.ctx.currentTime;
    this.osc.frequency.setTargetAtTime(200 + 600 * signal, t, 0.03);
    this.gain.gain.setTargetAtTime(signal > 0.02 ? 0.01 + 0.04 * signal : 0, t, 0.03);
  }

  dispose(): void {
    this.enabled = false;
    try {
      this.osc?.stop();
      void this.ctx?.close();
    } catch {
      /* already closed */
    }
    this.ctx = null;
    this.osc = null;
    this.gain = null;
  }
}
