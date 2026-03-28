import { Component } from "react";
import Button from "./ui/Button";
import Card from "./ui/Card";

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error("Unhandled UI error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, background: "var(--bg-0)" }}>
          <Card style={{ width: 520, maxWidth: "95vw", padding: 24 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 20, marginBottom: 6 }}>Something went wrong</div>
            <div style={{ color: "var(--text-1)", fontSize: 12, marginBottom: 16 }}>
              The app hit an unexpected error. Reload to recover.
            </div>
            <Button variant="primary" onClick={() => window.location.reload()}>Reload</Button>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

export default AppErrorBoundary;

