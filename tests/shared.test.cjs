const test = require("node:test");
const assert = require("node:assert/strict");
const {
  activeConfiguration,
  exportedConfiguration,
  normalizeLocation,
  normalizeState
} = require("../src/shared.js");

test("normalizes a valid WGS-84 location", () => {
  const location = normalizeLocation({
    id: "room-a",
    name: "Room A",
    latitude: "30.123456",
    longitude: "120.654321",
    accuracy: "12"
  });

  assert.equal(location.latitude, 30.123456);
  assert.equal(location.longitude, 120.654321);
  assert.equal(location.accuracy, 12);
  assert.equal(location.crs, "EPSG:4326");
});

test("rejects coordinates outside WGS-84 ranges", () => {
  assert.equal(
    normalizeLocation({
      id: "invalid",
      name: "Invalid",
      latitude: 91,
      longitude: 120,
      accuracy: 10
    }),
    null
  );
});

test("disables the provider when no active location exists", () => {
  const state = normalizeState({ enabled: true, locations: [] });
  assert.equal(state.enabled, false);
  assert.deepEqual(activeConfiguration(state), {
    schemaVersion: 1,
    enabled: false,
    location: null,
    codeOverrideEnabled: false,
    codeOverride: null
  });
});

test("builds the active page configuration", () => {
  const configuration = activeConfiguration({
    enabled: true,
    activeLocationId: "room-a",
    codeOverrideEnabled: true,
    codeOverride: "1234",
    locations: [
      {
        id: "room-a",
        name: "Room A",
        latitude: 30.1,
        longitude: 120.2,
        accuracy: 15
      }
    ]
  });

  assert.deepEqual(configuration, {
    schemaVersion: 1,
    enabled: true,
    location: {
      name: "Room A",
      latitude: 30.1,
      longitude: 120.2,
      accuracy: 15
    },
    codeOverrideEnabled: true,
    codeOverride: "1234"
  });
});

test("disables an invalid code override", () => {
  const state = normalizeState({
    codeOverrideEnabled: true,
    codeOverride: "12ab"
  });

  assert.equal(state.codeOverrideEnabled, false);
  assert.equal(state.codeOverride, "");
});

test("exports location configuration without the transient code", () => {
  const configuration = exportedConfiguration(
    {
      codeOverrideEnabled: true,
      codeOverride: "1234",
      locations: []
    },
    "2026-09-20T00:00:00.000Z"
  );

  assert.equal(configuration.exportedAt, "2026-09-20T00:00:00.000Z");
  assert.equal(Object.hasOwn(configuration, "codeOverride"), false);
  assert.deepEqual(configuration.locations, []);
});
