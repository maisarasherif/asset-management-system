import { Box, Container, Header } from "@cloudscape-design/components";

interface PlaceholderPageProps {
  title: string;
  description: string;
}

export function PlaceholderPage({ description, title }: PlaceholderPageProps) {
  return (
    <Container header={<Header variant="h1">{title}</Header>}>
      <Box color="text-body-secondary">{description}</Box>
    </Container>
  );
}
