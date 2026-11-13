/* Cadence — person segmentation (MediaPipe selfie segmenter, runs in the browser).
   Used to put giant words BEHIND the speaker: background -> giant text -> person cut-out on top. */
import { W, H } from './core.js';

const VER = '0.10.14';
let seg = null, state = 'idle';
export const segReady = () => state === 'ready';

export async function initSeg() {
  if (state !== 'idle') return state === 'ready';
  state = 'loading';
  try {
    const vision = await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}/vision_bundle.mjs`);
    const files = await vision.FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}/wasm`);
    const opts = d => ({ baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite', delegate: d }, runningMode: 'IMAGE', outputCategoryMask: false, outputConfidenceMasks: true });
    try { seg = await vision.ImageSegmenter.createFromOptions(files, opts('GPU')); } catch { seg = await vision.ImageSegmenter.createFromOptions(files, opts('CPU')); }
    state = 'ready';
    return true;
  } catch (e) { console.warn('segmentation indisponible', e); state = 'failed'; return false; }
}

const SW = 288, SH = 512;
const small = document.createElement('canvas'); small.width = SW; small.height = SH; const sg = small.getContext('2d', { willReadFrequently: true });
const maskC = document.createElement('canvas'); maskC.width = SW; maskC.height = SH; const mg = maskC.getContext('2d');
const person = document.createElement('canvas'); person.width = W; person.height = H; const pg = person.getContext('2d');
const maskData = mg.createImageData(SW, SH);
let prev = null, lastKey = null, lastTop = null;
/** normalised y of the top of the head in the last cut-out (null if nobody) */
export const headTop = () => lastTop;

/** Returns a W×H canvas holding only the person from `frame` (a W×H canvas), or null. */
export function cutPerson(frame, key) {
  if (!seg) return null;
  if (key !== undefined && key === lastKey) return person;
  sg.drawImage(frame, 0, 0, SW, SH);
  let conf = null;
  try {
    const res = seg.segment(small);
    const m = res.confidenceMasks?.[0];
    if (m) { conf = m.getAsFloat32Array().slice(); }
    res.close?.();
  } catch (e) { console.warn(e); return null; }
  if (!conf || conf.length !== SW * SH) return null;
  // light temporal smoothing + soft threshold for a clean edge
  if (prev && prev.length === conf.length) for (let i = 0; i < conf.length; i++) conf[i] = conf[i] * .7 + prev[i] * .3;
  prev = conf;
  // top of the head (first row with enough "person"), normalised 0..1
  lastTop = null;
  for (let y = 0; y < SH; y++) { let n = 0; for (let x = 0; x < SW; x++) if (conf[y * SW + x] > .55) n++; if (n > SW * .04) { lastTop = y / SH; break; } }
  const d = maskData.data;
  for (let i = 0; i < conf.length; i++) { let a = (conf[i] - .35) / .3; a = a < 0 ? 0 : a > 1 ? 1 : a * a * (3 - 2 * a); d[i * 4 + 3] = a * 255; }
  mg.putImageData(maskData, 0, 0);
  pg.save(); pg.clearRect(0, 0, W, H); pg.drawImage(frame, 0, 0, W, H);
  pg.globalCompositeOperation = 'destination-in'; pg.imageSmoothingQuality = 'high'; pg.drawImage(maskC, 0, 0, W, H); pg.restore();
  lastKey = key;
  return person;
}
export function resetSegHistory() { prev = null; lastKey = null; }
