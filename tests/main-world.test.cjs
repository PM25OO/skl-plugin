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

  dispatchEvent(event) {
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(event);
    }
  }
}

function createContext() {
  class TestXhr {
    open(method, url) {
      this.method = method;
      this.url = url;
    }
  }

  const document = new TestEventTarget();
  const requests = [];
  const window = {
    location: new URL("https://skl.hdu.edu.cn/#/sign/in"),
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
      getCurrentPosition() {},
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
      TypeError
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

  return { window, requests, TestXhr };
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
