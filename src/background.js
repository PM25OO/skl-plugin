importScripts("shared.js");

(function initializeConfigurationExport() {
  "use strict";

  const EXPORT_FILENAME = "skl-plugin-config.json";

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
      return { ok: true, filename: EXPORT_FILENAME };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await chrome.storage.local.set({
        lastExportError: errorMessage
      });
      return { ok: false, error: errorMessage };
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "skl-plugin:export-configuration") {
      void exportConfiguration().then(sendResponse);
      return true;
    }

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
