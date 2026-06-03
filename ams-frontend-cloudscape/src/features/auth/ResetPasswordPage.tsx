import {
  Alert,
  Box,
  Button,
  Container,
  Form,
  FormField,
  Header,
  Input,
  SpaceBetween,
} from "@cloudscape-design/components";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { RouterLink } from "../../components/shared/RouterLink";
import { resetPassword } from "../../lib/api/ams";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const validationMessage = useMemo(() => {
    if (!token) return "This reset link is missing a token.";
    if (newPassword && newPassword.length < 12) return "New password must be at least 12 characters.";
    if (confirmPassword && newPassword !== confirmPassword) return "Password confirmation does not match.";
    return "";
  }, [confirmPassword, newPassword, token]);

  const mutation = useMutation({
    mutationFn: resetPassword,
    onSuccess: () => {
      navigate("/login", { replace: true });
    },
    onError: (error: Error) => {
      setErrorMessage(error.message);
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    if (validationMessage || !newPassword || !confirmPassword) {
      setErrorMessage(validationMessage || "Enter and confirm your new password.");
      return;
    }
    mutation.mutate({ token, new_password: newPassword });
  };

  return (
    <main className="auth-flow-page">
      <Container
        header={
          <Header description="Choose a new password for your AMS account." variant="h1">
            Reset password
          </Header>
        }
      >
        <form onSubmit={handleSubmit}>
          <Form
            actions={
              <Button
                disabled={!token || !newPassword || !confirmPassword || Boolean(validationMessage)}
                formAction="submit"
                loading={mutation.isPending}
                variant="primary"
              >
                Reset password
              </Button>
            }
          >
            <SpaceBetween direction="vertical" size="l">
              {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
              {validationMessage ? <Alert type="info">{validationMessage}</Alert> : null}
              <FormField label="New password" stretch>
                <Input
                  autoComplete="new-password"
                  type="password"
                  value={newPassword}
                  onChange={({ detail }) => setNewPassword(detail.value)}
                />
              </FormField>
              <FormField label="Confirm new password" stretch>
                <Input
                  autoComplete="new-password"
                  type="password"
                  value={confirmPassword}
                  onChange={({ detail }) => setConfirmPassword(detail.value)}
                />
              </FormField>
              <Box color="text-body-secondary">
                <RouterLink to="/login">Back to login</RouterLink>
              </Box>
            </SpaceBetween>
          </Form>
        </form>
      </Container>
    </main>
  );
}
