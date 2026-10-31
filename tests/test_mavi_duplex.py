"""Contract checks for the MAVI duplex audio path (no live key required)."""
from pathlib import Path
import shutil
import subprocess
import pytest

ROOT = Path(__file__).resolve().parents[1]


def test_live_duplex_has_independent_send_and_receive():
    src = (ROOT / "static/vano-gemini-live.js").read_text(encoding="utf-8")
    assert "UPSTREAM_BACKPRESSURE_BYTES = 48000" in src
    assert "PLAYBACK_MAX_QUEUE_S" in src
    assert "content.interrupted" in src and "stopAudio();" in src
    assert "realtimeInput:" in src
    assert "modelTurn?.parts" in src
    assert "echoCancellation: true" in src
    assert "noiseSuppression: true" in src
    assert "autoGainControl: true" in src
    assert "mavi-live-metrics" in src
    assert "user_id" not in src
    assert "GEMINI_API_KEY" not in src


def test_20ms_audio_worklet_frame_behavior():
    if shutil.which("node") is None:
        pytest.skip("Node.js unavailable")
    code = r"""
const fs=require('fs'), vm=require('vm'), assert=require('assert');
const source=fs.readFileSync('static/vano-gemini-pcm-worklet.js','utf8');
function run(rate) {
  let Class=null;
  const sandbox={
    AudioWorkletProcessor: class {
      constructor(){this.port={postMessage:(payload)=>{packets.push(payload)}};}
    },
    sampleRate:rate,
    registerProcessor:(name,Constructor)=>{assert.equal(name,'vano-gemini-pcm');Class=Constructor},
    Int16Array,Math
  };
  const packets=[];
  vm.runInNewContext(source,sandbox);
  const p=new Class();
  for(let start=0;start<rate;start+=128) {
    const n=Math.min(128,rate-start);
    const input=new Float32Array(n);
    for(let i=0;i<n;i++)input[i]=Math.sin(2*Math.PI*440*(start+i)/rate)*0.3;
    p.process([[input]]);
  }
  assert.equal(packets.length,50,'expected exactly 50 packets of 20ms for 1s');
  for(const packet of packets)assert.equal(packet.byteLength,640,'320 PCM16 samples per packet');
}
run(48000);
run(44100);
"""
    subprocess.run(["node", "-e", code], cwd=ROOT, check=True, capture_output=True, text=True)
