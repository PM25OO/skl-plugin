(function installGeolocationProvider() {
  "use strict";

  const CONFIG_EVENT = "skl-plugin:configuration";
  const nativeGeolocation = navigator.geolocation;
  const nativeGetCurrentPosition = nativeGeolocation?.getCurrentPosition?.bind(
    nativeGeolocation
  );
  const nativeWatchPosition = nativeGeolocation?.watchPosition?.bind(
    nativeGeolocation
  );
  const nativeClearWatch = nativeGeolocation?.clearWatch?.bind(nativeGeolocation);

  let configuration = null;
  let nextSyntheticWatchId = 1_000_000;
  const syntheticWatches = new Map();
  const pendingRequests = new Set();

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

  document.addEventListener(CONFIG_EVENT, (event) => {
    configuration = event.detail ?? { enabled: false };
    flushPendingRequests();
  });

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
