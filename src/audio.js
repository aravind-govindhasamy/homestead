// synthesized ambient sounds via Web Audio API — no audio files needed
// ponytail: all sounds are oscillator/noise; swap for recorded samples if quality matters
let ctx, gainRain, gainCricket, gainFire;

function loopNoise(ac) {
  const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf; src.loop = true; src.start();
  return src;
}

export function initAudio() {
  if (ctx) return;
  ctx = new AudioContext();
  const dst = ctx.destination;

  // soft wind base (always on, very quiet)
  const wn = loopNoise(ctx);
  const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 350;
  const wg = ctx.createGain(); wg.gain.value = 0.025;
  wn.connect(wf); wf.connect(wg); wg.connect(dst);

  // rain: bandpass-filtered noise, gain driven each frame
  const rn = loopNoise(ctx);
  const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 900; rf.Q.value = 0.5;
  gainRain = ctx.createGain(); gainRain.gain.value = 0;
  rn.connect(rf); rf.connect(gainRain); gainRain.connect(dst);

  // crickets: two slightly detuned oscillators; gain has JS-side tremolo applied each frame
  const c1 = ctx.createOscillator(); c1.frequency.value = 3800; c1.start();
  const c2 = ctx.createOscillator(); c2.frequency.value = 3855; c2.start();
  gainCricket = ctx.createGain(); gainCricket.gain.value = 0;
  c1.connect(gainCricket); c2.connect(gainCricket); gainCricket.connect(dst);

  // campfire crackle: bandpass noise near fire
  const fn = loopNoise(ctx);
  const ff = ctx.createBiquadFilter(); ff.type = 'bandpass'; ff.frequency.value = 300; ff.Q.value = 2;
  gainFire = ctx.createGain(); gainFire.gain.value = 0;
  fn.connect(ff); ff.connect(gainFire); gainFire.connect(dst);
}

export function updateAudio(t, dayness, rainAmt, nearFire) {
  if (!ctx || ctx.state === 'suspended') return;
  const night = Math.max(0, 1 - dayness * 3);
  const now = ctx.currentTime;
  gainRain.gain.setTargetAtTime(rainAmt * 0.15, now, 0.8);
  gainCricket.gain.value = night * (0.01 + Math.sin(t * 7.8) * 0.004);
  gainFire.gain.setTargetAtTime(nearFire && dayness < 0.35 ? 0.05 : 0, now, 0.5);
}

export function setMuted(muted) {
  if (!ctx) return;
  muted ? ctx.suspend() : ctx.resume();
}

export function playStep() {
  if (!ctx || ctx.state === 'suspended') return;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.04), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() - 0.5);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 180 + Math.random() * 120;
  const g = ctx.createGain(); g.gain.value = 0.035;
  src.connect(f); f.connect(g); g.connect(ctx.destination);
  src.start();
}
