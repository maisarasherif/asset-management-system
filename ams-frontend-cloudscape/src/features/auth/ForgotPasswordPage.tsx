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
import { RouterLink } from "../../components/shared/RouterLink";
import { forgotPassword } from "../../lib/api/ams";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const mutation = useMutation({
    mutationFn: forgotPassword,
    onSuccess: (response) => {
      setErrorMessage("");
      setMessage(response.message);
    },
    onError: (error: Error) => {
      setMessage("");
      setErrorMessage(error.message);
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");
    mutation.mutate({ email: email.trim() });
  };

  return (
    <main className="auth-flow-page">
      <Container
        header={
          <Header description="Request a password reset link for your AMS account." variant="h1">
            Forgot password
          </Header>
        }
      >
        <form onSubmit={handleSubmit}>
          <Form
            actions={
              <Button disabled={!email.trim()} formAction="submit" loading={mutation.isPending} variant="primary">
                Send reset link
              </Button>
            }
          >
            <SpaceBetween direction="vertical" size="l">
              {message ? <Alert type="success">{message}</Alert> : null}
              {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
              <FormField label="Email" stretch>
                <Input
                  autoComplete="email"
                  inputMode="email"
                  placeholder="user@portomarines.com"
                  type="email"
                  value={email}
                  onChange={({ detail }) => setEmail(detail.value)}
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
