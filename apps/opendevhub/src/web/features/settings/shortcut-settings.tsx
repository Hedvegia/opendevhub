import { Button } from "@opendevhub/ui/button";
import { formatForDisplay, useHotkeyRecorder } from "@tanstack/react-hotkeys";
import { RotateCcwIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { HotkeyKeys } from "../../components/shortcut-keys";
import { Tip } from "../../components/tip";
import {
  bindingOf,
  conflictFor,
  defaultBinding,
  SHORTCUT_GROUPS,
} from "../../shell/shortcuts";
import type { ShortcutId } from "../../shell/shortcuts";
import {
  resetAllBindings,
  resetBinding,
  setBinding,
  useShortcutOverrides,
} from "../../shell/use-shortcut";
import { SettingsBlock, SettingsHeader, SettingsList } from "./settings-layout";

/**
 * Escape cancels a recording, but the Settings dialog closes on it too. Claiming it first, on the window, keeps the
 * dialog open; the recorder still sees the key and cancels.
 */
const useKeepDialogOnEscape = (active: boolean) => {
  useEffect(() => {
    if (!active) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active]);
};

export const ShortcutSettings = () => {
  const overrides = useShortcutOverrides();
  const [editing, setEditing] = useState<ShortcutId>();
  const [error, setError] = useState<string>();

  const recorder = useHotkeyRecorder({
    onCancel: () => setEditing(undefined),
    onClear: () => {
      if (editing) {
        setBinding(editing, null);
      }
      setEditing(undefined);
    },
    onRecord: (hotkey) => {
      if (editing) {
        setBinding(editing, hotkey);
      }
      setEditing(undefined);
    },
    onReject: (rejection) => setError(rejection.message),
    // Record the character typed, so a binding reads the way it was pressed on any keyboard layout.
    recordBy: "key",
    validate: (hotkey) => {
      const clash = editing && conflictFor(editing, hotkey, overrides);
      return clash ? `Already used for “${clash}”.` : true;
    },
  });
  const recording = recorder.isRecording ? editing : undefined;
  useKeepDialogOnEscape(recording !== undefined);

  const record = (id: ShortcutId) => {
    if (recording === id) {
      recorder.cancelRecording();
      setEditing(undefined);
      return;
    }
    recorder.cancelRecording();
    setError(undefined);
    setEditing(id);
    recorder.startRecording();
  };

  const changed = Object.keys(overrides).length > 0;
  return (
    <>
      <SettingsHeader
        title="Shortcuts"
        description="Click a shortcut and press the keys you want instead. Esc cancels; Backspace turns the shortcut off. Your shortcuts are kept in this browser."
        action={
          changed && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                recorder.cancelRecording();
                setEditing(undefined);
                resetAllBindings();
              }}
            >
              <RotateCcwIcon />
              Reset all
            </Button>
          )
        }
      />
      {SHORTCUT_GROUPS.map((group) => (
        <SettingsBlock key={group.title} title={group.title} hint={group.hint}>
          <SettingsList>
            {group.shortcuts.map((s) => {
              const binding = bindingOf(s.id, overrides);
              const isRecording = recording === s.id;
              const custom = s.id in overrides;
              return (
                <li
                  key={s.id}
                  className="flex flex-col gap-1 px-4 py-2 text-sm"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span>{s.label}</span>
                    <span className="flex items-center gap-1">
                      {custom && !isRecording && (
                        <Tip
                          label={`Reset to ${formatForDisplay(defaultBinding(s.id))}`}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label={`Reset “${s.label}” to its default`}
                            onClick={() => resetBinding(s.id)}
                          >
                            <RotateCcwIcon />
                          </Button>
                        </Tip>
                      )}
                      <Button
                        variant={isRecording ? "secondary" : "ghost"}
                        size="sm"
                        className="text-muted-foreground min-w-24 justify-end font-normal"
                        aria-label={`Change the shortcut for “${s.label}”`}
                        aria-pressed={isRecording}
                        onClick={() => record(s.id)}
                      >
                        {isRecording && "Press keys…"}
                        {!isRecording && binding !== null && (
                          <HotkeyKeys hotkey={binding} className="min-w-6" />
                        )}
                        {!isRecording && binding === null && "Off"}
                      </Button>
                    </span>
                  </div>
                  {isRecording && error && (
                    <p className="text-destructive text-xs" role="alert">
                      {error}
                    </p>
                  )}
                </li>
              );
            })}
          </SettingsList>
        </SettingsBlock>
      ))}
    </>
  );
};
