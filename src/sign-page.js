(function initializeSignPageAutomation(root) {
  "use strict";

  function delay(windowObject, milliseconds) {
    return new Promise((resolve) =>
      windowObject.setTimeout(resolve, milliseconds)
    );
  }

  function isVisible(windowObject, element) {
    if (!element) {
      return false;
    }
    const style = windowObject.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      element.getClientRects().length > 0
    );
  }

  async function waitForKeyboard(documentObject, windowObject) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const keyboard = [
        ...documentObject.querySelectorAll(".van-number-keyboard")
      ].find((element) => isVisible(windowObject, element));
      if (keyboard) {
        return keyboard;
      }
      await delay(windowObject, 50);
    }
    throw new Error("未找到原页面数字键盘");
  }

  function digitKey(windowObject, keyboard, digit) {
    return [...keyboard.querySelectorAll("button, .van-key")].find(
      (element) =>
        isVisible(windowObject, element) &&
        element.textContent?.trim() === digit
    );
  }

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

    const passwordInput = documentObject.querySelector(
      ".custom-password-input, .van-password-input"
    );
    if (!passwordInput) {
      throw new Error("未找到原页面签到码输入框");
    }

    passwordInput.dispatchEvent(
      new windowObject.Event("touchstart", {
        bubbles: true,
        cancelable: true
      })
    );
    const PointerEventConstructor =
      windowObject.PointerEvent ?? windowObject.Event;
    passwordInput.dispatchEvent(
      new PointerEventConstructor("pointerdown", {
        bubbles: true,
        cancelable: true,
        pointerType: "mouse"
      })
    );
    passwordInput.click();

    for (let index = 0; index < 4; index += 1) {
      const keyboard = await waitForKeyboard(documentObject, windowObject);
      const deleteKey = keyboard.querySelector(
        ".van-number-keyboard__delete, .van-key--delete, [aria-label*='删除']"
      );
      if (deleteKey && isVisible(windowObject, deleteKey)) {
        deleteKey.click();
        await delay(windowObject, 35);
      }
    }

    for (const digit of code) {
      const keyboard = await waitForKeyboard(documentObject, windowObject);
      const key = digitKey(windowObject, keyboard, digit);
      if (!key) {
        throw new Error(`未找到数字键 ${digit}`);
      }
      key.click();
      await delay(windowObject, 70);
    }

    return {
      ok: true,
      message: "已输入签到码并触发原页面签到流程"
    };
  }

  const api = Object.freeze({ simulatePageSign });
  root.SklSignPage = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(globalThis);
