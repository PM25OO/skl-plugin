(function initializeSklConfig(root) {
  "use strict";

  const DEFAULT_STATE = Object.freeze({
    schemaVersion: 1,
    enabled: false,
    activeLocationId: null,
    locations: []
  });

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function normalizeLocation(value) {
    if (!value || typeof value !== "object") {
      return null;
    }

    const latitude = Number(value.latitude);
    const longitude = Number(value.longitude);
    const accuracy = value.accuracy == null ? 20 : Number(value.accuracy);
    const id = typeof value.id === "string" ? value.id.trim() : "";
    const name = typeof value.name === "string" ? value.name.trim() : "";

    if (
      !id ||
      !name ||
      !isFiniteNumber(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !isFiniteNumber(longitude) ||
      longitude < -180 ||
      longitude > 180 ||
      !isFiniteNumber(accuracy) ||
      accuracy <= 0
    ) {
      return null;
    }

    return {
      id,
      name,
      latitude,
      longitude,
      accuracy,
      crs: "EPSG:4326",
      createdAt:
        typeof value.createdAt === "string"
          ? value.createdAt
          : new Date().toISOString()
    };
  }

  function normalizeState(value) {
    const input = value && typeof value === "object" ? value : {};
    const locations = Array.isArray(input.locations)
      ? input.locations.map(normalizeLocation).filter(Boolean)
      : [];
    const activeLocationId = locations.some(
      (location) => location.id === input.activeLocationId
    )
      ? input.activeLocationId
      : locations[0]?.id ?? null;

    return {
      schemaVersion: 1,
      enabled: Boolean(input.enabled) && activeLocationId !== null,
      activeLocationId,
      locations
    };
  }

  function activeConfiguration(value) {
    const state = normalizeState(value);
    const location = state.locations.find(
      (candidate) => candidate.id === state.activeLocationId
    );

    return {
      schemaVersion: state.schemaVersion,
      enabled: state.enabled && Boolean(location),
      location: location
        ? {
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy
          }
        : null
    };
  }

  const api = Object.freeze({
    DEFAULT_STATE,
    normalizeLocation,
    normalizeState,
    activeConfiguration
  });

  root.SklConfig = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(globalThis);
