(function initializePopup() {
  "use strict";

  if (new URLSearchParams(window.location.search).get("embedded") === "1") {
    document.body.classList.add("embedded");
  }

  const elements = {
    enabled: document.querySelector("#enabled"),
    summary: document.querySelector("#summary"),
    locations: document.querySelector("#locations"),
    form: document.querySelector("#location-form"),
    codeEnabled: document.querySelector("#code-enabled"),
    codeForm: document.querySelector("#code-form"),
    codeOverride: document.querySelector("#code-override"),
    signNow: document.querySelector("#sign-now"),
    configImport: document.querySelector("#config-import"),
    message: document.querySelector("#message")
  };
  let state = SklConfig.normalizeState(null);

  function createId() {
    return crypto.randomUUID?.() ?? `location-${Date.now()}`;
  }

  async function save(nextState, message) {
    state = SklConfig.normalizeState(nextState);
    await chrome.storage.local.set(state);
    render();
    showMessage(message);
  }

  function showMessage(text, isError = false) {
    elements.message.textContent = text;
    elements.message.classList.toggle("error", isError);
  }

  function requestEmbeddedSign(code) {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID?.() ?? `sign-${Date.now()}`;
      const timeout = window.setTimeout(() => {
        window.removeEventListener("message", receiveResult);
        reject(new Error("页面未响应签到请求"));
      }, 4_000);

      function receiveResult(event) {
        if (
          event.source !== window.parent ||
          event.origin !== "https://skl.hdu.edu.cn" ||
          event.data?.type !== "skl-plugin:sign-result" ||
          event.data.requestId !== requestId
        ) {
          return;
        }
        window.clearTimeout(timeout);
        window.removeEventListener("message", receiveResult);
        if (event.data.ok) {
          resolve(event.data);
        } else {
          reject(new Error(event.data.error || "签到触发失败"));
        }
      }

      window.addEventListener("message", receiveResult);
      window.parent.postMessage(
        {
          type: "skl-plugin:simulate-sign",
          requestId,
          code
        },
        "https://skl.hdu.edu.cn"
      );
    });
  }

  async function requestPageSign(code) {
    if (window.parent !== window) {
      return requestEmbeddedSign(code);
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error("没有可用的签到页面");
    }
    const result = await chrome.tabs.sendMessage(tab.id, {
      type: "skl-plugin:simulate-sign",
      code
    });
    if (!result?.ok) {
      throw new Error(result?.error || "签到触发失败");
    }
    return result;
  }

  function render() {
    const active = state.locations.find(
      (location) => location.id === state.activeLocationId
    );
    elements.enabled.checked = state.enabled;
    elements.enabled.disabled = state.locations.length === 0;
    elements.summary.textContent = active
      ? `${state.enabled ? "已启用" : "未启用"} · ${active.name} · ${active.latitude.toFixed(6)}, ${active.longitude.toFixed(6)}`
      : "尚未登记坐标";
    elements.codeEnabled.checked = state.codeOverrideEnabled;
    if (document.activeElement !== elements.codeOverride) {
      elements.codeOverride.value = state.codeOverride;
    }
    elements.locations.replaceChildren();

    if (state.locations.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "添加一个 WGS-84 坐标后即可启用";
      elements.locations.append(empty);
      return;
    }

    for (const location of state.locations) {
      const card = document.createElement("div");
      card.className = "location-card";
      card.classList.toggle("active", location.id === state.activeLocationId);

      const choice = document.createElement("label");
      choice.className = "location-choice";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "active-location";
      radio.checked = location.id === state.activeLocationId;
      radio.addEventListener("change", () => {
        void save({ ...state, activeLocationId: location.id }, "已切换位置");
      });

      const text = document.createElement("span");
      text.className = "location-text";
      const name = document.createElement("span");
      name.className = "location-name";
      name.textContent = location.name;
      const coordinates = document.createElement("span");
      coordinates.className = "location-coordinates";
      coordinates.textContent = `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)} · ±${location.accuracy}m`;
      text.append(name, coordinates);
      choice.append(radio, text);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "delete-button";
      remove.textContent = "删除";
      remove.setAttribute("aria-label", `删除位置 ${location.name}`);
      remove.addEventListener("click", () => {
        const locations = state.locations.filter(
          (candidate) => candidate.id !== location.id
        );
        const activeLocationId =
          state.activeLocationId === location.id
            ? locations[0]?.id ?? null
            : state.activeLocationId;
        void save(
          { ...state, locations, activeLocationId },
          `已删除 ${location.name}`
        );
      });

      card.append(choice, remove);
      elements.locations.append(card);
    }
  }

  elements.enabled.addEventListener("change", () => {
    void save({ ...state, enabled: elements.enabled.checked }, "设置已保存");
  });

  elements.codeEnabled.addEventListener("change", () => {
    if (!elements.codeEnabled.checked) {
      void save({ ...state, codeOverrideEnabled: false }, "签到码改写已关闭");
      return;
    }

    if (!/^\d{4}$/.test(elements.codeOverride.value.trim())) {
      elements.codeEnabled.checked = false;
      showMessage("启用前请先填写 4 位数字签到码", true);
      return;
    }

    void save(
      {
        ...state,
        codeOverride: elements.codeOverride.value.trim(),
        codeOverrideEnabled: true
      },
      "签到码改写已启用"
    );
  });

  elements.codeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const codeOverride = elements.codeOverride.value.trim();
    if (!/^\d{4}$/.test(codeOverride)) {
      showMessage("签到码必须是 4 位数字", true);
      return;
    }
    void save(
      {
        ...state,
        codeOverride,
        codeOverrideEnabled: elements.codeEnabled.checked
      },
      elements.codeEnabled.checked
        ? "签到码已保存并启用改写"
        : "签到码已保存"
    );
  });

  elements.signNow.addEventListener("click", async () => {
    const code = elements.codeOverride.value.trim();
    if (!/^\d{4}$/.test(code)) {
      showMessage("请先填写 4 位数字签到码", true);
      return;
    }

    elements.signNow.disabled = true;
    try {
      await save({ ...state, codeOverride: code }, "签到码已保存");
      const result = await requestPageSign(code);
      showMessage(result.message || "已触发原页面签到流程");
    } catch (error) {
      showMessage(`无法签到：${error.message}`, true);
    } finally {
      elements.signNow.disabled = false;
    }
  });

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(elements.form);
    const location = SklConfig.normalizeLocation({
      id: createId(),
      name: formData.get("name"),
      latitude: formData.get("latitude"),
      longitude: formData.get("longitude"),
      accuracy: formData.get("accuracy"),
      createdAt: new Date().toISOString()
    });

    if (!location) {
      showMessage("请检查名称、经纬度与精度半径", true);
      return;
    }

    void save(
      {
        ...state,
        locations: [...state.locations, location],
        activeLocationId: state.activeLocationId ?? location.id
      },
      `已保存 ${location.name}`
    );
    elements.form.reset();
    document.querySelector("#accuracy").value = "20";
  });

  elements.configImport.addEventListener("change", async () => {
    const [file] = elements.configImport.files;
    elements.configImport.value = "";
    if (!file) {
      return;
    }

    try {
      const importedValue = JSON.parse(await file.text());
      if (
        importedValue?.schemaVersion !== 1 ||
        !Array.isArray(importedValue.locations)
      ) {
        throw new Error("不是受支持的 SKL 配置文件");
      }
      const importedState = SklConfig.normalizeState({
        ...state,
        ...importedValue,
        codeOverride: state.codeOverride,
        codeOverrideEnabled: state.codeOverrideEnabled
      });
      if (importedState.locations.length !== importedValue.locations.length) {
        throw new Error("配置中存在无效的位置记录");
      }
      await save(importedState, `已导入 ${importedState.locations.length} 个位置`);
    } catch (error) {
      showMessage(`导入失败：${error.message}`, true);
    }
  });

  async function start() {
    const stored = await chrome.storage.local.get();
    state = SklConfig.normalizeState(stored);
    render();
  }

  void start().catch((error) => {
    showMessage(`读取设置失败：${error.message}`, true);
  });
})();
