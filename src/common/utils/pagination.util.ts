export function parsePagination(query: { page?: string; limit?: string }) {
  const page = Math.max(parseInt(String(query?.page || '1'), 10) || 1, 1);
  const limit = Math.min(
    Math.max(parseInt(String(query?.limit || '20'), 10) || 20, 1),
    100,
  );
  return { page, limit };
}
