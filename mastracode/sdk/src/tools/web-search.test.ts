import { afterEach, describe, expect, it, vi } from 'vitest';

const parallel = vi.hoisted(() => ({
  search: vi.fn(),
  extract: vi.fn(),
}));

vi.mock('@mastra/parallel', () => ({
  createParallelSearchTool: () => ({
    description: 'Search the web using Parallel',
    inputSchema: {},
    execute: parallel.search,
  }),
  createParallelExtractTool: () => ({
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
    const result = await tool.execute!({ searchQueries: ['mastra docs'] }, {} as any);

    expect(tool.id).toBe('web-search');
    expect(result).toBe(
      '## Mastra docs\nhttps://mastra.ai/docs\nAgent framework\n\n' +
        '## https://example.com\nFirst excerpt\n\nSecond excerpt',
    );
  });

  it('adapts Parallel extract results and per-URL errors to the existing string contract', async () => {
    vi.stubEnv('PARALLEL_API_KEY', 'parallel-key');
    parallel.extract.mockResolvedValueOnce({
      results: [
        { url: 'https://mastra.ai', excerpts: ['Extracted excerpt'], fullContent: 'Full page content' },
        { url: 'https://mastra.ai/docs', excerpts: ['Extracted documentation'] },
      ],
      errors: [{ url: 'https://bad.example', errorType: 'http_404' }],
    });

    const tool = getConfiguredWebToolsProvider()!.createExtractTool();
    const result = await tool.execute!(
      { urls: ['https://mastra.ai', 'https://mastra.ai/docs', 'https://bad.example'] },
      {} as any,
    );

    expect(tool.id).toBe('web-extract');
    expect(result).toBe(
      '## https://mastra.ai\nFull page content\n\n' +
        '## https://mastra.ai/docs\nExtracted documentation\n\n' +
        '## https://bad.example\nError: http_404',
    );
  });

  it('keeps the existing 2,000-token truncation behavior', async () => {
    vi.stubEnv('PARALLEL_API_KEY', 'parallel-key');
    parallel.search.mockResolvedValueOnce({
      results: [{ title: 'Large result', url: 'https://example.com', excerpts: ['token '.repeat(10_000)] }],
    });

    const result = await getConfiguredWebToolsProvider()!.createSearchTool().execute!(
      { searchQueries: ['large result'] },
      {} as any,
    );

    expect(result).toMatch(/^\[Truncated ~\d+ tokens\]\n/);
  });
});
