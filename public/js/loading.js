/* Brutalist loading UI.
 *
 *  - Loading.track(method, label)   used by api(): top stripe bar for every request,
 *                                   full-screen overlay when a request is slow
 *  - Loading.show(label, sub) / hide(token)   manual overlay
 *  - Loading.busy(button, on, text)           busy state for a button
 *  - Loading.run(label, fn)                   show overlay while fn() runs
 */
const Loading = (() => {
  const MUTATION_DELAY = 250; // ms before the overlay appears for POST/PUT/DELETE
  const READ_DELAY = 900; // ms before the overlay appears for GET
  const TOP_DELAY = 120; // ms before the top bar appears
  const MIN_VISIBLE = 400; // once visible, stay at least this long (no flicker)

  let overlay = null;
  let topBar = null;
  const active = new Map(); // token -> { label, sub }
  let seq = 0;
  let shownAt = 0;
  let timerId = null;
  let hideTimer = null;
  let topCount = 0;

  function ensure() {
    if (overlay) return;
    topBar = document.createElement("div");
    topBar.className = "ld-top";
    overlay = document.createElement("div");
    overlay.className = "ld-overlay";
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");
    overlay.innerHTML =
      '<div class="ld-box">' +
      '<div class="ld-head"><span><b>///</b> Processing</span><span class="ld-time">00:00</span></div>' +
      '<div class="ld-body">' +
      '<div class="ld-label"></div>' +
      '<div class="ld-sub"></div>' +
      '<div class="ld-bar"><div class="ld-fill"></div></div>' +
      '<div class="ld-foot">Please wait — do not close this page</div>' +
      "</div></div>";
    document.body.append(topBar, overlay);
  }

  function render() {
    const last = [...active.values()].pop();
    if (!last) return;
    overlay.querySelector(".ld-label").textContent = last.label;
    const secs = Math.floor((Date.now() - shownAt) / 1000);
    const mm = String(Math.floor(secs / 60)).padStart(2, "0");
    const ss = String(secs % 60).padStart(2, "0");
    overlay.querySelector(".ld-time").textContent = mm + ":" + ss;
    overlay.querySelector(".ld-sub").textContent =
      last.sub || (secs >= 8 ? "Still working — slow connection" : "");
    const bar = overlay.querySelector(".ld-bar");
    const fill = overlay.querySelector(".ld-fill");
    if (typeof last.progress === "number") {
      bar.classList.add("determinate");
      fill.style.width = Math.max(0, Math.min(100, last.progress)) + "%";
    } else {
      bar.classList.remove("determinate");
    }
  }

  function open() {
    clearTimeout(hideTimer);
    if (!overlay.classList.contains("on")) {
      shownAt = Date.now();
      overlay.classList.add("on");
      document.body.setAttribute("aria-busy", "true");
      timerId = setInterval(render, 250);
    }
    render();
  }

  function close() {
    const wait = Math.max(0, MIN_VISIBLE - (Date.now() - shownAt));
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (active.size > 0) return;
      overlay.classList.remove("on");
      document.body.removeAttribute("aria-busy");
      clearInterval(timerId);
      timerId = null;
    }, wait);
  }

  // Manual overlay, shown immediately. Returns a token for hide().
  function show(label, sub) {
    ensure();
    const token = ++seq;
    active.set(token, { label: label || "Working", sub: sub || "" });
    open();
    return token;
  }

  function update(token, patch) {
    const item = active.get(token);
    if (!item) return;
    Object.assign(item, patch);
    render();
  }

  function hide(token) {
    if (!active.delete(token)) return;
    if (active.size === 0 && overlay) close();
    else if (overlay) render();
  }

  async function run(label, fn) {
    const token = show(label);
    try {
      return await fn();
    } finally {
      hide(token);
    }
  }

  // Used by api(): returns { done() }
  function track(method, label) {
    ensure();
    const isRead = !method || String(method).toUpperCase() === "GET";
    const token = ++seq;
    let finished = false;
    let topShown = false;

    const topTimer = setTimeout(() => {
      if (finished) return;
      topShown = true;
      topCount++;
      topBar.classList.add("on");
    }, TOP_DELAY);

    const overlayTimer = setTimeout(() => {
      if (finished) return;
      active.set(token, { label: label || (isRead ? "Loading" : "Saving"), sub: "" });
      open();
    }, isRead ? READ_DELAY : MUTATION_DELAY);

    return {
      done() {
        if (finished) return;
        finished = true;
        clearTimeout(topTimer);
        clearTimeout(overlayTimer);
        if (topShown && --topCount <= 0) {
          topCount = 0;
          topBar.classList.remove("on");
        }
        hide(token);
      },
    };
  }

  // Button busy state: stripe bar along the bottom + optional text swap
  function busy(btn, on, text) {
    if (!btn) return;
    if (on) {
      if (btn.classList.contains("is-busy")) return;
      btn.dataset.ldText = btn.textContent;
      btn.classList.add("is-busy");
      btn.disabled = true;
      if (text) btn.textContent = text;
    } else {
      btn.classList.remove("is-busy");
      btn.disabled = false;
      if (btn.dataset.ldText !== undefined) {
        btn.textContent = btn.dataset.ldText;
        delete btn.dataset.ldText;
      }
    }
  }

  return { show, hide, update, run, track, busy };
})();

// Human readable overlay title for an API call
function loadingLabelFor(url, method) {
  const m = String(method || "GET").toUpperCase();
  const u = String(url || "");
  if (u.startsWith("/api/login")) return "Signing in";
  if (u.startsWith("/api/admin/images/backfill")) return "Scanning words";
  if (u.startsWith("/api/admin/images/stop")) return "Stopping";
  if (u.startsWith("/api/admin/images/all")) return "Deleting all images";
  if (u.startsWith("/api/admin/images")) return m === "DELETE" ? "Deleting image" : "Loading";
  if (u.startsWith("/api/admin/users")) {
    if (u.endsWith("/password")) return "Saving password";
    if (m === "POST") return "Creating user";
    if (m === "DELETE") return "Deleting user";
    return "Loading users";
  }
  if (u.startsWith("/api/words")) {
    if (m === "DELETE") return "Deleting word";
    if (m !== "GET") return "Saving word";
    return "Loading words";
  }
  if (m === "DELETE") return "Deleting";
  if (m !== "GET") return "Saving";
  return "Loading";
}
