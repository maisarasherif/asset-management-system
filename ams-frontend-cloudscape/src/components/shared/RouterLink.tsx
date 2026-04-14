import { Link } from "@cloudscape-design/components";
import type { LinkProps } from "@cloudscape-design/components";
import type { PropsWithChildren } from "react";
import { useNavigate } from "react-router-dom";

type RouterLinkProps = PropsWithChildren<{
  to: string;
  fontSize?: LinkProps.FontSize;
}>;

export function RouterLink({ children, fontSize, to }: RouterLinkProps) {
  const navigate = useNavigate();

  return (
    <Link
      fontSize={fontSize}
      href={to}
      onFollow={(event) => {
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </Link>
  );
}
