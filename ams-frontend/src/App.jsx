import AppErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider } from "./context/AuthContext";
import { ConfirmProvider } from "./context/ConfirmContext";
import { AppFeedbackProvider } from "./context/FeedbackContext";
import { RequestStateProvider } from "./context/RequestStateContext";
import { useAuth } from "./hooks/useAuth";
import AppShell from "./layout/AppShell";
import LoginPage from "./pages/LoginPage";

function Providers({ children }) {
  return (
    <AuthProvider>
      <RequestStateProvider>
        <AppFeedbackProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </AppFeedbackProvider>
      </RequestStateProvider>
    </AuthProvider>
  );
}

function Inner() {
  const { user } = useAuth();
  return user ? <AppErrorBoundary><AppShell /></AppErrorBoundary> : <LoginPage />;
}

export default function App() {
  return (
    <Providers>
      <Inner />
    </Providers>
  );
}



