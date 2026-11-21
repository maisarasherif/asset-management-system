import { useQuery } from "@tanstack/react-query";
import { listStores } from "../../lib/api/maintenance";

export function useStores() {
  return useQuery({ queryKey: ["maintenance", "stores"], queryFn: listStores });
}
