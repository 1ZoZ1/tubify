'use strict';
// SponsorBlock API istemcisi. Gizlilik için video kimliğinin sha256 önekiyle sorgulanır
// (sunucu hangi videoyu izlediğinizi bilemez).
const crypto = require('crypto');
const { net } = require('electron');
const log = require('./log');

const API = 'https://sponsor.ajay.app/api';
const cache = new Map();
const TTL = 10 * 60 * 1000;

async function getSegments(videoId, categories) {
  if (!/^[\w-]{11}$/.test(videoId) || !categories.length) return [];
  const key = videoId + '|' + categories.join(',');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v;

  const prefix = crypto.createHash('sha256').update(videoId).digest('hex').slice(0, 4);
  const url = `${API}/skipSegments/${prefix}?categories=${encodeURIComponent(JSON.stringify(categories))}` +
    `&actionTypes=${encodeURIComponent(JSON.stringify(['skip', 'mute']))}`;
  let segments = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await net.fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.status === 404) break; // bu video için segment yok
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const entry = Array.isArray(data) ? data.find((d) => d.videoID === videoId) : null;
      segments = entry ? entry.segments.map((s) => ({
        uuid: s.UUID,
        category: s.category,
        action: s.actionType,
        start: s.segment[0],
        end: s.segment[1],
        videoDuration: s.videoDuration,
      })).filter((s) => s.end > s.start) : [];
      break;
    } catch (e) {
      if (attempt === 1) { log.warn('SponsorBlock sorgusu başarısız', e.message); return []; }
    }
  }
  cache.set(key, { t: Date.now(), v: segments });
  return segments;
}

// Katkıda bulunanların istatistiği için (eklentinin yaptığı gibi) atlanan segmenti bildirir.
function reportViewed(uuid) {
  if (!/^[a-f0-9]{64,}$/i.test(uuid)) return;
  net.fetch(`${API}/viewedVideoSponsorTime?UUID=${uuid}`, { method: 'POST', signal: AbortSignal.timeout(8000) }).catch(() => {});
}

module.exports = { getSegments, reportViewed };
