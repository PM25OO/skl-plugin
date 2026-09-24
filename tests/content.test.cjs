const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const { activeConfiguration } = require("../src/shared.js");

class TestText {
  constructor(value) {
    this.nodeType = 3;
    this.nodeValue = value;
    this.parent = null;
  }
}

class TestElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.parent = null;
    this.classes = new Set();
    this.classList = {
      add: (value) => this.classes.add(value),
      remove: (value) => this.classes.delete(value),
      contains: (value) => this.classes.has(value)
    };
  }

  set className(value) {
    this.classes = new Set(value.split(/\s+/).filter(Boolean));
  }

  get firstChild() {
    return this.children[0] ?? null;
  }

  get textContent() {
    return this.children
      .map((child) =>
        child.nodeType === 3 ? child.nodeValue : child.textContent
      )
      .join("");
  }

  set textContent(value) {
    this.children = [new TestText(value)];
  }

  append(child) {
    child.parent = this;
    this.children.push(child);
  }

  prepend(child) {
    child.parent = this;
    this.children.unshift(child);
  }

  remove() {
    if (this.parent) {
      this.parent.children = this.parent.children.filter(
        (child) => child !== this
      );
      this.parent = null;
    }
  }

  cloneNode() {
    const clone = new TestElement(this.tagName);
    clone.className = [...this.classes].join(" ");
    return clone;
  }

  querySelectorAll(selector) {
    if (!selector.startsWith(":scope > ")) {
      throw new Error(`Unexpected selector: ${selector}`);
    }
    const childSelector = selector.slice(9);
    return this.children.filter((child) => {
      if (child.nodeType === 3) {
        return false;
      }
      if (childSelector === ".tip-item.location") {
        return child.classes.has("tip-item") && child.classes.has("location");
      }
      if (childSelector === ".skl-plugin-created-location") {
        return child.classes.has("skl-plugin-created-location");
      }
      if (childSelector === "span:not(.skl-plugin-current-location)") {
        return (
          child.tagName === "span" &&
          !child.classes.has("skl-plugin-current-location")
        );
      }
      return child.classes.has(childSelector.slice(1));
    });
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

function createPage(withNativeLocation = true) {
  const container = new TestElement("div");
  container.className = "sign-tips";
  const nativeItem = new TestElement("div");
  nativeItem.className = "tip-item location";
  const nativeText = new TestElement("span");
  nativeText.textContent = "当前位置: 30.000000, 120.000000";
  nativeItem.append(nativeText);
  if (withNativeLocation) {
    container.append(nativeItem);
  }

  const document = {
    querySelectorAll(selector) {
      if (selector === ".sign-page .sign-tips") {
        return [container];
      }
      if (selector.startsWith(".skl-plugin-")) {
        const classes = selector.split(", ").map((part) => part.slice(1));
        const result = [];
        const visit = (element) => {
          if (classes.some((name) => element.classes.has(name))) {
            result.push(element);
          }
          for (const child of element.children) {
            if (child.nodeType !== 3) {
              visit(child);
            }
          }
        };
        visit(container);
        return result;
      }
      throw new Error(`Unexpected selector: ${selector}`);
    },
    createElement: (tagName) => new TestElement(tagName),
    createTextNode: (value) => new TestText(value),
    dispatchEvent() {}
  };
  return { document, container, nativeItem, nativeText };
}

test("updates current location and registered name after switching profiles", async () => {
  const { document, nativeItem, nativeText } = createPage();
  const locations = [
    { id: "a", name: "Room A", latitude: 30.111111, longitude: 120.222222 },
    { id: "b", name: "Room B", latitude: 30.333333, longitude: 120.444444 }
  ];
  let stored = {
    enabled: true,
    activeLocationId: "a",
    locations
  };
  let storageChanged;
  const chrome = {
    storage: {
      local: { get: async () => stored },
      onChanged: { addListener: (listener) => (storageChanged = listener) }
    }
  };
  const window = { requestAnimationFrame: (callback) => callback() };

  runInNewContext(
    readFileSync(join(__dirname, "../src/content.js"), "utf8"),
    {
      document,
      window,
      chrome,
      Node: { TEXT_NODE: 3 },
      SklConfig: { activeConfiguration },
      CustomEvent: class CustomEvent {
        constructor(type, init) {
          this.type = type;
          this.detail = init.detail;
        }
      },
      MutationObserver: class MutationObserver {
        observe() {}
      }
    }
  );
  await new Promise(setImmediate);
  let live = nativeItem.querySelector(":scope > .skl-plugin-current-location");
  assert.ok(live);
  assert.equal(
    live.classList.contains("skl-plugin-native-location-hidden"),
    false
  );
  assert.equal(live.textContent, "当前位置: 30.111111, 120.222222· Room A");
  assert.equal(
    nativeText.classList.contains("skl-plugin-native-location-hidden"),
    true
  );

  stored = { ...stored, activeLocationId: "b" };
  storageChanged({ activeLocationId: {} }, "local");
  await new Promise(setImmediate);
  live = nativeItem.querySelector(":scope > .skl-plugin-current-location");
  assert.equal(live.textContent, "当前位置: 30.333333, 120.444444· Room B");

  stored = { ...stored, enabled: false };
  storageChanged({ enabled: {} }, "local");
  await new Promise(setImmediate);
  assert.equal(
    nativeItem.querySelector(":scope > .skl-plugin-current-location"),
    null
  );
  assert.equal(
    nativeText.classList.contains("skl-plugin-native-location-hidden"),
    false
  );
});

test("shows the selected location before the page renders its own coordinates", async () => {
  const { document, container } = createPage(false);
  const chrome = {
    storage: {
      local: {
        get: async () => ({
          enabled: true,
          activeLocationId: "a",
          locations: [
            {
              id: "a",
              name: "Room A",
              latitude: 30.1,
              longitude: 120.2
            }
          ]
        })
      },
      onChanged: { addListener() {} }
    }
  };
  runInNewContext(
    readFileSync(join(__dirname, "../src/content.js"), "utf8"),
    {
      document,
      chrome,
      window: { requestAnimationFrame: (callback) => callback() },
      Node: { TEXT_NODE: 3 },
      SklConfig: { activeConfiguration },
      CustomEvent: class CustomEvent {
        constructor(type, init) {
          this.type = type;
          this.detail = init.detail;
        }
      },
      MutationObserver: class MutationObserver {
        observe() {}
      }
    }
  );
  await new Promise(setImmediate);

  const created = container.querySelector(
    ":scope > .skl-plugin-created-location"
  );
  assert.ok(created);
  assert.equal(
    created.querySelector(":scope > .skl-plugin-current-location").textContent,
    "当前位置: 30.100000, 120.200000· Room A"
  );
});
