export const PLAYBACK_SPEEDS=[.0625,.25,1,4,16];
export function orbitalWatchSpeed(period){if(!Number.isFinite(period)||period<=0)return .25;return [...PLAYBACK_SPEEDS].reverse().find(speed=>period/(.2*speed)>=8)||PLAYBACK_SPEEDS[0];}
