const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const { exportedConfiguration } = require("../src/shared.js");

test("exports configuration only after an explicit request", async () => {
  const stored = {
    enabled: true,
    activeLocationId: "room-a",
    locations: [
      {
        id: "room-a",
        name: "Room A",
        latitude: 30.1,
        longitude: 120.2,
        accuracy: 20
      }
    ],
    codeOverrideEnabled: true,
    codeOverride: "1234"
  };
  const downloads = [];
  const storageWrites = [];
  let messageListener;

  const context = vm.createContext({
    importScripts() {},
    SklConfig: { exportedConfiguration },
    chrome: {
      storage: {
        local: {
          async get() {
            return stored;
          },
          async set(value) {
            storageWrites.push(value);
          }
        }
      },
      downloads: {
        async download(options) {
          downloads.push(options);
          return 1;
        }
      },
      runtime: {
        onMessage: {
          addListener(listener) {
            messageListener = listener;
          }
        }
      },
      tabs: {}
    }
  });

  vm.runInContext(
    readFileSync(require.resolve("../src/background.js"), "utf8"),
    context
  );

  assert.equal(downloads.length, 0);
  assert.equal(messageListener({ type: "unrelated" }, null, () => {}), false);
  assert.equal(downloads.length, 0);

  const response = await new Promise((resolve) => {
    assert.equal(
      messageListener(
        { type: "skl-plugin:export-configuration" },
        null,
        resolve
      ),
      true
    );
  });

  assert.equal(response.ok, true);
  assert.equal(response.filename, "skl-plugin-config.json");
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].filename, "skl-plugin-config.json");
  assert.equal(downloads[0].saveAs, false);
  assert.equal(downloads[0].conflictAction, "overwrite");
  const exported = JSON.parse(
    decodeURIComponent(downloads[0].url.split(",", 2)[1])
  );
  assert.equal(Object.hasOwn(exported, "codeOverride"), false);
  assert.equal(storageWrites.at(-1).lastExportError, null);
});
