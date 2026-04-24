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
  Select,
  SpaceBetween,
} from "@cloudscape-design/components";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createUser, logoutRequest, updatePassword } from "../../lib/api/ams";
import { useAuth } from "../../providers/auth-context";
import { useFlashbar } from "../../providers/flashbar-context";
import { humanizeEnum } from "../../utils/format";
import type { Role } from "../../types/ams";

export function AccountPage() {
  const navigate = useNavigate();
  const { isAdmin, logout, session } = useAuth();
  const { error, success } = useFlashbar();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [createUserError, setCreateUserError] = useState("");
  const [newUserFirstName, setNewUserFirstName] = useState("");
  const [newUserLastName, setNewUserLastName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<Role>("USER");

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

  const createUserMutation = useMutation({
    mutationFn: createUser,
    onSuccess: (createdUser) => {
      setNewUserFirstName("");
      setNewUserLastName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("USER");
      setCreateUserError("");
      success(
        "User created",
        `${createdUser.first_name} ${createdUser.last_name} can now sign in with ${createdUser.email}.`
      );
    },
    onError: (mutationError: Error) => {
      setCreateUserError(mutationError.message);
      error("User creation failed", mutationError.message);
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

  const handleCreateUserSubmit = () => {
    if (!newUserFirstName || !newUserLastName || !newUserEmail || !newUserPassword) {
      setCreateUserError("Enter a first name, last name, email, password, and role.");
      return;
    }

    if (newUserPassword.length < 6) {
      setCreateUserError("The temporary password must be at least 6 characters.");
      return;
    }

    setCreateUserError("");
    createUserMutation.mutate({
      first_name: newUserFirstName.trim(),
      last_name: newUserLastName.trim(),
      email: newUserEmail.trim(),
      password: newUserPassword,
      role: newUserRole,
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
      <ColumnLayout columns={isAdmin ? 3 : 2} variant="text-grid">
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

        {isAdmin ? (
          <Container header={<Header variant="h2">Create user</Header>}>
            <Form
              actions={
                <Button
                  loading={createUserMutation.isPending}
                  variant="primary"
                  onClick={handleCreateUserSubmit}
                >
                  Create user
                </Button>
              }
            >
              <SpaceBetween direction="vertical" size="l">
                {createUserError ? <Alert type="error">{createUserError}</Alert> : null}
                <FormField label="First name">
                  <Input
                    value={newUserFirstName}
                    onChange={({ detail }) => setNewUserFirstName(detail.value)}
                  />
                </FormField>
                <FormField label="Last name">
                  <Input
                    value={newUserLastName}
                    onChange={({ detail }) => setNewUserLastName(detail.value)}
                  />
                </FormField>
                <FormField label="Email">
                  <Input
                    type="email"
                    value={newUserEmail}
                    onChange={({ detail }) => setNewUserEmail(detail.value)}
                  />
                </FormField>
                <FormField
                  label="Temporary password"
                  description="The new user can change this after signing in."
                >
                  <Input
                    type="password"
                    value={newUserPassword}
                    onChange={({ detail }) => setNewUserPassword(detail.value)}
                  />
                </FormField>
                <FormField label="Role">
                  <Select
                    selectedOption={{
                      label: humanizeEnum(newUserRole),
                      value: newUserRole,
                    }}
                    options={[
                      { label: "User", value: "USER" },
                      { label: "Admin", value: "ADMIN" },
                    ]}
                    onChange={({ detail }) => setNewUserRole((detail.selectedOption.value as Role) || "USER")}
                  />
                </FormField>
              </SpaceBetween>
            </Form>
          </Container>
        ) : null}
      </ColumnLayout>
    </ContentLayout>
  );
}
