/* GSAP motion layer — brutalist motion language.
 *
 * Rules of this language: hard stamps instead of soft fades, stepped eases
 * (steps(n)) instead of smooth ones, clip-path wipes like ink on paper, offset
 * shadows that collapse, no bounce, no blur. Everything is added on top of the
 * existing code through observers and delegated listeners, nothing else in the
 * app needs to know about it. If GSAP fails to load, the app works as before.
 *
 * Needs: gsap + ScrollTrigger (loaded from cdnjs in index.html).
 */
(function () {
  if (!window.gsap) return;
  if (window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
  gsap.defaults({ ease: "power4.out", duration: 0.3 });

  // Preference: "system" (default, respects prefers-reduced-motion), "on", "off"
  let pref = "system";
  try {
    pref = localStorage.getItem("motion") || "system";
  } catch (e) {}

  const select = document.getElementById("motionSetting");
  if (select) {
    select.value = pref;
    select.addEventListener("change", () => {
      try {
        localStorage.setItem("motion", select.value);
      } catch (e) {}
      location.reload(); // simplest way to start/stop the whole layer cleanly
    });
  }

  if (pref === "off") return;

  const mm = gsap.matchMedia();

  // "system": everything lives inside matchMedia, so users who prefer reduced
  // motion get the plain app. "on": same code, but run regardless of the OS.
  function setup() {
    const cleanups = [];
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      cleanups.push(() => target.removeEventListener(type, fn, opts));
    };

    /* ---------------------------------------------------------------
     * 1. Open-state animations (modals, stages, loading box, tabs, cards)
     *    A single observer reacts when a class like "show" is ADDED.
     *    Closing stays instant on purpose: hard cuts are part of the look.
     * ------------------------------------------------------------- */

    // Modal: hard wipe from the top, in steps. Only clip-path is animated, so the
    // modal's position (centred by CSS) is never touched; this is also much
    // cheaper than animating a shadow variable or many children on Android.
    function modalIn(m) {
      gsap.killTweensOf(m);
      gsap.fromTo(
        m,
        { clipPath: "inset(0 0 100% 0)" },
        {
          clipPath: "inset(0 0 0% 0)",
          duration: 0.28,
          ease: "steps(7)",
          clearProps: "clipPath",
        },
      );
    }

    // Full-screen stages (test / discover / quiz): wipe down like a curtain
    function wipeIn(el) {
      gsap.killTweensOf(el);
      gsap.fromTo(
        el,
        { clipPath: "inset(0 0 100% 0)" },
        {
          clipPath: "inset(0 0 0% 0)",
          duration: 0.4,
          ease: "power4.inOut",
          clearProps: "clipPath",
        },
      );
    }

    // Loading box: slams in, label is "typed" in hard steps
    function loadingIn(overlay) {
      const box = overlay.querySelector(".ld-box");
      const label = overlay.querySelector(".ld-label");
      if (!box) return;
      gsap.killTweensOf([overlay, box, label]);
      gsap.fromTo(
        overlay,
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.1, ease: "none" },
      );
      gsap.fromTo(
        box,
        { scale: 1.1, y: -20, autoAlpha: 0 },
        {
          scale: 1,
          y: 0,
          autoAlpha: 1,
          duration: 0.24,
          clearProps: "transform",
        },
      );
      if (label) {
        gsap.fromTo(
          label,
          { clipPath: "inset(0 100% 0 0)" },
          {
            clipPath: "inset(0 0% 0 0)",
            duration: 0.4,
            delay: 0.12,
            ease: "steps(14)",
            clearProps: "clipPath",
          },
        );
      }
    }

    // Tab panel: horizontal ink wipe
    function panelIn(p) {
      gsap.killTweensOf(p);
      gsap.fromTo(
        p,
        { clipPath: "inset(0 100% 0 0)" },
        {
          clipPath: "inset(0 0% 0 0)",
          duration: 0.4,
          ease: "power4.out",
          clearProps: "clipPath",
        },
      );
    }

    // Word card body: unfolds in stepped increments
    function unfoldIn(b) {
      gsap.killTweensOf(b);
      gsap.fromTo(
        b,
        { clipPath: "inset(0 0 100% 0)" },
        {
          clipPath: "inset(0 0 0% 0)",
          duration: 0.3,
          ease: "steps(6)",
          clearProps: "clipPath",
        },
      );
    }

    const RULES = [
      { sel: ".modal", cls: "show", fn: modalIn },
      {
        sel: "#testStage, #discoverStage, #quizStage",
        cls: "show",
        fn: wipeIn,
      },
      { sel: ".ld-overlay", cls: "on", fn: loadingIn },
      { sel: ".tab-panel", cls: "active", fn: panelIn },
      { sel: ".word-card-body", cls: "open", fn: unfoldIn },
    ];

    const classObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        const t = m.target;
        if (!(t instanceof Element)) continue;
        const before = (m.oldValue || "").split(/\s+/);
        for (const r of RULES) {
          if (
            t.matches(r.sel) &&
            !before.includes(r.cls) &&
            t.classList.contains(r.cls)
          )
            r.fn(t);
        }
      }
    });
    classObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
      attributeOldValue: true,
      subtree: true,
    });
    cleanups.push(() => classObserver.disconnect());

    /* ---------------------------------------------------------------
     * 2. Buttons: mechanical press. Sinks 2px on pointer down and returns
     *    in hard steps (no springy bounce).
     * ------------------------------------------------------------- */
    const PRESSABLE = ".btn, .icon-btn, .tab-btn, .delete-link, .user-card";
    let pressed = null;

    on(
      document,
      "pointerdown",
      (e) => {
        const b = e.target.closest && e.target.closest(PRESSABLE);
        if (!b || b.disabled || b.classList.contains("is-busy")) return;
        pressed = b;
        gsap.to(b, {
          x: 2,
          y: 2,
          scale: 0.97,
          duration: 0.06,
          ease: "power2.out",
          overwrite: "auto",
        });
      },
      { passive: true },
    );

    const release = () => {
      if (!pressed) return;
      const b = pressed;
      pressed = null;
      gsap.to(b, {
        x: 0,
        y: 0,
        scale: 1,
        duration: 0.2,
        ease: "steps(4)",
        overwrite: "auto",
        clearProps: "transform",
      });
    };
    on(document, "pointerup", release, { passive: true });
    on(document, "pointercancel", release, { passive: true });

    /* ---------------------------------------------------------------
     * 3. Vocabulary list: cards are hidden and revealed as they scroll
     *    into view (ScrollTrigger.batch → staggered per batch).
     * ------------------------------------------------------------- */
    let cardTriggers = [];
    const killCardTriggers = () => {
      cardTriggers.forEach((t) => t.kill());
      cardTriggers = [];
    };

    function revealCards(cards) {
      killCardTriggers();
      if (!cards.length || !window.ScrollTrigger) return;
      try {
        gsap.set(cards, { autoAlpha: 0, x: -28 });
        cardTriggers = ScrollTrigger.batch(cards, {
          start: "top 98%",
          once: true,
          interval: 0.08,
          batchMax: 8,
          onEnter: (batch) =>
            gsap.to(batch, {
              autoAlpha: 1,
              x: 0,
              duration: 0.34,
              stagger: 0.045,
              overwrite: "auto",
              clearProps: "opacity,visibility,transform",
            }),
        });
      } catch (err) {
        // never leave cards invisible if something goes wrong
        gsap.set(cards, { clearProps: "opacity,visibility,transform" });
        console.warn("[motion] card reveal disabled:", err.message);
      }
    }

    const wordList = document.getElementById("wordList");
    if (wordList) {
      const listObserver = new MutationObserver((mutations) => {
        if (!mutations.some((m) => m.addedNodes.length)) return;
        revealCards([...wordList.querySelectorAll(".word-card")]);
      });
      listObserver.observe(wordList, { childList: true });
      cleanups.push(() => {
        listObserver.disconnect();
        killCardTriggers();
        gsap.set(wordList.querySelectorAll(".word-card"), {
          clearProps: "opacity,visibility,transform",
        });
      });
    }

    /* ---------------------------------------------------------------
     * 4. Images scan in like a print line when they finish loading
     * ------------------------------------------------------------- */
    on(
      document,
      "load",
      (e) => {
        const img = e.target;
        if (
          !(img instanceof HTMLImageElement) ||
          !img.matches(".word-thumb, .word-hero, .fc-image")
        )
          return;
        gsap.fromTo(
          img,
          { clipPath: "inset(0 0 100% 0)" },
          {
            clipPath: "inset(0 0 0% 0)",
            duration: 0.35,
            ease: "steps(7)",
            clearProps: "clipPath",
          },
        );
      },
      true,
    );

    /* ---------------------------------------------------------------
     * 5. User picker cards and the first page intro
     * ------------------------------------------------------------- */
    const userList = document.getElementById("userList");
    if (userList) {
      const userObserver = new MutationObserver((mutations) => {
        if (!mutations.some((m) => m.addedNodes.length)) return;
        gsap.from(userList.children, {
          x: -24,
          autoAlpha: 0,
          duration: 0.3,
          stagger: 0.06,
          clearProps: "opacity,visibility,transform",
        });
      });
      userObserver.observe(userList, { childList: true });
      cleanups.push(() => userObserver.disconnect());
    }

    const intro = gsap.timeline({ defaults: { ease: "power4.out" } });
    intro
      .from(
        ".macro",
        {
          clipPath: "inset(0 100% 0 0)",
          duration: 0.5,
          ease: "steps(10)",
          clearProps: "clipPath",
        },
        0,
      )
      .from(
        ".stripe",
        {
          scaleX: 0,
          transformOrigin: "0 50%",
          duration: 0.45,
          clearProps: "transform",
        },
        0.1,
      )
      .from(
        ".brand-sub, .topbar-meta",
        {
          autoAlpha: 0,
          y: -8,
          duration: 0.25,
          clearProps: "opacity,visibility,transform",
        },
        0.25,
      )
      .from(
        ".tab-btn",
        {
          y: -12,
          autoAlpha: 0,
          duration: 0.25,
          stagger: 0.06,
          clearProps: "opacity,visibility,transform",
        },
        0.3,
      );
    cleanups.push(() => intro.kill());

    return () => cleanups.forEach((fn) => fn());
  }

  if (pref === "on") setup();
  else mm.add("(prefers-reduced-motion: no-preference)", setup);
})();
