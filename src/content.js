(function bridgeStoredConfiguration() {
  "use strict";

  const CONFIG_EVENT = "skl-plugin:configuration";
  const STORAGE_KEYS = [
    "schemaVersion",
    "enabled",
    "activeLocationId",
    "locations",
    "codeOverrideEnabled",
    "codeOverride"
  ];
  let currentConfiguration = null;
  let decorationScheduled = false;

  function updateLocationLabels() {
    decorationScheduled = false;
    const name =
      currentConfiguration?.enabled && currentConfiguration.location?.name
        ? currentConfiguration.location.name
        : null;
    const existingBadges = document.querySelectorAll(
      ".skl-plugin-location-name"
    );

    if (!name) {
      for (const badge of existingBadges) {
        badge.remove();
      }
      return;
    }

    for (const badge of existingBadges) {
      const label = `· ${name}`;
      if (badge.textContent !== label) {
        badge.textContent = label;
      }
    }
    if (existingBadges.length > 0) {
      return;
    }

    const walker = document.createTreeWalker(document, NodeFilter.SHOW_TEXT);
    const targets = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (
        /^当前位置[：:]?$/.test(node.nodeValue?.trim() ?? "") &&
        parent &&
        !parent.querySelector(":scope > .skl-plugin-location-name")
      ) {
        targets.push(parent);
      }
    }

    for (const target of targets) {
      const badge = document.createElement("span");
      badge.className = "skl-plugin-location-name";
      badge.textContent = `· ${name}`;
      target.append(badge);
    }
  }

  function scheduleLocationDecoration() {
    if (decorationScheduled) {
      return;
    }
    decorationScheduled = true;
    window.requestAnimationFrame(updateLocationLabels);
  }

  async function publishConfiguration() {
    const stored = await chrome.storage.local.get(STORAGE_KEYS);
    const configuration = SklConfig.activeConfiguration(stored);
    currentConfiguration = configuration;
    document.dispatchEvent(
      new CustomEvent(CONFIG_EVENT, {
        detail: configuration
      })
    );
    scheduleLocationDecoration();
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (
      areaName === "local" &&
      STORAGE_KEYS.some((key) => Object.hasOwn(changes, key))
    ) {
      void publishConfiguration();
    }
  });

  const observer = new MutationObserver(scheduleLocationDecoration);
  observer.observe(document, { childList: true, subtree: true });

  void publishConfiguration();
})();
