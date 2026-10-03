import { Alert, Button, Spinner } from "@cloudscape-design/components";
import { useQuery, type QueryKey } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

export function SignatureImagePreview({ queryKey, loadImage }: { queryKey: QueryKey; loadImage: () => Promise<Blob> }) {
  const image = useQuery({ queryKey, queryFn: loadImage, staleTime: Infinity });
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!image.data || !ref.current) return;
    const url = URL.createObjectURL(image.data);
    ref.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [image.data]);
  if (image.isPending) return <span role="status" aria-label="Loading signature image"><Spinner /></span>;
  if (image.isError) return <Alert type="error" action={<Button onClick={() => void image.refetch()}>Retry image</Button>}>{image.error.message}</Alert>;
  return <img ref={ref} alt="Saved signature or stamp" style={{ display: "block", maxWidth: "100%", width: "min(100%, 24rem)", maxHeight: "12rem", objectFit: "contain", objectPosition: "left center" }} />;
}
