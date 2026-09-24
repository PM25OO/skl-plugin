const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");

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
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(event);
    }
  }
}

class TestDomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = Boolean(init.bubbles);
    this.cancelable = Boolean(init.cancelable);
  }

  preventDefault() {}
}

function createTestKey(textContent, press) {
  let touching = false;
  const wrapper = {
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 40, height: 40 };
    },
    dispatchEvent(event) {
      if (event.type === "touchstart") {
        touching = true;
      } else if (event.type === "touchend" && touching) {
        touching = false;
        press();
      }
    }
  };
  return {
    textContent,
    closest(selector) {
      return selector === ".van-key__wrapper" ? wrapper : null;
    }
  };
}

function createContext(nativePosition = null) {
  class TestXhr {
    open(method, url) {
      this.method = method;
      this.url = url;
    }
  }

  const document = new TestEventTarget();
  document.querySelectorAll = () => [];
  document.getElementById = () => null;
  const requests = [];
  const window = {
    location: new URL("https://skl.hdu.edu.cn/#/sign/in"),
    addEventListener() {},
    Event: TestDomEvent,
    XMLHttpRequest: TestXhr,
    fetch(input) {
      requests.push(input);
      return Promise.resolve({ ok: true });
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  };
  const navigator = {
    geolocation: {
      getCurrentPosition(success) {
        if (nativePosition) {
          setTimeout(() => success(nativePosition), 0);
        }
      },
      watchPosition() {
        return 1;
      },
      clearWatch() {}
    }
  };

  runInNewContext(
    readFileSync(join(__dirname, "../src/main-world.js"), "utf8"),
    {
      window,
      document,
      navigator,
      XMLHttpRequest: TestXhr,
      Request,
      URL,
      Map,
      Number,
      Object,
      Reflect,
      TypeError,
      Error,
      CustomEvent: class CustomEvent {
        constructor(type, init = {}) {
          this.type = type;
          this.detail = init.detail;
        }
      }
    }
  );

  document.dispatchEvent({
    type: "skl-plugin:configuration",
    detail: {
      schemaVersion: 1,
      enabled: false,
      location: null,
      codeOverrideEnabled: true,
      codeOverride: "1234"
    }
  });

  return { window, document, navigator, requests, TestXhr };
}

test("rewrites the code query field on the sign endpoint", () => {
  const { TestXhr } = createContext();
  const request = new TestXhr();
  request.open(
    "POST",
    "https://skl.hdu.edu.cn/api/ali-nvc/captcha-verify?userid=1&code=0000"
  );

  assert.equal(new URL(request.url).searchParams.get("code"), "1234");
});

test("does not rewrite code fields on unrelated endpoints", () => {
  const { TestXhr } = createContext();
  const request = new TestXhr();
  request.open(
    "GET",
    "https://skl.hdu.edu.cn/api/checkIn/valid-code?code=0000"
  );

  assert.equal(new URL(request.url).searchParams.get("code"), "0000");
});

test("rewrites fetch URLs on the sign endpoint", async () => {
  const { window, requests } = createContext();
  await window.fetch(
    "https://skl.hdu.edu.cn/api/ali-nvc/captcha-verify?code=0000"
  );

  assert.equal(new URL(requests[0]).searchParams.get("code"), "1234");
});

test("uses the newly selected location in later sign requests without reload", () => {
  const { document, TestXhr } = createContext();
  const signUrl =
    "https://skl.hdu.edu.cn/api/ali-nvc/captcha-verify?code=0000&latitude=30.1&longitude=120.1";

  document.dispatchEvent({
    type: "skl-plugin:configuration",
    detail: {
      schemaVersion: 1,
      enabled: true,
      location: {
        name: "Room A",
        latitude: 30.1234567,
        longitude: 120.7654321,
        accuracy: 20
      },
      codeOverrideEnabled: false,
      codeOverride: null
    }
  });
  const first = new TestXhr();
  first.open("POST", signUrl);
  assert.equal(new URL(first.url).searchParams.get("latitude"), "30.1234567");
  assert.equal(new URL(first.url).searchParams.get("longitude"), "120.7654321");
  assert.equal(new URL(first.url).searchParams.get("code"), "0000");

  document.dispatchEvent({
    type: "skl-plugin:configuration",
    detail: {
      schemaVersion: 1,
      enabled: true,
      location: {
        name: "Room B",
        latitude: 30.2222222,
        longitude: 120.3333333,
        accuracy: 10
      },
      codeOverrideEnabled: true,
      codeOverride: "9876"
    }
  });
  const second = new TestXhr();
  second.open("POST", signUrl);
  assert.equal(new URL(second.url).searchParams.get("latitude"), "30.2222222");
  assert.equal(new URL(second.url).searchParams.get("longitude"), "120.3333333");
  assert.equal(new URL(second.url).searchParams.get("code"), "9876");

  document.dispatchEvent({
    type: "skl-plugin:configuration",
    detail: {
      schemaVersion: 1,
      enabled: false,
      location: null,
      codeOverrideEnabled: false,
      codeOverride: null
    }
  });
  const disabled = new TestXhr();
  disabled.open("POST", signUrl);
  assert.equal(disabled.url, signUrl);
});

test("does not rewrite coordinates on unrelated endpoints", () => {
  const { document, TestXhr } = createContext();
  document.dispatchEvent({
    type: "skl-plugin:configuration",
    detail: {
      schemaVersion: 1,
      enabled: true,
      location: {
        name: "Room A",
        latitude: 30.2,
        longitude: 120.3,
        accuracy: 20
      },
      codeOverrideEnabled: false,
      codeOverride: null
    }
  });
  const url =
    "https://skl.hdu.edu.cn/api/checkIn/valid-code?latitude=1&longitude=2";
  const request = new TestXhr();
  request.open("GET", url);

  assert.equal(request.url, url);
});

test("rewrites fetch coordinates on the sign endpoint", async () => {
  const { document, window, requests } = createContext();
  document.dispatchEvent({
    type: "skl-plugin:configuration",
    detail: {
      schemaVersion: 1,
      enabled: true,
      location: {
        name: "Room A",
        latitude: 30.2,
        longitude: 120.3,
        accuracy: 20
      },
      codeOverrideEnabled: false,
      codeOverride: null
    }
  });
  await window.fetch(
    "https://skl.hdu.edu.cn/api/ali-nvc/captcha-verify?latitude=1&longitude=2"
  );

  assert.equal(new URL(requests[0]).searchParams.get("latitude"), "30.2");
  assert.equal(new URL(requests[0]).searchParams.get("longitude"), "120.3");
});

test("refreshes the sign page geolocation callback when a profile changes", async () => {
  const { document, navigator } = createContext();
  const received = [];
  navigator.geolocation.getCurrentPosition((position) => {
    received.push([
      position.coords.latitude,
      position.coords.longitude
    ]);
  });

  const firstLocation = {
    name: "Room A",
    latitude: 30.1,
    longitude: 120.2,
    accuracy: 20
  };
  document.dispatchEvent({
    type: "skl-plugin:configuration",
    detail: {
      schemaVersion: 1,
      enabled: true,
      location: firstLocation,
      codeOverrideEnabled: false,
      codeOverride: null
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(received, [[30.1, 120.2]]);

  document.dispatchEvent({
    type: "skl-plugin:configuration",
    detail: {
      schemaVersion: 1,
      enabled: true,
      location: {
        name: "Room B",
        latitude: 30.3,
        longitude: 120.4,
        accuracy: 20
      },
      codeOverrideEnabled: false,
      codeOverride: null
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(received, [[30.1, 120.2], [30.3, 120.4]]);
});

test("returns to native geolocation after the location override is disabled", async () => {
  const nativePosition = {
    coords: { latitude: 31.5, longitude: 121.5 }
  };
  const { document, navigator } = createContext(nativePosition);
  document.dispatchEvent({
    type: "skl-plugin:configuration",
    detail: {
      schemaVersion: 1,
      enabled: true,
      location: {
        name: "Room A",
        latitude: 30.1,
        longitude: 120.2,
        accuracy: 20
      },
      codeOverrideEnabled: false,
      codeOverride: null
    }
  });
  const received = [];
  navigator.geolocation.getCurrentPosition((position) => {
    received.push([position.coords.latitude, position.coords.longitude]);
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(received, [[30.1, 120.2]]);

  document.dispatchEvent({
    type: "skl-plugin:configuration",
    detail: {
      schemaVersion: 1,
      enabled: false,
      location: null,
      codeOverrideEnabled: false,
      codeOverride: null
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(received, [[30.1, 120.2], [31.5, 121.5]]);
});

test("uses the page NumberKeyboard touch sequence and verifies the captcha trigger", () => {
  const { document } = createContext();
  const actions = [];
  let value = "";
  const trigger = new TestEventTarget();
  const deleteKey = createTestKey("", () => {
    actions.push("delete");
    value = value.slice(0, -1);
  });
  const digitKeys = [..."0123456789"].map((digit) =>
    createTestKey(digit, () => {
      actions.push(digit);
      value = (value + digit).slice(0, 4);
      if (value.length === 4) {
        trigger.dispatchEvent({ type: "click" });
      }
    })
  );
  const keyboard = {
    querySelector(selector) {
      return selector === ".van-key--delete" ? deleteKey : null;
    },
    querySelectorAll(selector) {
      return selector === ".van-key" ? digitKeys : [];
    }
  };
  document.querySelectorAll = () => [keyboard];
  document.getElementById = () => trigger;

  let result;
  document.addEventListener("skl-plugin:sign-result", (event) => {
    result = event.detail;
  });
  document.dispatchEvent({
    type: "skl-plugin:sign-request",
    detail: { requestId: "request-1", code: "1203" }
  });

  assert.deepEqual(actions, [
    "delete",
    "delete",
    "delete",
    "delete",
    "1",
    "2",
    "0",
    "3"
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.requestId, "request-1");
});

test("does not claim success when the page never triggers verification", () => {
  const { document } = createContext();
  const trigger = new TestEventTarget();
  const deleteKey = createTestKey("", () => {});
  const digitKeys = [..."0123456789"].map((digit) =>
    createTestKey(digit, () => {})
  );
  const keyboard = {
    querySelector(selector) {
      return selector === ".van-key--delete" ? deleteKey : null;
    },
    querySelectorAll(selector) {
      return selector === ".van-key" ? digitKeys : [];
    }
  };
  document.querySelectorAll = () => [keyboard];
  document.getElementById = () => trigger;

  let result;
  document.addEventListener("skl-plugin:sign-result", (event) => {
    result = event.detail;
  });
  document.dispatchEvent({
    type: "skl-plugin:sign-request",
    detail: { requestId: "request-2", code: "5678" }
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /未触发签到验证/);
});
