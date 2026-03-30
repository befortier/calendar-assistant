/** Thrown when a request lacks valid authentication or the user cannot be resolved. */
export class AuthenticationError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'AuthenticationError';
  }
}
