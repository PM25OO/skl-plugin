(function bridgeStoredConfiguration() {
  "use strict";

  const CONFIG_EVENT = "skl-plugin:configuration";
  const STORAGE_KEYS = [
    "schemaVersion",
    "enabled",
    "activeLocationId",
    "locations"
  ];

  async function publishConfiguration() {
    const stored = await chrome.storage.local.get(STORAGE_KEYS);
    const configuration = SklConfig.activeConfiguration(stored);
    document.dispatchEvent(
      new CustomEvent(CONFIG_EVENT, {
        detail: configuration
      })
    );
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (
      areaName === "local" &&
      STORAGE_KEYS.some((key) => Object.hasOwn(changes, key))
    ) {
      void publishConfiguration();
    }
  });

  void publishConfiguration();
})();
