import type { HttpClient } from '../http.js';

/** Every resource namespace shares one HTTP client and owns its own paths. */
export abstract class BaseResource {
  constructor(protected readonly http: HttpClient) {}
}
