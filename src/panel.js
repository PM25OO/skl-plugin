(function initializeFloatingPanel() {
  "use strict";

  const CONFIG_EVENT = "skl-plugin:configuration";
  const POSITION_MARGIN = 8;
  let configuration = null;
  let panel = null;
  let host = null;
  let summary = null;
  let toggleButton = null;
  let frame = null;
  let collapsed = false;
  let position = { right: 16, y: 16 };
  let dragging = null;
  let visible = false;

  function isMatchingPage() {
    return window.location.hash.startsWith("#/sign/in");
  }

  function briefSummary() {
    const locationLabel = configuration?.location?.name
      ? configuration.enabled
        ? configuration.location.name
        : `${configuration.location.name}（未启用）`
      : "系统定位";
    const codeLabel = configuration?.codeOverrideEnabled
      ? " · Code 已启用"
      : "";
    return `${locationLabel}${codeLabel}`;
  }

  function renderSummary() {
    if (summary) {
      summary.textContent = briefSummary();
      summary.title = briefSummary();
    }
  }

  function clampPosition(value) {
    const width = panel?.offsetWidth || (collapsed ? 240 : 380);
    const height = panel?.offsetHeight || 48;
    return {
      right: Math.min(
        Math.max(POSITION_MARGIN, Number(value?.right) || POSITION_MARGIN),
        Math.max(POSITION_MARGIN, window.innerWidth - width - POSITION_MARGIN)
      ),
      y: Math.min(
        Math.max(POSITION_MARGIN, Number(value?.y) || POSITION_MARGIN),
        Math.max(POSITION_MARGIN, window.innerHeight - height - POSITION_MARGIN)
      )
    };
  }

  function applyPosition(nextPosition = position) {
    position = clampPosition(nextPosition);
    panel.style.left = "auto";
    panel.style.right = `${position.right}px`;
    panel.style.top = `${position.y}px`;
  }

  function resetToTopRight() {
    applyPosition({ right: 16, y: 16 });
  }

  function delay(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function isVisible(element) {
    if (!element) {
      return false;
    }
    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      element.getClientRects().length > 0
    );
  }

  async function waitForKeyboard() {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const keyboard = [...document.querySelectorAll(".van-number-keyboard")].find(
        isVisible
      );
      if (keyboard) {
        return keyboard;
      }
      await delay(50);
    }
    throw new Error("未找到原页面数字键盘");
  }

  function digitKey(keyboard, digit) {
    return [...keyboard.querySelectorAll("button, .van-key")].find(
      (element) =>
        isVisible(element) && element.textContent?.trim() === digit
    );
  }

  async function simulatePageSign(code) {
    if (!isMatchingPage()) {
      throw new Error("当前不是签到页面");
    }
    if (!/^\d{4}$/.test(code)) {
      throw new Error("签到码必须是 4 位数字");
    }

    const passwordInput = document.querySelector(
      ".custom-password-input, .van-password-input"
    );
    if (!passwordInput) {
      throw new Error("未找到原页面签到码输入框");
    }
    passwordInput.click();
    const keyboard = await waitForKeyboard();
    const deleteKey = keyboard.querySelector(
      ".van-number-keyboard__delete, .van-key--delete, [aria-label*='删除']"
    );

    if (deleteKey && isVisible(deleteKey)) {
      for (let index = 0; index < 4; index += 1) {
        deleteKey.click();
        await delay(35);
      }
    }

    for (const digit of code) {
      const key = digitKey(keyboard, digit);
      if (!key) {
        throw new Error(`未找到数字键 ${digit}`);
      }
      key.click();
      await delay(70);
    }

    setCollapsed(true);
    return {
      ok: true,
      message: "已输入签到码并触发原页面签到流程"
    };
  }

  async function respondToSignRequest(message) {
    try {
      return await simulatePageSign(String(message?.code ?? ""));
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  function setCollapsed(value, persist = true) {
    collapsed = Boolean(value);
    panel.classList.toggle("collapsed", collapsed);
    toggleButton.textContent = collapsed ? "+" : "−";
    toggleButton.setAttribute(
      "aria-label",
      collapsed ? "展开 SKL 配置窗口" : "收缩 SKL 配置窗口"
    );
    if (persist) {
      void chrome.storage.local.set({ panelCollapsed: collapsed });
    }
  }

  function updateVisibility() {
    if (host) {
      const shouldShow = isMatchingPage();
      host.style.display = shouldShow ? "block" : "none";
      if (shouldShow && !visible) {
        window.requestAnimationFrame(resetToTopRight);
      }
      visible = shouldShow;
    }
  }

  function createPanelElements() {
    host = document.createElement("div");
    host.id = "skl-plugin-floating-panel";
    host.style.cssText = [
      "all: initial",
      "position: fixed",
      "inset: 0",
      "z-index: 2147483647",
      "pointer-events: none"
    ].join(";");

    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      .panel {
        position: fixed;
        width: 380px;
        max-width: calc(100vw - 16px);
        overflow: hidden;
        border: 1px solid rgba(51, 92, 66, 0.22);
        border-radius: 15px;
        background: #f3f6f2;
        box-shadow: 0 18px 50px rgba(22, 48, 31, 0.22);
        color: #17221b;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system,
          BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: auto;
        transition: width 160ms ease, box-shadow 160ms ease;
      }
      .panel.collapsed {
        width: 240px;
        box-shadow: 0 10px 28px rgba(22, 48, 31, 0.18);
      }
      .bar {
        display: flex;
        align-items: center;
        gap: 9px;
        height: 44px;
        padding: 0 9px 0 12px;
        background: linear-gradient(135deg, #235f3d, #31875a);
        color: #fff;
        cursor: move;
        user-select: none;
        touch-action: none;
      }
      .brand {
        flex: none;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.08em;
      }
      .summary {
        flex: 1;
        overflow: hidden;
        color: rgba(255, 255, 255, 0.82);
        font-size: 11px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .toggle {
        display: grid;
        flex: none;
        width: 28px;
        height: 28px;
        padding: 0;
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.12);
        color: #fff;
        cursor: pointer;
        font: 700 20px/1 system-ui, sans-serif;
        place-items: center;
      }
      .toggle:hover {
        background: rgba(255, 255, 255, 0.22);
      }
      .toggle:focus-visible {
        outline: 2px solid #fff;
        outline-offset: 1px;
      }
      .frame {
        display: block;
        width: 100%;
        height: min(540px, calc(100vh - 68px));
        border: 0;
        background: #f3f6f2;
      }
      .collapsed .frame {
        display: none;
      }
    `;

    panel = document.createElement("section");
    panel.className = "panel";
    panel.setAttribute("aria-label", "SKL 配置窗口");

    const bar = document.createElement("div");
    bar.className = "bar";
    const brand = document.createElement("span");
    brand.className = "brand";
    brand.textContent = "SKL";
    summary = document.createElement("span");
    summary.className = "summary";
    toggleButton = document.createElement("button");
    toggleButton.className = "toggle";
    toggleButton.type = "button";
    toggleButton.addEventListener("click", () => {
      setCollapsed(!collapsed);
    });
    bar.append(brand, summary, toggleButton);

    frame = document.createElement("iframe");
    frame.className = "frame";
    frame.title = "SKL 坐标助手配置";
    frame.src = chrome.runtime.getURL("popup/popup.html?embedded=1");
    panel.append(bar, frame);
    shadow.append(style, panel);

    bar.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button")) {
        return;
      }
      const rect = panel.getBoundingClientRect();
      dragging = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top
      };
      bar.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    bar.addEventListener("pointermove", (event) => {
      if (!dragging || dragging.pointerId !== event.pointerId) {
        return;
      }
      applyPosition({
        right:
          window.innerWidth -
          (event.clientX - dragging.offsetX) -
          panel.offsetWidth,
        y: event.clientY - dragging.offsetY
      });
    });
    const finishDragging = (event) => {
      if (!dragging || dragging.pointerId !== event.pointerId) {
        return;
      }
      dragging = null;
    };
    bar.addEventListener("pointerup", finishDragging);
    bar.addEventListener("pointercancel", finishDragging);

    document.documentElement.append(host);
    return { bar };
  }

  async function mount() {
    createPanelElements();
    const stored = await chrome.storage.local.get(["panelCollapsed"]);
    await chrome.storage.local.remove("panelPosition");
    collapsed = Boolean(stored.panelCollapsed);
    setCollapsed(collapsed, false);
    resetToTopRight();
    renderSummary();
    updateVisibility();
  }

  document.addEventListener(CONFIG_EVENT, (event) => {
    configuration = event.detail;
    renderSummary();
  });
  window.addEventListener("message", (event) => {
    if (
      !frame ||
      event.source !== frame.contentWindow ||
      event.origin !== new URL(chrome.runtime.getURL("/")).origin ||
      event.data?.type !== "skl-plugin:simulate-sign"
    ) {
      return;
    }
    void respondToSignRequest(event.data).then((result) => {
      event.source.postMessage(
        {
          type: "skl-plugin:sign-result",
          requestId: event.data.requestId,
          ...result
        },
        event.origin
      );
    });
  });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "skl-plugin:simulate-sign") {
      return false;
    }
    void respondToSignRequest(message).then(sendResponse);
    return true;
  });
  window.addEventListener("hashchange", updateVisibility);
  window.addEventListener("resize", () => {
    if (panel) {
      applyPosition();
    }
  });

  if (document.documentElement) {
    void mount();
  } else {
    document.addEventListener("DOMContentLoaded", () => void mount(), {
      once: true
    });
  }
})();
