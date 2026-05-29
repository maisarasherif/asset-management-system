import {
  Alert,
  Button,
  Container,
  Header,
  SpaceBetween,
} from "@cloudscape-design/components";

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
