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

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "skl-plugin:request-sign") {
      return false;
    }

    void (async () => {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true
        });
        if (!tab?.id) {
          throw new Error("没有可用的签到页面");
        }
        const result = await chrome.tabs.sendMessage(tab.id, {
          type: "skl-plugin:simulate-sign",
          code: String(message.code ?? "")
        });
        sendResponse(result ?? { ok: false, error: "签到页面未返回结果" });
      } catch (error) {
        sendResponse({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "无法连接当前签到页面，请刷新页面后重试"
        });
      }
    })();
    return true;
  });
})();
