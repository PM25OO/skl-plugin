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
  let publicationSequence = 0;

  function updateLocationDisplay() {
    decorationScheduled = false;
    const location = currentConfiguration?.enabled
      ? currentConfiguration.location
      : null;
    if (!location) {
      for (const element of document.querySelectorAll(
        ".skl-plugin-created-location, .skl-plugin-current-location, .skl-plugin-location-name"
      )) {
        element.remove();
      }
      for (const element of document.querySelectorAll(
        ".skl-plugin-native-location-hidden"
      )) {
        element.classList.remove("skl-plugin-native-location-hidden");
      }
      return;
    }

    for (const container of document.querySelectorAll(
      ".sign-page .sign-tips"
    )) {
      const nativeItem = [...container.querySelectorAll(
        ":scope > .tip-item.location"
      )].find(
        (item) => !item.classList.contains("skl-plugin-created-location")
      );
      let createdItem = container.querySelector(
        ":scope > .skl-plugin-created-location"
      );
      if (nativeItem && createdItem) {
        createdItem.remove();
        createdItem = null;
      }
      if (!nativeItem && !createdItem) {
        createdItem = document.createElement("div");
        createdItem.className = "tip-item location skl-plugin-created-location";
        container.append(createdItem);
      }
      const item = nativeItem ?? createdItem;
      const nativeText = nativeItem?.querySelector(
        ":scope > span:not(.skl-plugin-current-location)"
      );
      nativeText?.classList.add("skl-plugin-native-location-hidden");
      let display = item.querySelector(":scope > .skl-plugin-current-location");
      if (!display) {
        display = nativeText?.cloneNode(false) ?? document.createElement("span");
        display.classList.remove("skl-plugin-native-location-hidden");
        display.classList.add("skl-plugin-current-location");
        item.append(display);
      }
      const coordinates = `当前位置: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
      if (display.firstChild?.nodeType === Node.TEXT_NODE) {
        if (display.firstChild.nodeValue !== coordinates) {
          display.firstChild.nodeValue = coordinates;
        }
      } else {
        display.prepend(document.createTextNode(coordinates));
      }
      let badge = display.querySelector(":scope > .skl-plugin-location-name");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "skl-plugin-location-name";
        display.append(badge);
      }
      const nameLabel = `· ${location.name}`;
      if (badge.textContent !== nameLabel) {
        badge.textContent = nameLabel;
      }
    }
  }

  function scheduleLocationDecoration() {
    if (decorationScheduled) {
      return;
    }
    decorationScheduled = true;
    window.requestAnimationFrame(updateLocationDisplay);
  }

  async function publishConfiguration() {
    const sequence = ++publicationSequence;
    const stored = await chrome.storage.local.get(STORAGE_KEYS);
    if (sequence !== publicationSequence) {
      return;
    }
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
