import { Box, Button, Container, Header, SpaceBetween } from "@cloudscape-design/components";
import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router-dom";

function getErrorDescription(error: unknown) {
  if (isRouteErrorResponse(error)) {
    return error.statusText || "The requested page could not be loaded.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred while rendering this page.";
}

export function RouteErrorPage() {
  const navigate = useNavigate();
  const error = useRouteError();
  const description = getErrorDescription(error);

  return (
    <div className="route-error-page">
      <Container
        header={
          <Header description="The application hit an unexpected problem, but your session is still intact." variant="h1">
            Page error
          </Header>
        }
      >
        <SpaceBetween direction="vertical" size="l">
          <Box color="text-body-secondary">{description}</Box>
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="primary" onClick={() => window.location.reload()}>
              Reload page
            </Button>
            <Button onClick={() => navigate("/dashboard")}>Go to dashboard</Button>
          </SpaceBetween>
        </SpaceBetween>
      </Container>
    </div>
  );
}
