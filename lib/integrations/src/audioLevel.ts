/**
 * Adaptive mic meter.
 *
 * FreeFlow tracks a noise floor and a peak ceiling, then eases the displayed
 * level with a fast attack and a slow release. Expo already reports dBFS;
 * the browser meter reports RMS, which is converted before the same curve.
 */

const MINIMUM_RMS = 0.00001;
const MIN_SPAN_DB = 18;
const PEAK_HEADROOM_DB = 8;
const SPEECH_GATE_MARGIN_DB = 3;
const MINIMUM_VISIBLE_ACTIVE_LEVEL = 0.12;
const NOISE_GATE_NORMALIZED = 0.06;
const FLOOR_RISE_WINDOW_DB = 4;
const FLOOR_FALL_BLEND = 0.12;
const FLOOR_RISE_BLEND = 0.02;
const PEAK_ATTACK_BLEND = 0.55;
const PEAK_RELEASE_BLEND = 0.04;
const DISPLAY_ATTACK_BLEND = 0.45;
const DISPLAY_RELEASE_BLEND = 0.12;

export type AudioLevelNormalizer = {
  reset: () => void;
  fromDb: (db: number) => number;
  fromRms: (rms: number) => number;
};

export function createAudioLevelNormalizer(): AudioLevelNormalizer {
  let noiseFloorDB = -55;
  let peakCeilingDB = -37;
  let displayLevel = 0;

  const fromDb = (levelDB: number) => {
    const ceilingLimited = Math.min(levelDB, peakCeilingDB - MIN_SPAN_DB);
    if (ceilingLimited <= noiseFloorDB) {
      noiseFloorDB = mix(noiseFloorDB, ceilingLimited, FLOOR_FALL_BLEND);
    } else if (ceilingLimited <= noiseFloorDB + FLOOR_RISE_WINDOW_DB) {
      noiseFloorDB = mix(noiseFloorDB, ceilingLimited, FLOOR_RISE_BLEND);
    }

    const minimumCeiling = noiseFloorDB + MIN_SPAN_DB;
    if (levelDB >= peakCeilingDB) {
      peakCeilingDB = mix(peakCeilingDB, levelDB, PEAK_ATTACK_BLEND);
    } else {
      peakCeilingDB = mix(peakCeilingDB, Math.max(levelDB, minimumCeiling), PEAK_RELEASE_BLEND);
    }
    peakCeilingDB = Math.max(peakCeilingDB, minimumCeiling);

    const displayCeilingDB = peakCeilingDB + PEAK_HEADROOM_DB;
    const dynamicSpan = Math.max(displayCeilingDB - noiseFloorDB, MIN_SPAN_DB + PEAK_HEADROOM_DB);
    let normalized = clamp((levelDB - noiseFloorDB) / dynamicSpan);
    const isActiveSpeech = levelDB >= noiseFloorDB + SPEECH_GATE_MARGIN_DB;

    if (normalized < NOISE_GATE_NORMALIZED && !isActiveSpeech) {
      normalized = 0;
    } else if (isActiveSpeech) {
      normalized = Math.max(normalized, MINIMUM_VISIBLE_ACTIVE_LEVEL);
    }

    const blend = normalized > displayLevel ? DISPLAY_ATTACK_BLEND : DISPLAY_RELEASE_BLEND;
    displayLevel = mix(displayLevel, normalized, blend);
    return displayLevel;
  };

  return {
    reset() {
      noiseFloorDB = -55;
      peakCeilingDB = -37;
      displayLevel = 0;
    },
    fromDb,
    fromRms(rms: number) {
      const levelDB = 20 * Math.log10(Math.max(rms, MINIMUM_RMS));
      return fromDb(levelDB);
    },
  };
}

function mix(current: number, target: number, blend: number): number {
  return current + (target - current) * blend;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
