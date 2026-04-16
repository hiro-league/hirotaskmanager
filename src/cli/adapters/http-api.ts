import {
  fetchApi,
  fetchApiMutate,
  fetchApiTrashMutate,
  fetchHealth,
} from "../lib/client/api-client";
import type { ApiPort } from "../ports/api";

/** Default TaskManager HTTP API adapter (local fetch + shared config). */
export function createHttpApiAdapter(): ApiPort {
  return {
    fetchApi,
    fetchApiMutate,
    fetchApiTrashMutate,
    fetchHealth,
  };
}
