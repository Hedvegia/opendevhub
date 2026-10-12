import { SendIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import { Note } from "../../components/page";
import { useDash } from "../../dashboard-context";
import {
  currentPushEndpoint,
  disablePush,
  pushEnabled,
  removePushBrowser,
  sendTestNotification,
  subscribedBrowsers,
} from "../../push";
import { SettingRow, SettingsBlock, SettingsHeader } from "./settings-layout";

const PermissionNote = ({ permission }: { permission: string }) => {
  if (permission === "unsupported") {
    return (
      <Note warn>
        This browser can&apos;t receive push notifications here. They need a
        secure page (localhost or HTTPS) and a browser with service workers.
      </Note>
    );
  }
  if (permission === "denied") {
    return (
      <Note warn>
        Notifications are blocked for this site. Allow them in your
        browser&apos;s site settings, then reload the page.
      </Note>
    );
  }
  return null;
};

export const NotificationSettings = () => {
  const { permission, requestPermission } = useDash();
  const [enabled, setEnabled] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<string>();
  const [browsers, setBrowsers] = useState<
    Awaited<ReturnType<typeof subscribedBrowsers>>
  >([]);
  const [currentEndpoint, setCurrentEndpoint] = useState<string>();

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const [subscriptions, endpoint] = await Promise.all([
          subscribedBrowsers(),
          currentPushEndpoint(),
        ]);
        if (live) {
          setBrowsers(subscriptions);
          setCurrentEndpoint(endpoint);
        }
      } catch (err) {
        if (live) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };
    void load();
    return () => {
      live = false;
    };
  }, [enabled]);

  const removeBrowser = async (endpoint: string) => {
    setBusy(true);
    setError(undefined);
    setResult(undefined);
    try {
      if (endpoint === currentEndpoint) {
        await disablePush();
        setEnabled(false);
      } else {
        await removePushBrowser(endpoint);
      }
      setBrowsers(await subscribedBrowsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let live = true;
    pushEnabled().then(
      (value) => live && setEnabled(value),
      () => live && setEnabled(false)
    );
    return () => {
      live = false;
    };
  }, [permission]);

  const toggle = async (on: boolean) => {
    setBusy(true);
    setError(undefined);
    setResult(undefined);
    try {
      if (on) {
        await requestPermission();
      } else {
        await disablePush();
      }
      setEnabled(await pushEnabled());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setError(undefined);
    setResult(undefined);
    try {
      const sent = await sendTestNotification();
      setResult(
        sent === 0
          ? "This browser is no longer subscribed. Turn notifications off and on to reconnect."
          : "Sent to this browser."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const blocked = permission === "unsupported" || permission === "denied";

  return (
    <>
      <SettingsHeader
        title="Notifications"
        description="Hear about conversations that need you, even with no opendevhub tab open."
      />
      <SettingsBlock
        title="Browser notifications"
        hint="opendevhub notifies you when an agent asks for permission, asks a question, or finishes. Each browser opts in on its own."
      >
        <SettingRow
          label="Enable notifications"
          description="Subscribes this browser to opendevhub's push notifications."
          htmlFor="notifications-enabled"
        >
          <Switch
            id="notifications-enabled"
            checked={enabled ?? false}
            disabled={busy || blocked || enabled === undefined}
            onCheckedChange={(on) => void toggle(on)}
          />
        </SettingRow>
        <PermissionNote permission={permission} />
      </SettingsBlock>
      <SettingsBlock
        title="Subscribed browsers"
        hint="Subscriptions survive when a server stops. Remove old addresses to stop duplicate notifications. Older subscriptions may have no saved address."
      >
        {browsers.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No browsers are subscribed.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {browsers.map(({ endpoint, origin }) => (
              <li
                key={endpoint}
                className="flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium break-all">
                    {origin ?? "Unknown address (older subscription)"}
                  </p>
                  {endpoint === currentEndpoint && (
                    <p className="text-muted-foreground text-sm">
                      This browser
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void removeBrowser(endpoint)}
                  aria-label={`Remove notifications for ${origin ?? "unknown address"}${endpoint === currentEndpoint ? " (this browser)" : ""}`}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SettingsBlock>
      <SettingsBlock
        title="Test"
        hint="Sends a notification to this browser, so you can check it arrives."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={busy || !enabled}
            onClick={() => void test()}
          >
            <SendIcon /> Send test notification
          </Button>
          {result && (
            <p role="status" className="text-muted-foreground text-sm">
              {result}
            </p>
          )}
        </div>
        {error && (
          <div role="alert">
            <Note error>{error}</Note>
          </div>
        )}
      </SettingsBlock>
    </>
  );
};
