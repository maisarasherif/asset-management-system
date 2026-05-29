import {
  Box,
  Container,
  Header,
  SpaceBetween,
} from "@cloudscape-design/components";
import type { ReactNode } from "react";

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
