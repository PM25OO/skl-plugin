importScripts("shared.js");

(function initializeConfigurationExport() {
  "use strict";

  const EXPORT_KEYS = new Set(["enabled", "activeLocationId", "locations"]);
  const EXPORT_FILENAME = "skl-plugin/config.json";
  let exportTimer = null;

  async function exportConfiguration() {
    const stored = await chrome.storage.local.get();
    const exportedAt = new Date().toISOString();
    const configuration = SklConfig.exportedConfiguration(stored, exportedAt);
    const json = `${JSON.stringify(configuration, null, 2)}\n`;
    const url = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;

    try {
      await chrome.downloads.download({
        url,
        filename: EXPORT_FILENAME,
        conflictAction: "overwrite",
        saveAs: false
      });
      await chrome.storage.local.set({
        lastExportedAt: exportedAt,
        lastExportError: null
      });
    } catch (error) {
      await chrome.storage.local.set({
        lastExportError: error instanceof Error ? error.message : String(error)
      });
    }
  }

  function scheduleExport() {
    if (exportTimer !== null) {
      clearTimeout(exportTimer);
    }
    exportTimer = setTimeout(() => {
      exportTimer = null;
      void exportConfiguration();
    }, 300);
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (
      areaName === "local" &&
      Object.keys(changes).some((key) => EXPORT_KEYS.has(key))
    ) {
      scheduleExport();
    }
  });
})();
