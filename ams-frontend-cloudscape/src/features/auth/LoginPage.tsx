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
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../../lib/api/ams";
import { useAuth } from "../../providers/AuthProvider";

export function LoginPage() {
  const navigate = useNavigate();
  const { login: establishSession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (session) => {
      establishSession({
        userId: session.user_id,
        firstName: session.first_name,
        lastName: session.last_name,
        email: session.email,
        role: session.role,
        token: session.token,
      });
      navigate("/dashboard", { replace: true });
    },
    onError: (error: Error) => {
      setErrorMessage(error.message);
    },
  });

  const handleSubmit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setErrorMessage("");
    loginMutation.mutate({ email, password });
  };

  return (
    <div className="login-page">
      <Container
        className="login-card"
        header={
          <Header
            description="Sign in with your AMS account to access the Cloudscape workspace."
            variant="h1"
          >
            AMS Cloudscape
          </Header>
        }
      >
        <form onSubmit={handleSubmit}>
          <Form
            actions={
              <Button formAction="submit" loading={loginMutation.isPending} variant="primary">
                Sign in
              </Button>
            }
          >
            <SpaceBetween direction="vertical" size="l">
              <Box color="text-body-secondary">
                Asset-first operations dashboard, contextual component workflows, and Cloudscape-native admin surfaces.
              </Box>
              {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
              <FormField label="Email">
                <Input
                  autoComplete="email"
                  inputMode="email"
                  type="email"
                  value={email}
                  onChange={({ detail }) => setEmail(detail.value)}
                />
              </FormField>
              <FormField label="Password">
                <Input
                  autoComplete="current-password"
                  type="password"
                  value={password}
                  onChange={({ detail }) => setPassword(detail.value)}
                />
              </FormField>
            </SpaceBetween>
          </Form>
        </form>
      </Container>
    </div>
  );
}
