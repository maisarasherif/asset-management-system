import {
  Alert,
  Box,
  Button,
  Form,
  FormField,
  Input,
  Link,
  SpaceBetween,
  StatusIndicator,
} from "@cloudscape-design/components";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../../lib/api/ams";
import { useAuth } from "../../providers/auth-context";
import { useFlashbar } from "../../providers/flashbar-context";

export function LoginPage() {
  const navigate = useNavigate();
  const { login: establishSession } = useAuth();
  const { clearAll } = useFlashbar();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    clearAll();
  }, [clearAll]);

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
      <section className="login-page__brand-panel" aria-label="Porto Marine AMS overview">
        <div className="login-page__depth-line" aria-hidden="true" />
        <div className="login-page__brand-content">
          <div className="login-brand">
            <div>
              <div className="login-brand__company">Porto Marine Services</div>
              <div className="login-brand__division">Offshore diving division</div>
            </div>
            <div className="login-brand__logo-frame">
              <img
                className="login-brand__logo"
                src="/porto-marine-logo.png"
                alt="Porto Marine Services"
              />
            </div>
          </div>

          <div className="login-hero">
            <div className="login-hero__eyebrow">Assets Management System</div>
            <h1 className="login-hero__title">
              Where
              <br />
              Innovation
              <span>Meets Depth</span>
            </h1>
            <p>
              Comprehensive asset certifications tracking, routine maintenance scheduling, and compliance management
              for offshore marine and diving operations.
            </p>
          </div>

          <dl className="login-stats" aria-label="AMS operating indicators">
            <div>
              <dt>Environmental Management Systems</dt>
              <dd>ISO 14001</dd>
            </div>
            <div>
              <dt>Occupational Health and Safety Management Systems</dt>
              <dd>ISO 45001</dd>
            </div>
            <div>
              <dt>Quality Management Systems</dt>
              <dd>ISO 9001</dd>
            </div>
          </dl>

          <div className="login-badges" aria-label="Compliance badges">
            <span>IMCA Compliant</span>
            <span>ADCI Member</span>
            <span>ADNOC-Approved Vendor</span>
          </div>
        </div>
      </section>

      <section className="login-page__form-panel" aria-label="Sign in">
        <div className="login-form-card">
          <SpaceBetween direction="vertical" size="xl">
            <div className="login-form-card__header">
              <Box variant="h1">Sign in to AMS</Box>
              <StatusIndicator type="success">Authorized personnel only</StatusIndicator>
            </div>

            <form onSubmit={handleSubmit}>
              <Form
                actions={
                  <Button
                    disabled={!email || !password}
                    formAction="submit"
                    loading={loginMutation.isPending}
                    variant="primary"
                  >
                    Sign in
                  </Button>
                }
              >
                <SpaceBetween direction="vertical" size="l">
                  <Box color="text-body-secondary">
                    Use your Porto Marine Services AMS account to open the assets
                    workspace.
                  </Box>
                  {errorMessage ? (
                    <Alert type="error" header="Unable to sign in">
                      {errorMessage}
                    </Alert>
                  ) : null}
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
                  <FormField label="Password" stretch>
                    <Input
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      type="password"
                      value={password}
                      onChange={({ detail }) => setPassword(detail.value)}
                    />
                  </FormField>
                </SpaceBetween>
              </Form>
            </form>

            <div className="login-form-card__footer">
              Need access? Contact our system administrator at{" "}
              <Link href="mailto:maysara.sherif@portomarines.com">maysara.sherif@portomarines.com</Link>.
            </div>
          </SpaceBetween>
        </div>
      </section>
    </div>
  );
}
