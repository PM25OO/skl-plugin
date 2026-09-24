(function installGeolocationProvider() {
  "use strict";

  const CONFIG_EVENT = "skl-plugin:configuration";
  const SIGN_REQUEST_EVENT = "skl-plugin:sign-request";
  const SIGN_RESULT_EVENT = "skl-plugin:sign-result";
  const nativeGeolocation = navigator.geolocation;
  const nativeGetCurrentPosition = nativeGeolocation?.getCurrentPosition?.bind(
    nativeGeolocation
  );
  const nativeWatchPosition = nativeGeolocation?.watchPosition?.bind(
    nativeGeolocation
  );
  const nativeClearWatch = nativeGeolocation?.clearWatch?.bind(nativeGeolocation);
  const nativeFetch = window.fetch?.bind(window);
  const nativeXhrOpen = window.XMLHttpRequest?.prototype.open;
  const SIGN_ENDPOINT = "/api/ali-nvc/captcha-verify";

  let configuration = null;
  let nextSyntheticWatchId = 1_000_000;
  const syntheticWatches = new Map();
  const pendingRequests = new Set();
  let signPositionRequest = null;
  let signPositionGeneration = 0;

  function isSignPage() {
    return window.location.hash.startsWith("#/sign/in");
  }

  function createKeyTouchEvent(type, touch) {
    const event = new window.Event(type, {
      bubbles: true,
      cancelable: true
    });
    const activeTouches = type === "touchend" ? [] : [touch];
    Object.defineProperties(event, {
      touches: { value: activeTouches },
      targetTouches: { value: activeTouches },
      changedTouches: { value: [touch] }
    });
    return event;
  }

  function pressPageKey(key) {
    const wrapper = key?.closest?.(".van-key__wrapper");
    if (!wrapper) {
      throw new Error("原页面数字键结构已变更");
    }
    const rect = wrapper.getBoundingClientRect();
    const touch = {
      identifier: Date.now(),
      target: wrapper,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    };
    wrapper.dispatchEvent(createKeyTouchEvent("touchstart", touch));
    wrapper.dispatchEvent(createKeyTouchEvent("touchend", touch));
  }

  function pageKeyboard() {
    const keyboards = [...document.querySelectorAll(".van-number-keyboard")];
    const keyboard = keyboards.at(-1);
    if (!keyboard) {
      throw new Error("未找到原页面数字键盘组件");
    }
    return keyboard;
  }

  function submitCodeThroughPage(code) {
    if (!isSignPage()) {
      throw new Error("当前不是签到页面");
    }
    if (!/^\d{4}$/.test(code)) {
      throw new Error("签到码必须是 4 位数字");
    }

    const trigger = document.getElementById("captcha-trigger-btn");
    if (!trigger) {
      throw new Error("原页面验证入口尚未准备好");
    }
    const keyboard = pageKeyboard();
    const deleteKey = keyboard.querySelector(".van-key--delete");
    const digitKeys = [...keyboard.querySelectorAll(".van-key")];
    if (!deleteKey) {
      throw new Error("未找到原页面删除键");
    }
    let verificationTriggered = false;
    const markTriggered = () => {
      verificationTriggered = true;
    };
    trigger.addEventListener("click", markTriggered, true);
    try {
      for (let index = 0; index < 4; index += 1) {
        pressPageKey(deleteKey);
      }
      for (const digit of code) {
        const key = digitKeys.find(
          (candidate) => candidate.textContent?.trim() === digit
        );
        if (!key) {
          throw new Error(`未找到原页面数字键 ${digit}`);
        }
        pressPageKey(key);
      }
    } finally {
      trigger.removeEventListener("click", markTriggered, true);
    }

    if (!verificationTriggered) {
      throw new Error(
        "网页未触发签到验证，请确认定位已准备完成"
      );
    }
    return {
      ok: true,
      message: "签到码已交给原页面，并已触发验证入口"
    };
  }

  document.addEventListener(SIGN_REQUEST_EVENT, (event) => {
    const requestId = String(event.detail?.requestId ?? "");
    if (!requestId) {
      return;
    }
    let result;
    try {
      result = submitCodeThroughPage(String(event.detail?.code ?? ""));
    } catch (error) {
      result = {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
    document.dispatchEvent(
      new CustomEvent(SIGN_RESULT_EVENT, {
        detail: { requestId, ...result }
      })
    );
  });

  function validConfiguration(value) {
    const location = value?.location;
    return Boolean(
      value?.schemaVersion === 1 &&
        value.enabled &&
        location &&
        Number.isFinite(location.latitude) &&
        location.latitude >= -90 &&
        location.latitude <= 90 &&
        Number.isFinite(location.longitude) &&
        location.longitude >= -180 &&
        location.longitude <= 180 &&
        Number.isFinite(location.accuracy) &&
        location.accuracy > 0
    );
  }

  function validCodeConfiguration(value) {
    return Boolean(
      value?.schemaVersion === 1 &&
        value.codeOverrideEnabled &&
        /^\d{4}$/.test(value.codeOverride)
    );
  }

  function rewriteRequestUrl(value) {
    const rewriteCode = validCodeConfiguration(configuration);
    const rewriteLocation = validConfiguration(configuration);
    if (!rewriteCode && !rewriteLocation) {
      return value;
    }

    try {
      const url = new URL(String(value), window.location.href);
      if (
        url.origin !== window.location.origin ||
        url.pathname !== SIGN_ENDPOINT
      ) {
        return value;
      }
      let changed = false;
      if (rewriteCode && url.searchParams.has("code")) {
        url.searchParams.set("code", configuration.codeOverride);
        changed = true;
      }
      if (
        rewriteLocation &&
        url.searchParams.has("latitude") &&
        url.searchParams.has("longitude")
      ) {
        url.searchParams.set(
          "latitude",
          String(configuration.location.latitude)
        );
        url.searchParams.set(
          "longitude",
          String(configuration.location.longitude)
        );
        changed = true;
      }
      if (!changed) {
        return value;
      }
      return url.href;
    } catch {
      return value;
    }
  }

  function syntheticPosition() {
    const { latitude, longitude, accuracy } = configuration.location;
    return Object.freeze({
      coords: Object.freeze({
        latitude,
        longitude,
        accuracy,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null
      }),
      timestamp: Date.now()
    });
  }

  function callSoon(callback, value) {
    window.setTimeout(() => callback(value), 0);
  }

  function useNativeGet(success, error, options) {
    if (nativeGetCurrentPosition) {
      nativeGetCurrentPosition(success, error, options);
      return;
    }

    if (typeof error === "function") {
      callSoon(error, {
        code: 2,
        message: "Geolocation is unavailable"
      });
    }
  }

  function getCurrentPosition(success, error, options) {
    if (typeof success !== "function") {
      throw new TypeError("The success callback must be a function");
    }
    if (isSignPage()) {
      // The sign page reads geolocation once and stores it in Vue refs.
      // Keep only that page's callback so profile switches refresh its refs.
      signPositionRequest = { success, error, options };
    }

    if (configuration !== null) {
      if (validConfiguration(configuration)) {
        callSoon(success, syntheticPosition());
      } else {
        useNativeGet(success, error, options);
      }
      return;
    }

    const request = { success, error, options, timer: null };
    request.timer = window.setTimeout(() => {
      pendingRequests.delete(request);
      useNativeGet(success, error, options);
    }, 1_500);
    pendingRequests.add(request);
  }

  function watchPosition(success, error, options) {
    if (!validConfiguration(configuration)) {
      return nativeWatchPosition
        ? nativeWatchPosition(success, error, options)
        : 0;
    }

    const watchId = nextSyntheticWatchId++;
    const timer = window.setInterval(
      () => success(syntheticPosition()),
      Math.max(1_000, Number(options?.maximumAge) || 1_000)
    );
    syntheticWatches.set(watchId, timer);
    callSoon(success, syntheticPosition());
    return watchId;
  }

  function clearWatch(watchId) {
    const timer = syntheticWatches.get(watchId);
    if (timer !== undefined) {
      window.clearInterval(timer);
      syntheticWatches.delete(watchId);
      return;
    }
    nativeClearWatch?.(watchId);
  }

  function flushPendingRequests() {
    for (const request of pendingRequests) {
      window.clearTimeout(request.timer);
      if (validConfiguration(configuration)) {
        callSoon(request.success, syntheticPosition());
      } else {
        useNativeGet(request.success, request.error, request.options);
      }
    }
    pendingRequests.clear();
  }

  function positionKey(value) {
    if (!validConfiguration(value)) {
      return null;
    }
    const { latitude, longitude, accuracy } = value.location;
    return `${latitude}|${longitude}|${accuracy}`;
  }

  function refreshSignPagePosition() {
    const request = signPositionRequest;
    if (!request || !isSignPage()) {
      return;
    }
    const generation = ++signPositionGeneration;
    const stillCurrent = () =>
      generation === signPositionGeneration &&
      signPositionRequest === request &&
      isSignPage();
    if (validConfiguration(configuration)) {
      window.setTimeout(() => {
        if (stillCurrent()) {
          request.success(syntheticPosition());
        }
      }, 0);
    } else {
      useNativeGet(
        (position) => {
          if (stillCurrent()) {
            request.success(position);
          }
        },
        (error) => {
          if (stillCurrent()) {
            request.error?.(error);
          }
        },
        request.options
      );
    }
  }

  document.addEventListener(CONFIG_EVENT, (event) => {
    const previousConfiguration = configuration;
    configuration = event.detail ?? { enabled: false };
    flushPendingRequests();
    if (
      previousConfiguration !== null &&
      positionKey(previousConfiguration) !== positionKey(configuration)
    ) {
      refreshSignPagePosition();
    }
  });
  window.addEventListener("hashchange", () => {
    if (!isSignPage()) {
      signPositionRequest = null;
      signPositionGeneration += 1;
    }
  });

  if (nativeFetch) {
    window.fetch = function interceptedFetch(input, init) {
      if (input instanceof Request) {
        const rewrittenUrl = rewriteRequestUrl(input.url);
        const request =
          rewrittenUrl === input.url ? input : new Request(rewrittenUrl, input);
        return nativeFetch(request, init);
      }
      return nativeFetch(rewriteRequestUrl(input), init);
    };
  }

  if (nativeXhrOpen) {
    window.XMLHttpRequest.prototype.open = function interceptedOpen(
      method,
      url,
      ...rest
    ) {
      return Reflect.apply(nativeXhrOpen, this, [
        method,
        rewriteRequestUrl(url),
        ...rest
      ]);
    };
  }

  const provider = Object.freeze({
    getCurrentPosition,
    watchPosition,
    clearWatch
  });

  try {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      enumerable: true,
      get: () => provider
    });
  } catch {
    if (nativeGeolocation) {
      nativeGeolocation.getCurrentPosition = getCurrentPosition;
      nativeGeolocation.watchPosition = watchPosition;
      nativeGeolocation.clearWatch = clearWatch;
    }
  }
})();
