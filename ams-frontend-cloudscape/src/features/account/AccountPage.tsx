import {
  Alert,
  Box,
  Button,
  ColumnLayout,
  Container,
  ContentLayout,
  Form,
  FormField,
  Header,
  Input,
  SpaceBetween,
} from "@cloudscape-design/components";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { logoutRequest, updatePassword } from "../../lib/api/ams";
import { useAuth } from "../../providers/AuthProvider";
import { useFlashbar } from "../../providers/FlashbarProvider";
import { humanizeEnum } from "../../utils/format";

export function AccountPage() {
  const navigate = useNavigate();
  const { logout, session } = useAuth();
  const { error, success } = useFlashbar();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const passwordMutation = useMutation({
    mutationFn: updatePassword,
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setErrorMessage("");
      success("Password updated", "Your account password has been changed.");
    },
    onError: (mutationError: Error) => {
      setErrorMessage(mutationError.message);
      error("Password update failed", mutationError.message);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSettled: () => {
      logout();
      navigate("/login", { replace: true });
      success("Signed out", "Your session has been cleared.");
    },
  });

  const handlePasswordSubmit = () => {
    if (!currentPassword || !newPassword) {
      setErrorMessage("Enter your current password and a new password.");
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage("The new password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("The new password confirmation does not match.");
      return;
    }

    setErrorMessage("");
    passwordMutation.mutate({
      current_password: currentPassword,
      new_password: newPassword,
    });
  };

  return (
    <ContentLayout
      header={
        <Header
          actions={
            <Button
              loading={logoutMutation.isPending}
              onClick={() => logoutMutation.mutate()}
            >
              Sign out
            </Button>
          }
          description="Manage your session details and security settings."
          variant="h1"
        >
          Account
        </Header>
      }
    >
      <ColumnLayout columns={2} variant="text-grid">
        <Container header={<Header variant="h2">Profile</Header>}>
          <SpaceBetween direction="vertical" size="s">
            <div className="summary-row">
              <Box variant="awsui-key-label">Name</Box>
              <Box>{`${session?.firstName || ""} ${session?.lastName || ""}`.trim() || "Not set"}</Box>
            </div>
            <div className="summary-row">
              <Box variant="awsui-key-label">Email</Box>
              <Box>{session?.email || "Not set"}</Box>
            </div>
            <div className="summary-row">
              <Box variant="awsui-key-label">Role</Box>
              <Box>{session?.role ? humanizeEnum(session.role) : "Not set"}</Box>
            </div>
          </SpaceBetween>
        </Container>

        <Container header={<Header variant="h2">Password</Header>}>
          <Form
            actions={
              <Button
                loading={passwordMutation.isPending}
                variant="primary"
                onClick={handlePasswordSubmit}
              >
                Update password
              </Button>
            }
          >
            <SpaceBetween direction="vertical" size="l">
              {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
              <FormField label="Current password">
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={({ detail }) => setCurrentPassword(detail.value)}
                />
              </FormField>
              <FormField label="New password">
                <Input
                  type="password"
                  value={newPassword}
                  onChange={({ detail }) => setNewPassword(detail.value)}
                />
              </FormField>
              <FormField label="Confirm new password">
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={({ detail }) => setConfirmPassword(detail.value)}
                />
              </FormField>
            </SpaceBetween>
          </Form>
        </Container>
      </ColumnLayout>
    </ContentLayout>
  );
}
