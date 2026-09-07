const STREAM_KEYS = ["time", "distance", "heartrate", "cadence", "velocity_smooth", "moving"];

// Strava returns either { time:{data:[]}, ... } (key_by_type=true) or [{type, data}, ...]
function normalizeStreams(raw) {
  const out = {};
  if (Array.isArray(raw)) {
    raw.forEach(s => { if (s && STREAM_KEYS.includes(s.type) && Array.isArray(s.data)) out[s.type] = s.data; });
    return out;
  }
  if (raw && typeof raw === "object") {
    STREAM_KEYS.forEach(k => { if (raw[k] && Array.isArray(raw[k].data)) out[k] = raw[k].data; });
  }
  return out;
}

// Evenly spaced samples, always keeping the first and last, all arrays aligned.
function downsampleStreams(streams, maxPoints) {
  const keys = Object.keys(streams);
  if (!keys.length) return streams;
  const n = streams[keys[0]].length;
  if (!maxPoints || n <= maxPoints) return streams;
  const step = (n - 1) / (maxPoints - 1);
  const idx = [];
  for (let i = 0; i < maxPoints; i++) {
    const j = Math.round(i * step);
    if (idx[idx.length - 1] !== j) idx.push(j);
  }
  if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
  const out = {};
  keys.forEach(k => { out[k] = idx.map(i => streams[k][i]); });
  return out;
}

module.exports = { STREAM_KEYS, normalizeStreams, downsampleStreams };
