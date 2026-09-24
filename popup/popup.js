(function initializePopup() {
  "use strict";

  if (new URLSearchParams(window.location.search).get("embedded") === "1") {
    document.body.classList.add("embedded");
  }

  const elements = {
    enabled: document.querySelector("#enabled"),
    summary: document.querySelector("#summary"),
    locations: document.querySelector("#locations"),
    editor: document.querySelector("#location-editor"),
    editorTitle: document.querySelector("#location-editor-title"),
    form: document.querySelector("#location-form"),
    name: document.querySelector("#name"),
    latitude: document.querySelector("#latitude"),
    longitude: document.querySelector("#longitude"),
    accuracy: document.querySelector("#accuracy"),
    saveLocation: document.querySelector("#save-location"),
    cancelLocationEdit: document.querySelector("#cancel-location-edit"),
    codeOverride: document.querySelector("#code-override"),
    signNow: document.querySelector("#sign-now"),
    configExport: document.querySelector("#config-export"),
    configImport: document.querySelector("#config-import"),
    message: document.querySelector("#message")
  };
  let state = SklConfig.normalizeState(null);
  let editingLocationId = null;

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

  function resetLocationEditor(close = false) {
    editingLocationId = null;
    elements.form.reset();
    elements.accuracy.value = "20";
    elements.editorTitle.textContent = "添加位置";
    elements.saveLocation.textContent = "保存位置";
    elements.cancelLocationEdit.hidden = true;
    if (close) {
      elements.editor.open = false;
    }
  }

  function editLocation(location) {
    editingLocationId = location.id;
    elements.name.value = location.name;
    elements.latitude.value = String(location.latitude);
    elements.longitude.value = String(location.longitude);
    elements.accuracy.value = String(location.accuracy);
    elements.editorTitle.textContent = "编辑位置";
    elements.saveLocation.textContent = "保存修改";
    elements.cancelLocationEdit.hidden = false;
    elements.editor.open = true;
    elements.name.focus();
  }

  async function requestPageSign(code) {
    const result = await chrome.runtime.sendMessage({
      type: "skl-plugin:request-sign",
      code
    });
    if (!result?.ok) {
      throw new Error(result?.error || "签到触发失败");
    }
    return result;
  }

  async function exportConfiguration() {
    const result = await chrome.runtime.sendMessage({
      type: "skl-plugin:export-configuration"
    });
    if (!result?.ok) {
      throw new Error(result?.error || "配置导出失败");
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

      const actions = document.createElement("div");
      actions.className = "location-actions";

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "edit-button";
      edit.textContent = "编辑";
      edit.setAttribute("aria-label", `编辑位置 ${location.name}`);
      edit.addEventListener("click", () => editLocation(location));

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
        if (editingLocationId === location.id) {
          resetLocationEditor(true);
        }
      });

      actions.append(edit, remove);
      card.append(choice, actions);
      elements.locations.append(card);
    }
  }

  elements.enabled.addEventListener("change", () => {
    void save({ ...state, enabled: elements.enabled.checked }, "设置已保存");
  });

  elements.codeOverride.addEventListener("input", () => {
    const code = elements.codeOverride.value.replace(/\D/g, "").slice(0, 4);
    if (elements.codeOverride.value !== code) {
      elements.codeOverride.value = code;
    }
    if (/^\d{4}$/.test(code)) {
      void save(
        { ...state, codeOverride: code, codeOverrideEnabled: true },
        "签到码已自动保存并启用改写"
      );
      return;
    }
    if (state.codeOverride || state.codeOverrideEnabled) {
      void save(
        { ...state, codeOverride: "", codeOverrideEnabled: false },
        code
          ? "签到码改写已暂停，输入满 4 位后自动启用"
          : "签到码改写已关闭"
      );
    } else {
      showMessage(code ? "输入满 4 位后自动保存并启用改写" : "");
    }
  });

  elements.signNow.addEventListener("click", async () => {
    const code = elements.codeOverride.value.trim();
    if (!/^\d{4}$/.test(code)) {
      showMessage("请先填写 4 位数字签到码", true);
      return;
    }

    elements.signNow.disabled = true;
    try {
      await save(
        { ...state, codeOverride: code, codeOverrideEnabled: true },
        "签到码已保存并启用改写"
      );
      const result = await requestPageSign(code);
      showMessage(result.message || "已触发原页面签到流程");
    } catch (error) {
      showMessage(`无法签到：${error.message}`, true);
    } finally {
      elements.signNow.disabled = false;
    }
  });

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(elements.form);
    const existingLocation = state.locations.find(
      (candidate) => candidate.id === editingLocationId
    );
    const location = SklConfig.normalizeLocation({
      id: existingLocation?.id ?? createId(),
      name: formData.get("name"),
      latitude: formData.get("latitude"),
      longitude: formData.get("longitude"),
      accuracy: formData.get("accuracy"),
      createdAt: existingLocation?.createdAt ?? new Date().toISOString()
    });

    if (!location) {
      showMessage("请检查名称、经纬度与精度半径", true);
      return;
    }

    const locations = existingLocation
      ? state.locations.map((candidate) =>
          candidate.id === existingLocation.id ? location : candidate
        )
      : [...state.locations, location];
    await save(
      {
        ...state,
        locations,
        activeLocationId: state.activeLocationId ?? location.id
      },
      existingLocation ? `已更新 ${location.name}` : `已保存 ${location.name}`
    );
    resetLocationEditor(existingLocation !== undefined);
  });

  elements.cancelLocationEdit.addEventListener("click", () => {
    resetLocationEditor(true);
    showMessage("已取消编辑");
  });

  elements.configExport.addEventListener("click", async () => {
    elements.configExport.disabled = true;
    try {
      const result = await exportConfiguration();
      showMessage(`已导出到默认下载位置：${result.filename}`);
    } catch (error) {
      showMessage(`导出失败：${error.message}`, true);
    } finally {
      elements.configExport.disabled = false;
    }
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
      resetLocationEditor(true);
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
