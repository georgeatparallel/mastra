import { afterEach, describe, expect, it, vi } from 'vitest';

const parallel = vi.hoisted(() => ({
  search: vi.fn(),
  extract: vi.fn(),
}));

vi.mock('@parallel-web/ai-sdk-tools', () => ({
  createSearchTool: () => ({
    description: 'Search the web using Parallel',
    inputSchema: {},
    execute: parallel.search,
  }),
  createExtractTool: () => ({
    description: 'Extract content using Parallel',
    inputSchema: {},
    execute: parallel.extract,
  }),
}));

import { getConfiguredWebToolsProvider } from './web-search.js';

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('getConfiguredWebToolsProvider', () => {
  it.each([
    { parallelKey: 'parallel-key', tavilyKey: 'tavily-key', expected: 'parallel' },
    { parallelKey: 'parallel-key', tavilyKey: '', expected: 'parallel' },
    { parallelKey: '', tavilyKey: 'tavily-key', expected: 'tavily' },
    { parallelKey: '', tavilyKey: '', expected: undefined },
  ])('resolves the key precedence matrix to $expected', ({ parallelKey, tavilyKey, expected }) => {
    vi.stubEnv('PARALLEL_API_KEY', parallelKey);
    vi.stubEnv('TAVILY_API_KEY', tavilyKey);

    expect(getConfiguredWebToolsProvider()?.id).toBe(expected);
  });

  it('adapts Parallel search to the existing ID and markdown string contract', async () => {
    vi.stubEnv('PARALLEL_API_KEY', 'parallel-key');
    parallel.search.mockResolvedValueOnce({
      results: [
        { title: 'Mastra docs', url: 'https://mastra.ai/docs', excerpts: ['Agent framework'] },
        { url: 'https://example.com', excerpts: ['First excerpt', 'Second excerpt'] },
      ],
    });

    const tool = getConfiguredWebToolsProvider()!.createSearchTool();
    const result = await tool.execute!({ search_queries: ['mastra docs'] } as any, {} as any);

    expect(tool.id).toBe('web-search');
    expect(result).toBe(
      '## Mastra docs\nhttps://mastra.ai/docs\nAgent framework\n\n' +
        '## https://example.com\nFirst excerpt\n\nSecond excerpt',
    );
  });

  it('adapts Parallel extract results and per-URL errors to the existing string contract', async () => {
    vi.stubEnv('PARALLEL_API_KEY', 'parallel-key');
    parallel.extract.mockResolvedValueOnce({
      results: [{ url: 'https://mastra.ai', excerpts: ['Extracted content'] }],
      errors: [{ url: 'https://bad.example', error_type: 'http_404' }],
    });

    const tool = getConfiguredWebToolsProvider()!.createExtractTool();
    const result = await tool.execute!({ urls: ['https://mastra.ai', 'https://bad.example'] } as any, {} as any);

    expect(tool.id).toBe('web-extract');
    expect(result).toBe('## https://mastra.ai\nExtracted content\n\n## https://bad.example\nError: http_404');
  });

  it('keeps the existing 2,000-token truncation behavior', async () => {
    vi.stubEnv('PARALLEL_API_KEY', 'parallel-key');
    parallel.search.mockResolvedValueOnce({
      results: [{ title: 'Large result', url: 'https://example.com', excerpts: ['token '.repeat(10_000)] }],
    });

    const result = await getConfiguredWebToolsProvider()!.createSearchTool().execute!(
      { search_queries: ['large result'] } as any,
      {} as any,
    );

    expect(result).toMatch(/^\[Truncated ~\d+ tokens\]\n/);
  });

  it('does not replace provider execution errors with a different failure contract', async () => {
    vi.stubEnv('PARALLEL_API_KEY', 'parallel-key');
    parallel.search.mockRejectedValueOnce(new Error('provider unavailable'));

    const execution = getConfiguredWebToolsProvider()!.createSearchTool().execute!(
      { search_queries: ['mastra'] } as any,
      {} as any,
    );

    await expect(execution).rejects.toThrow('provider unavailable');
  });
});
