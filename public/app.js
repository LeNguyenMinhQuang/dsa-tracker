function init() {
  document.getElementById("userLabel").textContent =
    "USER / " + currentUser.name;
  document
    .getElementById("switchUserBtn")
    .addEventListener("click", switchUser);

  const now = new Date();
  state.year = now.getFullYear();
  state.month = now.getMonth() + 1;
  loadMonth();

  document
    .getElementById("prevMonth")
    .addEventListener("click", () => shiftMonth(-1));
  document
    .getElementById("nextMonth")
    .addEventListener("click", () => shiftMonth(1));
  document.getElementById("closePanel").addEventListener("click", closePanel);
  overlay.addEventListener("click", closePanel);

  document
    .getElementById("settingsBtn")
    .addEventListener("click", openSettings);
  document
    .getElementById("settingsCancel")
    .addEventListener("click", closeSettings);
  document
    .getElementById("settingsOverlay")
    .addEventListener("click", closeSettings);
  document
    .getElementById("settingsSave")
    .addEventListener("click", saveSettings);
  document
    .getElementById("addReviewInterval")
    .addEventListener("click", () => addReviewIntervalRow(3));

  initTabs();
  initVocab();
  initChecklist();
}

// Bootstrap
initUserPicker();
if (currentUser && currentUser.id) {
  init();
} else {
  showUserPicker();
}
