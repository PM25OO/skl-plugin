(function initializeSignPageAutomation(root) {
  "use strict";

  const SIGN_REQUEST_EVENT = "skl-plugin:sign-request";
  const SIGN_RESULT_EVENT = "skl-plugin:sign-result";
  let nextRequestId = 1;

  async function simulatePageSign(
    code,
    documentObject = root.document,
    windowObject = root.window
  ) {
    if (!windowObject.location.hash.startsWith("#/sign/in")) {
      throw new Error("当前不是签到页面");
    }
    if (!/^\d{4}$/.test(code)) {
      throw new Error("签到码必须是 4 位数字");
    }

    const requestId = `sign-${Date.now()}-${nextRequestId++}`;
    return new Promise((resolve, reject) => {
      const timeout = windowObject.setTimeout(() => {
        documentObject.removeEventListener(SIGN_RESULT_EVENT, receiveResult);
        reject(new Error("原页面签到响应超时"));
      }, 2_000);
      function receiveResult(event) {
        if (event.detail?.requestId !== requestId) {
          return;
        }
        windowObject.clearTimeout(timeout);
        documentObject.removeEventListener(SIGN_RESULT_EVENT, receiveResult);
        if (event.detail.ok) {
          resolve({ ok: true, message: event.detail.message });
        } else {
          reject(new Error(event.detail.error || "原页面签到失败"));
        }
      }
      documentObject.addEventListener(SIGN_RESULT_EVENT, receiveResult);
      documentObject.dispatchEvent(
        new windowObject.CustomEvent(SIGN_REQUEST_EVENT, {
          detail: { requestId, code }
        })
      );
    });
  }

  const api = Object.freeze({ simulatePageSign });
  root.SklSignPage = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(globalThis);
