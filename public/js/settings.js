function addReviewIntervalRow(value) {
  const list = document.getElementById("reviewIntervalsList");
  const row = document.createElement("div");
  row.className = "review-interval-row";
  row.innerHTML = `
    <input type="number" class="review-interval-input" min="1" value="${value !== undefined ? value : 3}">
    <span class="review-interval-suffix">days after initial completion</span>
    <button type="button" class="remove-review-interval" title="Remove interval">✕</button>
  `;
  row.querySelector(".remove-review-interval").addEventListener("click", () => {
    if (list.children.length > 1) row.remove();
  });
  list.appendChild(row);
}

async function openSettings() {
  const res = await api("/api/settings");
  const settings = await res.json();

  document.getElementById("newCountInput").value = settings.newCount;
  document.getElementById("randomCountInput").value = settings.randomCount;

  const list = document.getElementById("reviewIntervalsList");
  list.innerHTML = "";
  const intervals =
    settings.reviewIntervals && settings.reviewIntervals.length > 0
      ? settings.reviewIntervals
      : [3];
  intervals.forEach((v) => addReviewIntervalRow(v));

  document.getElementById("settingsOverlay").classList.add("show");
  document.getElementById("settingsModal").classList.add("show");

  // Admin-only block (user management + image generation)
  if (typeof loadAdminPanel === "function") loadAdminPanel().catch(() => {});
}

function closeSettings() {
  if (typeof stopAdminPolling === "function") stopAdminPolling();
  document.getElementById("settingsOverlay").classList.remove("show");
  document.getElementById("settingsModal").classList.remove("show");
}

async function saveSettings() {
  const newCount = parseInt(document.getElementById("newCountInput").value, 10);
  const randomCount = parseInt(
    document.getElementById("randomCountInput").value,
    10,
  );
  const reviewIntervals = [
    ...document.querySelectorAll(".review-interval-input"),
  ]
    .map((inp) => parseInt(inp.value, 10))
    .filter((n) => n > 0);

  if (isNaN(newCount) || newCount < 0) {
    alert("Please enter a valid number for new problems per day.");
    return;
  }
  if (isNaN(randomCount) || randomCount < 0) {
    alert("Please enter a valid number for random practice problems per day.");
    return;
  }
  if (reviewIntervals.length === 0) {
    alert("At least 1 valid review interval (> 0 days) is required.");
    return;
  }

  await api("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newCount, reviewIntervals, randomCount }),
  });
  closeSettings();
  loadMonth();
}
