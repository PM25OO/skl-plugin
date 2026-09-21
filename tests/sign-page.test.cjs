const test = require("node:test");
const assert = require("node:assert/strict");
const { simulatePageSign } = require("../src/sign-page.js");

function visibleElement(properties = {}) {
  return {
    textContent: "",
    click() {},
    dispatchEvent() {},
    getClientRects() {
      return [{}];
    },
    ...properties
  };
}

test("activates the Vant keyboard, clears it, and clicks four digits", async () => {
  const actions = [];
  const keys = [..."0123456789"].map((digit) =>
    visibleElement({
      textContent: digit,
      click() {
        actions.push(digit);
      }
    })
  );
  const deleteKey = visibleElement({
    click() {
      actions.push("delete");
    }
  });
  const keyboard = visibleElement({
    querySelector() {
      return deleteKey;
    },
    querySelectorAll() {
      return keys;
    }
  });
  const passwordInput = visibleElement({
    dispatchEvent(event) {
      actions.push(event.type);
    },
    click() {
      actions.push("click");
    }
  });
  const documentObject = {
    querySelector() {
      return passwordInput;
    },
    querySelectorAll() {
      return [keyboard];
    }
  };
  class TestEvent {
    constructor(type) {
      this.type = type;
    }
  }
  const windowObject = {
    location: { hash: "#/sign/in" },
    Event: TestEvent,
    PointerEvent: TestEvent,
    getComputedStyle() {
      return { display: "block", visibility: "visible" };
    },
    setTimeout(callback) {
      callback();
      return 1;
    }
  };

  const result = await simulatePageSign("1203", documentObject, windowObject);

  assert.equal(result.ok, true);
  assert.deepEqual(actions, [
    "touchstart",
    "pointerdown",
    "click",
    "delete",
    "delete",
    "delete",
    "delete",
    "1",
    "2",
    "0",
    "3"
  ]);
});
