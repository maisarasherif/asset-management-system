import { useContext } from "react";
import { AppFeedbackContext } from "../context/FeedbackContext";

export function useFeedback() {
  const context = useContext(AppFeedbackContext);
  if (!context) throw new Error("useFeedback must be used within AppFeedbackProvider");
  return context;
}

