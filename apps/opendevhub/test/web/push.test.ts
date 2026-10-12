import { afterEach, describe, expect, it, vi } from "vitest";

import { sendTestNotification, syncPush } from "../../src/web/push";

const endpoint = "https://push.example.com/current";

const setup = (subscribed: boolean) => {
  const key = new Uint8Array([1, 2, 3]);
  const subscription = subscribed
    ? {
        endpoint,
        options: { applicationServerKey: key.buffer },
        toJSON: () => ({ endpoint, keys: { p256dh: "key", auth: "auth" } }),
      }
    : null;
  const registration = {
    pushManager: { getSubscription: vi.fn(async () => subscription) },
  };
  vi.stubGlobal("Notification", { permission: "granted" });
  vi.stubGlobal("PushManager", {});
  vi.stubGlobal("navigator", {
    serviceWorker: {
      getRegistration: vi.fn(async () => registration),
      register: vi.fn(async () => registration),
      ready: Promise.resolve(registration),
    },
  });
  vi.stubGlobal("window", { location: { origin: "http://localhost:7828" } });
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
    Response.json(url === "/api/push/key" ? { publicKey: "AQID" } : { sent: 1 })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => vi.unstubAllGlobals());

describe("browser push", () => {
  it("sends a test only to the current browser subscription", async () => {
    const fetchMock = setup(true);
    await expect(sendTestNotification()).resolves.toBe(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/push/test");
    expect(JSON.parse(String(init?.body))).toStrictEqual({ endpoint });
  });

  it("does not broadcast a test when this browser has no subscription", async () => {
    const fetchMock = setup(false);
    await expect(sendTestNotification()).rejects.toThrow(
      "This browser is not subscribed"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records the address when an existing browser subscription syncs", async () => {
    const fetchMock = setup(true);
    await syncPush();
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/push/subscribe");
    expect(JSON.parse(String(init?.body))).toStrictEqual({
      endpoint,
      keys: { p256dh: "key", auth: "auth" },
      origin: "http://localhost:7828",
    });
  });
});
