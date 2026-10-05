"use strict";

// EASY SETTINGS — edit these values, save, then reload Live Server.
const ART_SETTINGS = {
  portraitBuildSeconds: 8.5,  // Seconds of viewing time to build a portrait.
  flickerSpeed: 110,         // Milliseconds between changes; larger is slower.
  flickerAmount: 0.018,      // Fraction of visible character positions sampled.
  portraitSpacing: 55,       // Extra black space between sections, in % of screen height.
  ambientCharacterCount: 112, // Total: about 1/4 between portraits, 3/4 beside them. Set 0 to remove.
  cursorTrailAmount: 5       // Maximum living fragments. Set 0 for no trail.
};

// Only the confirmed green-tagged originals. Reorder this list to curate the walk.
const PORTRAIT_FILES = [
  "ascii-art-3.txt",
  "ascii-ar-4t.txt",
  "ascii-art (3).txt",
  "ascii-art (4).txt",
  "ascii-art (5).txt",
  "ascii-art (6).txt",
  "ascii-art (7).txt"
];

const gallery = document.getElementById("gallery");
const portraits = [];
const alignmentRhythm = [0, -1, 1, 0, 1, -1, 0, 1];
let effects;
const nearbyPortraits = new Set();
const density = " .:-=+*#%@";
const buildMilliseconds = Math.max(0, ART_SETTINGS.portraitBuildSeconds * 1000);
const flickerInterval = Math.max(40, ART_SETTINGS.flickerSpeed);
const flickerAmount = Math.min(0.15, Math.max(0, ART_SETTINGS.flickerAmount));
let animationFrame = 0;
let lastTime = 0;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// Keep the actual text intact: no trimming, rewrapping, or regeneration.
async function loadPortrait(filename, index) {
  const response = await fetch(`photos/ASCII/${encodeURIComponent(filename)}`);
  if (!response.ok) throw new Error(`${filename}: HTTP ${response.status}`);
  const text = (await response.text()).replace(/\r\n?/g, "\n").replace(/\n$/, "");
  if (!text.length) throw new Error(`${filename}: empty text file`);

  const section = document.createElement("section");
  section.className = "portrait-section";
  section.dataset.source = filename;
  const frame = document.createElement("div");
  frame.className = "portrait-frame";
  const pre = document.createElement("pre");
  pre.className = "portrait-text";
  pre.setAttribute("role", "img");
  pre.setAttribute("aria-label", `Photographic portrait ${index + 1}, rendered in ASCII text`);
  pre.textContent = text;
  frame.append(pre);
  section.append(frame);
  return {
    section, frame, pre, text, alignment: alignmentRhythm[index % alignmentRhythm.length],
    started: false, complete: false, visible: false, elapsed: 0, revealed: 0,
    lastDraw: -Infinity, lastFlicker: -Infinity, substitutions: new Map()
  };
}

// Measure full, unscaled text once; a uniform scale preserves every cell's proportions.
function fitPortraits() {
  portraits.forEach(portrait => {
    const { section, frame, pre } = portrait;
    const style = getComputedStyle(section);
    const availableWidth = section.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availableHeight = parseFloat(style.minHeight) - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const scale = Math.min(1, (availableWidth - 2) / portrait.width, availableHeight / portrait.height);
    const width = portrait.width * scale;
    frame.style.width = `${width}px`;
    frame.style.height = `${portrait.height * scale}px`;
    const offset = Math.min(section.clientWidth * 0.075, Math.max(0, (availableWidth - width) / 2));
    frame.style.transform = `translateX(${offset * portrait.alignment}px)`;
    pre.style.transform = `scale(${scale})`;
  });
}

// Advance through the original text in reading order: top line to bottom line.
// Time pauses offscreen, so a fast scroll does not spend the reveal unseen.
function constructPortrait(portrait, delta) {
  portrait.elapsed += delta;
  const progress = buildMilliseconds === 0 ? 1 : Math.min(1, portrait.elapsed / buildMilliseconds);
  portrait.revealed = Math.floor(portrait.text.length * progress);
  portrait.complete = progress === 1;
}

// Temporary substitutions always come from the original character, never the last
// flicker. The photograph therefore cannot gradually dissolve into random noise.
function refreshFlicker(portrait) {
  portrait.substitutions.clear();
  const changes = Math.floor(portrait.revealed * flickerAmount);
  for (let i = 0; i < changes; i++) {
    const position = Math.floor(Math.random() * portrait.revealed);
    const original = portrait.text[position];
    if (original === " " || original === "\n") continue;
    const current = density.indexOf(original);
    if (current < 0) continue;
    const step = Math.random() < 0.5 ? -1 : 1;
    const neighbor = Math.max(0, Math.min(density.length - 1, current + step));
    portrait.substitutions.set(position, density[neighbor]);
  }
}

