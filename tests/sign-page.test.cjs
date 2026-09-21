const test = require("node:test");
const assert = require("node:assert/strict");
const { simulatePageSign } = require("../src/sign-page.js");

class TestEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      listeners.filter((item) => item !== listener)
    );
  }

  dispatchEvent(event) {
    for (const listener of [...(this.listeners.get(event.type) ?? [])]) {
      listener(event);
    }
  }
}

class TestCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

function createWindow() {
  return {
    location: { hash: "#/sign/in" },
    CustomEvent: TestCustomEvent,
    setTimeout,
    clearTimeout
  };
}

test("forwards the sign code to the main page and returns verified success", async () => {
  const documentObject = new TestEventTarget();
  documentObject.addEventListener("skl-plugin:sign-request", (event) => {
    documentObject.dispatchEvent(
      new TestCustomEvent("skl-plugin:sign-result", {
        detail: {
          requestId: event.detail.requestId,
          ok: true,
          message: "verification triggered"
        }
      })
    );
  });

  const result = await simulatePageSign(
    "1203",
    documentObject,
    createWindow()
  );

  assert.deepEqual(result, { ok: true, message: "verification triggered" });
});

test("reports the failure returned by the main page", async () => {
  const documentObject = new TestEventTarget();
  documentObject.addEventListener("skl-plugin:sign-request", (event) => {
    documentObject.dispatchEvent(
      new TestCustomEvent("skl-plugin:sign-result", {
        detail: {
          requestId: event.detail.requestId,
          ok: false,
          error: "location is not ready"
        }
      })
    );
  });

  await assert.rejects(
    simulatePageSign("1357", documentObject, createWindow()),
    /location is not ready/
  );
});

test("ignores a result belonging to another sign request", async () => {
  const documentObject = new TestEventTarget();
  documentObject.addEventListener("skl-plugin:sign-request", (event) => {
    documentObject.dispatchEvent(
      new TestCustomEvent("skl-plugin:sign-result", {
        detail: { requestId: "another-request", ok: true }
      })
    );
    documentObject.dispatchEvent(
      new TestCustomEvent("skl-plugin:sign-result", {
        detail: {
          requestId: event.detail.requestId,
          ok: true,
          message: "correct response"
        }
      })
    );
  });

  const result = await simulatePageSign(
    "9876",
    documentObject,
    createWindow()
  );

  assert.equal(result.message, "correct response");
});
