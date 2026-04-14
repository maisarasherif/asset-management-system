import {
  Alert,
  Box,
  Button,
  Container,
  Header,
  SpaceBetween,
  Spinner,
} from "@cloudscape-design/components";
import type { PropsWithChildren, ReactNode } from "react";

export function PageLoading({ children }: PropsWithChildren) {
  return (
    <Container>
      <Box padding="l" textAlign="center">
        <SpaceBetween direction="vertical" size="s">
          <Spinner size="large" />
          <Box color="text-body-secondary">{children || "Loading data..."}</Box>
        </SpaceBetween>
      </Box>
    </Container>
  );
}

interface PageErrorProps {
  title?: string;
  description: string;
  onRetry?: () => void;
}

export function PageError({
  description,
  onRetry,
  title = "Something went wrong",
}: PageErrorProps) {
  return (
    <Container header={<Header variant="h2">{title}</Header>}>
      <SpaceBetween direction="vertical" size="m">
        <Alert type="error">{description}</Alert>
        {onRetry ? <Button onClick={onRetry}>Retry</Button> : null}
      </SpaceBetween>
    </Container>
  );
}

interface PageEmptyProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function PageEmpty({ action, description, title }: PageEmptyProps) {
  return (
    <Container>
      <Box padding="l" textAlign="center">
        <SpaceBetween direction="vertical" size="m">
          <Header variant="h2">{title}</Header>
          <Box color="text-body-secondary">{description}</Box>
          {action}
        </SpaceBetween>
      </Box>
    </Container>
  );
}