function drawPortrait(portrait) {
  const characters = portrait.text.slice(0, portrait.revealed).split("");
  portrait.substitutions.forEach((character, position) => {
    if (position < characters.length) characters[position] = character;
  });
  portrait.pre.textContent = characters.join("");
}

function showCompletePortrait(portrait) {
  portrait.started = true;
  portrait.complete = true;
  portrait.revealed = portrait.text.length;
  portrait.substitutions.clear();
  portrait.pre.textContent = portrait.text;
}

function needsAnimation(portrait) {
  return portrait.started && ((!portrait.complete && portrait.visible) || flickerAmount > 0);
}

// One shared clock; no loop runs when the gallery is offscreen or motion is reduced.
function requestTick() {
  if (animationFrame || document.hidden || reducedMotion.matches) return;
  if (![...nearbyPortraits].some(needsAnimation)) return;
  lastTime = performance.now();
  animationFrame = requestAnimationFrame(animatePortraits);
}

function animatePortraits(now) {
  animationFrame = 0;
  if (document.hidden) return;
  // Also check on a frame, so a preference change cannot leave a half-built image.
  if (reducedMotion.matches) { updateMotionPreference(); return; }
  const delta = Math.min(100, Math.max(0, now - lastTime));
  lastTime = now;
  nearbyPortraits.forEach(portrait => {
    if (!needsAnimation(portrait)) return;
    const constructing = !portrait.complete && portrait.visible;
    if (constructing) constructPortrait(portrait, delta);
    const flickerDue = flickerAmount > 0 && now - portrait.lastFlicker >= flickerInterval;
    if (flickerDue) {
      refreshFlicker(portrait);
      portrait.lastFlicker = now;
    }
    if (flickerDue || (constructing && now - portrait.lastDraw >= 40) ||
        (portrait.complete && portrait.pre.textContent.length < portrait.text.length)) {
      drawPortrait(portrait);
      portrait.lastDraw = now;
    }
  });
  if ([...nearbyPortraits].some(needsAnimation)) animationFrame = requestAnimationFrame(animatePortraits);
}

// The first observer starts a portrait only after its FRAME actually enters view.
// The second gives its shimmer a small margin, then stops work farther offscreen.
function observePortraits() {
  const byFrame = new Map(portraits.map(portrait => [portrait.frame, portrait]));
  const visibilityObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const portrait = byFrame.get(entry.target);
      portrait.visible = entry.isIntersecting;
      if (entry.isIntersecting && !portrait.started) {
        portrait.started = true;
        if (reducedMotion.matches || buildMilliseconds === 0) showCompletePortrait(portrait);
      }
    });
    requestTick();
  }, { threshold: 0 });
  const proximityObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const portrait = byFrame.get(entry.target);
      if (entry.isIntersecting) {
        nearbyPortraits.add(portrait);
      } else {
        nearbyPortraits.delete(portrait);
        portrait.substitutions.clear();
        drawPortrait(portrait);
      }
    });
    requestTick();
  }, { rootMargin: "180px 0px", threshold: 0 });
  portraits.forEach(portrait => {
    visibilityObserver.observe(portrait.frame);
    proximityObserver.observe(portrait.frame);
  });
}

function updateMotionPreference() {
  cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  if (reducedMotion.matches) portraits.forEach(showCompletePortrait);
  effects?.setReducedMotion();
  requestTick();
}

async function startGallery() {
  document.documentElement.style.setProperty("--portrait-spacing", `${Math.max(0, ART_SETTINGS.portraitSpacing)}svh`);
  const results = await Promise.allSettled(PORTRAIT_FILES.map(loadPortrait));
  results.forEach(result => {
    if (result.status === "fulfilled") {
      const portrait = result.value;
      gallery.append(portrait.section);
      portrait.width = portrait.pre.getBoundingClientRect().width;
      portrait.height = portrait.pre.getBoundingClientRect().height;
      // Empty the display only after measuring its full dimensions.
      portrait.pre.textContent = "";
      portraits.push(portrait);
    } else {
      console.error("Portrait could not load:", result.reason);
    }
  });
  if (portraits.length !== PORTRAIT_FILES.length) {
    const status = document.getElementById("load-status");
    status.className = "fallback";
    status.textContent = "Some portraits could not load. Open index.html with Live Server and check the filenames in gallery.js.";
  }
  fitPortraits();
  if (reducedMotion.matches) portraits.forEach(showCompletePortrait);
  observePortraits();
  // Ambient fragments and the cursor are added after the portrait layer works.
  if (window.GalleryEffects) effects = GalleryEffects.init(ART_SETTINGS, portraits.map(p => p.section), reducedMotion);
  let resizeFrame = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      fitPortraits();
      effects?.relayout();
    });
  });
  reducedMotion.addEventListener("change", updateMotionPreference);
  document.addEventListener("visibilitychange", () => {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    effects?.setHidden(document.hidden);
    requestTick();
  });
}

startGallery();
