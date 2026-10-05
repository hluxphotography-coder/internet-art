"use strict";

// Separate from the portraits: a few escaped characters and the desktop pointer.
window.GalleryEffects = {
  init(settings, sections, motionPreference) {
    const characters = ".:-=+*#%@";
    const field = document.getElementById("ambient-field");
    const cursorLayer = document.getElementById("cursor-layer");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sectionNodes = sections.map(section => section.section || section);
    const ambient = [];
    const nearby = new Set();
    const fragments = [];
    const trailLimit = Math.min(5, Math.max(0, Math.floor(settings.cursorTrailAmount)));
    let reduced = motionPreference.matches;
    let hidden = document.hidden;
    let ambientTimer = 0;
    let cursorTimer = 0;
    let pointerFrame = 0;
    let pointerActive = false;
    let pointerX = 0;
    let pointerY = 0;
    let lastTrailX = 0;
    let lastTrailY = 0;
    let lastTrailAt = 0;
    let cursorIndex = characters.length - 1;

    const cursor = document.createElement("span");
    cursor.className = "ascii-cursor";
    cursor.textContent = characters[cursorIndex];
    cursor.hidden = true;
    cursorLayer.append(cursor);

    // One observer and one slow timer serve the entire sparse ambient field.
    const ambientObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const item = ambient.find(character => character.node === entry.target);
        if (entry.isIntersecting) nearby.add(item);
        else nearby.delete(item);
      });
      updateAmbientActivity();
    }, { rootMargin: "100px 0px" });

    // A quarter of the fragments remain between portraits. The rest are spread
    // along both sides, with enough empty space to keep the photograph dominant.
    function createAmbientCharacters() {
      if (!sectionNodes.length) return;
      const count = Math.min(200, Math.max(0, Math.floor(settings.ambientCharacterCount)));
      const gapCount = sectionNodes.length > 1 ? Math.round(count / 4) : 0;
      const sideCount = count - gapCount;
      for (let i = 0; i < count; i++) {
        const node = document.createElement("span");
        node.className = "ambient-character";
        node.style.fontSize = `${9 + Math.random() * 3}px`;
        node.style.opacity = String(0.24 + Math.random() * 0.26);
        const inGap = i < gapCount;
        const sideIndex = i - gapCount;
        const sideSlot = sideIndex % (sectionNodes.length * 2);
        const region = inGap ? "gap" : (sideIndex % 2 === 0 ? "left" : "right");
        // Loose vertical bands prevent the side characters from gathering in clumps.
        const band = Math.floor(sideIndex / (sectionNodes.length * 2));
        const bands = Math.ceil((sideCount - sideSlot) / (sectionNodes.length * 2));
        const item = {
          node, region,
          section: inGap ? i % (sectionNodes.length - 1) : Math.floor(sideSlot / 2),
          x: 0.08 + Math.random() * 0.84,
          y: inGap ? 0.2 + Math.random() * 0.6 : (band + 0.2 + Math.random() * 0.6) / bands,
          index: Math.floor(Math.random() * characters.length),
          nextChange: performance.now() + 3000 + Math.random() * 3000,
          animation: null
        };
        node.dataset.region = region;
        node.textContent = characters[item.index];
        ambient.push(item);
        field.append(node);
        ambientObserver.observe(node);
      }
    }

    function relayout() {
      const bounds = sectionNodes.map(section => section.getBoundingClientRect());
      // Use the reserved full portrait frame, even while its text is still building.
      const frames = sectionNodes.map(section => section.querySelector(".portrait-frame").getBoundingClientRect());
      const pageWidth = document.documentElement.clientWidth;
      const edge = 18;
      const clearSpace = 36;
      const characterSize = 12;
      ambient.forEach(item => {
        let left, right, top, height;
        if (item.region === "gap") {
          left = edge;
          right = pageWidth - edge - characterSize;
          top = bounds[item.section].bottom + window.scrollY;
          height = bounds[item.section + 1].top - bounds[item.section].bottom;
        } else {
          const frame = frames[item.section];
          left = item.region === "left" ? edge : frame.right + clearSpace;
          right = item.region === "left" ? frame.left - clearSpace - characterSize : pageWidth - edge - characterSize;
          top = frame.top + window.scrollY + characterSize;
          height = frame.height - characterSize * 3;
        }
        // Phones keep the open space between portraits; side characters never
        // get squeezed onto the image or pushed beyond the screen edges.
        item.node.hidden = right - left < 16 || height < 24;
        item.node.style.left = `${left + (right - left) * item.x}px`;
        item.node.style.top = `${top + height * item.y}px`;
      });
      updateAmbientActivity();
    }

    function changeAmbientCharacters() {
      ambientTimer = 0;
      const now = performance.now();
      nearby.forEach(item => {
        if (now < item.nextChange || item.node.hidden) return;
        item.index = Math.max(0, Math.min(characters.length - 1,
          item.index + (Math.random() < 0.5 ? -1 : 1)));
        item.node.textContent = characters[item.index];
        item.nextChange = now + 3000 + Math.random() * 3000;
      });
      updateAmbientActivity();
    }

    function updateAmbientActivity() {
      clearTimeout(ambientTimer);
      ambientTimer = 0;
      ambient.forEach(item => {
        const active = nearby.has(item) && !item.node.hidden && !hidden && !reduced;
        if (active && !item.animation) {
          item.animation = item.node.animate([
            { transform: "translate(0, 0)" },
            { transform: `translate(${Math.random() * 4 - 2}px, 3px)` }
          ], { duration: 14000 + Math.random() * 8000, iterations: Infinity,
            direction: "alternate", easing: "ease-in-out" });
        }
        if (item.animation) {
          if (reduced) { item.animation.cancel(); item.animation = null; }
          else if (active) item.animation.play();
          else item.animation.pause();
        }
      });
      if (nearby.size && !hidden && !reduced) {
        ambientTimer = window.setTimeout(changeAmbientCharacters, 600);
      }
    }

    function removeFragment(fragment) {
      fragment.animation.cancel();
      fragment.node.remove();
      const index = fragments.indexOf(fragment);
      if (index !== -1) fragments.splice(index, 1);
    }

    function createCursorTrail(x, y) {
      if (!trailLimit) return;
      while (fragments.length >= trailLimit) removeFragment(fragments[0]);
      const node = document.createElement("span");
      node.className = "cursor-fragment";
      node.textContent = characters[cursorIndex];
      cursorLayer.append(node);
      const animation = node.animate([
        { transform: `translate(${x}px, ${y}px)`, opacity: 0.45 },
        { transform: `translate(${x + Math.random() * 6 - 3}px, ${y + 10}px)`, opacity: 0 }
      ], { duration: 650 + Math.random() * 400, easing: "ease-out", fill: "forwards" });
      const fragment = { node, animation };
      fragments.push(fragment);
      animation.onfinish = () => removeFragment(fragment);
    }

    function cycleCursor() {
      cursorIndex = (cursorIndex - 1 + characters.length) % characters.length;
      cursor.textContent = characters[cursorIndex];
      cursorTimer = window.setTimeout(cycleCursor, 850);
    }

    function clearCursor() {
      pointerActive = false;
      cursor.hidden = true;
      document.body.classList.remove("ascii-pointer");
      clearTimeout(cursorTimer);
      cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
      fragments.slice().forEach(removeFragment);
    }

    function moveCursor(event) {
      if (event.pointerType !== "mouse" || !finePointer.matches || reduced || hidden) {
        clearCursor();
        return;
      }
      pointerX = event.clientX;
      pointerY = event.clientY;
      const now = performance.now();
      if (!pointerActive) {
        pointerActive = true;
        cursor.hidden = false;
        document.body.classList.add("ascii-pointer");
        lastTrailX = pointerX; lastTrailY = pointerY; lastTrailAt = now;
        cursorTimer = window.setTimeout(cycleCursor, 850);
      }
      if (!pointerFrame) pointerFrame = requestAnimationFrame(() => {
        cursor.style.transform = `translate(${pointerX}px, ${pointerY}px)`;
        pointerFrame = 0;
      });
      if (now - lastTrailAt >= 90 && Math.hypot(pointerX - lastTrailX, pointerY - lastTrailY) >= 10) {
        createCursorTrail(pointerX, pointerY);
        lastTrailAt = now; lastTrailX = pointerX; lastTrailY = pointerY;
      }
    }

    function setReducedMotion() {
      reduced = motionPreference.matches;
      clearCursor();
      updateAmbientActivity();
    }

    function setHidden(value) {
      hidden = value;
      if (hidden) clearCursor();
      updateAmbientActivity();
    }

    document.addEventListener("pointermove", moveCursor, { passive: true });
    document.addEventListener("mouseleave", clearCursor);
    window.addEventListener("blur", clearCursor);
    finePointer.addEventListener("change", clearCursor);
    createAmbientCharacters();
    relayout();
    // The gallery owns resize, motion-preference, and visibility event listeners.
    return { relayout, setReducedMotion, setHidden };
  }
};
