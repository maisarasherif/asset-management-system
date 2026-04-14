import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import type { FlashbarProps } from "@cloudscape-design/components";

type NoticeType = NonNullable<FlashbarProps.MessageDefinition["type"]>;

interface FlashbarContextValue {
  items: FlashbarProps.MessageDefinition[];
  clearAll: () => void;
  dismiss: (id: string) => void;
  push: (type: NoticeType, header: string, content: string) => void;
  success: (header: string, content: string) => void;
  error: (header: string, content: string) => void;
  info: (header: string, content: string) => void;
  warning: (header: string, content: string) => void;
}

const FlashbarContext = createContext<FlashbarContextValue | null>(null);

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

export function useFlashbar() {
  const context = useContext(FlashbarContext);
  if (!context) {
    throw new Error("useFlashbar must be used within FlashbarProvider");
  }
  return context;
}
