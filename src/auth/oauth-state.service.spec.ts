import { OAuthStateService } from './oauth-state.service';

describe('OAuthStateService', () => {
  let service: OAuthStateService;
  let records: Map<string, { state: string; expiresAt: Date }>;

  beforeEach(() => {
    records = new Map();
    const model = {
      create: jest.fn(async (record: { state: string; expiresAt: Date }) => {
        records.set(record.state, record);
        return record;
      }),
      findOneAndDelete: jest.fn(
        (query: { state: string; expiresAt: { $gt: Date } }) => ({
          exec: async () => {
            const record = records.get(query.state);
            records.delete(query.state);
            return record && record.expiresAt > query.expiresAt.$gt
              ? record
              : null;
          },
        }),
      ),
    };
    service = new OAuthStateService(model as any);
  });

  it('issues a state and validates it exactly once', async () => {
    const state = await service.issue();
    expect(state).toBeTruthy();
    expect(await service.consume(state)).toBe(true);
    expect(await service.consume(state)).toBe(false);
  });

  it('rejects unknown and empty states', async () => {
    expect(await service.consume('unknown')).toBe(false);
    expect(await service.consume('')).toBe(false);
    expect(await service.consume(undefined as unknown as string)).toBe(false);
  });

  it('rejects expired states and burns them', async () => {
    const state = await service.issue();
    records.get(state)!.expiresAt = new Date(Date.now() - 1);
    expect(await service.consume(state)).toBe(false);
    expect(records.has(state)).toBe(false);
  });

  it('issues independent states for concurrent requests', async () => {
    const first = await service.issue();
    const second = await service.issue();
    expect(first).not.toBe(second);
    expect(await service.consume(first)).toBe(true);
    expect(await service.consume(second)).toBe(true);
  });
});
