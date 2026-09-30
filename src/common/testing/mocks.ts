/**
 * Shared test helpers — mock Mongoose models and providers for unit tests.
 */

export function makeMockModel(methods: string[] = []) {
  const impl: Record<string, any> = {};
  for (const m of methods) {
    impl[m] = jest.fn();
  }
  // Chainable query helpers
  for (const m of ['find', 'findOne', 'findById', 'findOneAndUpdate', 'findOneAndDelete', 'findByIdAndUpdate', 'findByIdAndDelete']) {
    if (!impl[m]) impl[m] = jest.fn(() => mockQuery);
  }
  const mockQuery: any = {
    populate: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
    lean: jest.fn().mockReturnThis(),
  };
  Object.assign(impl, {
    create: jest.fn(),
    exists: jest.fn(),
    countDocuments: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn(() => mockQuery),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    deleteOne: jest.fn(),
  });
  return impl;
}

export const MOCK_ROLES = { CUSTOMER: 'customer', OWNER: 'owner', ADMIN: 'admin' };
