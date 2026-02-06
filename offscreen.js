// offscreen.js

// 1. Heartbeat Timer (Keeps extension alive)
setInterval(() => {
  chrome.runtime.sendMessage({ action: 'keepAliveTick' });
}, 5000);

// 2. Audio Player (Plays sound in background)
let audioContext = null;

function playSiren() {
  if (!audioContext) {
    audioContext = new (self.AudioContext || self.webkitAudioContext)();
  }

  // Resume context if suspended
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  const t = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  // Siren Sound Settings (Sawtooth wave)
  oscillator.type = 'sawtooth';
  
  const duration = 2.0; // 4 seconds duration

  // Volume: Loud -> Fade out
  gainNode.gain.setValueAtTime(0.3, t);
  gainNode.gain.setValueAtTime(0.3, t + duration - 0.5);
  gainNode.gain.exponentialRampToValueAtTime(0.001, t + duration);

  // Pitch: Emergency Siren Pattern (High -> Low loop)
  const cycles = 4;
  const step = duration / cycles;

  for (let i = 0; i < cycles; i++) {
    const start = t + (i * step);
    oscillator.frequency.setValueAtTime(1200, start); // High Pitch
    oscillator.frequency.exponentialRampToValueAtTime(600, start + step); // Slide to Low
  }

  oscillator.start(t);
  oscillator.stop(t + duration);
}

// 3. Listen for commands
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'playAudioFromOffscreen') {
    playSiren();
  }
});