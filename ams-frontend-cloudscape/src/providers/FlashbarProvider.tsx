import {
  useCallback,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import type { FlashbarProps } from "@cloudscape-design/components";
import {
  FlashbarContext,
  type FlashbarContextValue,
  type NoticeType,
} from "./flashbar-context";

export function FlashbarProvider({ children }: PropsWithChildren) {
  const [items, setItems] = useState<FlashbarProps.MessageDefinition[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((currentItems) => currentItems.filter((item) => item.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
  }, []);

  const push = useCallback(
    (type: NoticeType, header: string, content: string) => {
      const id = crypto.randomUUID();
      setItems((currentItems) => [
        {
          id,
          type,
          header,
          content,
          dismissible: true,
          dismissLabel: "Dismiss notification",
          onDismiss: () => dismiss(id),
        },
        ...currentItems,
      ]);
    },
    [dismiss]
  );

  const value = useMemo<FlashbarContextValue>(
    () => ({
      items,
      clearAll,
      dismiss,
      push,
      success: (header, content) => push("success", header, content),
      error: (header, content) => push("error", header, content),
      info: (header, content) => push("info", header, content),
      warning: (header, content) => push("warning", header, content),
    }),
    [clearAll, dismiss, items, push]
  );

  return (
    <FlashbarContext.Provider value={value}>{children}</FlashbarContext.Provider>
  );
}
