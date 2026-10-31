/* Capture mono speech from the browser and deliver PCM16 at 16 kHz.
   Render and microphone contents are never written to storage or console. */
class VanoGeminiPcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.phase = 0;
    this.accumulated = 0;
    this.count = 0;
    this.output = new Int16Array(640);
    this.offset = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      this.accumulated += channel[i];
      this.count += 1;
      this.phase += 16000;
      if (this.phase < sampleRate) continue;
      this.phase -= sampleRate;
      const sample = Math.max(-1, Math.min(1, this.accumulated / this.count));
      this.output[this.offset++] = sample < 0
        ? Math.round(sample * 32768)
        : Math.round(sample * 32767);
      this.accumulated = 0;
      this.count = 0;
      if (this.offset === this.output.length) {
        const buffer = this.output.buffer;
        this.port.postMessage(buffer, [buffer]);
        this.output = new Int16Array(640);
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('vano-gemini-pcm', VanoGeminiPcmProcessor);
