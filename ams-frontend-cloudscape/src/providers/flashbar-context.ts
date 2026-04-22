import { createContext, useContext } from "react";
import type { FlashbarProps } from "@cloudscape-design/components";

export type NoticeType = NonNullable<FlashbarProps.MessageDefinition["type"]>;

export interface FlashbarContextValue {
  items: FlashbarProps.MessageDefinition[];
  clearAll: () => void;
  dismiss: (id: string) => void;
  push: (type: NoticeType, header: string, content: string) => void;
  success: (header: string, content: string) => void;
  error: (header: string, content: string) => void;
  info: (header: string, content: string) => void;
  warning: (header: string, content: string) => void;
}

export const FlashbarContext = createContext<FlashbarContextValue | null>(null);

export function useFlashbar() {
  const context = useContext(FlashbarContext);
  if (!context) {
    throw new Error("useFlashbar must be used within FlashbarProvider");
  }
  return context;
}
