import type { Request, Response, NextFunction } from 'express';

/** Wraps an async route handler so unhandled rejections forward to Express error middleware. */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
