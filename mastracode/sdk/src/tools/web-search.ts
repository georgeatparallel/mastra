import { createTool } from '@mastra/core/tools';
import { createTavilySearchTool, createTavilyExtractTool } from '@mastra/tavily';
import {
  createExtractTool as createParallelExtractTool,
  createSearchTool as createParallelSearchTool,
} from '@parallel-web/ai-sdk-tools';

import { truncateStringForTokenEstimate } from '../utils/token-estimator.js';

const MAX_WEB_SEARCH_TOKENS = 2_000;
const MAX_WEB_EXTRACT_TOKENS = 2_000;

const MIN_RELEVANCE_SCORE = 0.25;

type NonStreamingToolOutput<T extends { execute?: (...args: any[]) => unknown }> = Exclude<
  Awaited<ReturnType<NonNullable<T['execute']>>>,
  AsyncIterable<unknown>
>;

/**
 * Check whether a Tavily API key is available in the environment.
 * Used by main.ts to decide whether to include Tavily tools or fall back
 * to Anthropic's native web search.
 */
export function hasTavilyKey(): boolean {
  return !!process.env.TAVILY_API_KEY;
}

/**
 * Wraps the @mastra/tavily search tool with mastracode-specific behavior:
 * relevance filtering, markdown string formatting, and token truncation.
 * The underlying Tavily tool handles client init, input validation, and the API call.
 */
export function createWebSearchTool() {
  const tavilySearchTool = createTavilySearchTool();

  return createTool({
    id: 'web-search',
    description: tavilySearchTool.description!,
    inputSchema: tavilySearchTool.inputSchema!,
    execute: async (input, context) => {
      const output: any = await tavilySearchTool.execute!(input as any, context as any);

      const parts: string[] = [];

      if (output.answer) {
        parts.push(`Answer: ${output.answer}`);
      }

      const filtered = output.results.filter((r: any) => (r.score ?? 1) >= MIN_RELEVANCE_SCORE);
      for (const r of filtered) {
        parts.push(`## ${r.title}\n${r.url}\n${r.content}`);
      }

      const images = (output.images || []).map((img: any) => img.url).filter(Boolean);
      if (images.length > 0) {
        parts.push(`Images:\n${images.join('\n')}`);
      }

      const text = parts.join('\n\n');
      return truncateStringForTokenEstimate(text, MAX_WEB_SEARCH_TOKENS);
    },
  });
}

/**
 * Wraps the @mastra/tavily extract tool with mastracode-specific behavior:
 * markdown string formatting and token truncation.
 */
export function createWebExtractTool() {
  const tavilyExtractTool = createTavilyExtractTool();

  return createTool({
    id: 'web-extract',
    description: tavilyExtractTool.description!,
    inputSchema: tavilyExtractTool.inputSchema!,
    execute: async (input, context) => {
      const output: any = await tavilyExtractTool.execute!(input as any, context as any);

      const parts: string[] = [];

      for (const r of output.results) {
        parts.push(`## ${r.url}\n${r.rawContent}`);
      }

      for (const r of output.failedResults) {
        parts.push(`## ${r.url}\nError: ${r.error}`);
      }

      const text = parts.join('\n\n');
      return truncateStringForTokenEstimate(text, MAX_WEB_EXTRACT_TOKENS);
    },
  });
}

function createParallelWebSearchTool() {
  const parallelSearchTool = createParallelSearchTool();

  return createTool({
    id: 'web-search',
    description: parallelSearchTool.description!,
    inputSchema: parallelSearchTool.inputSchema as any,
    execute: async (input, context) => {
      const output = (await parallelSearchTool.execute!(input as any, context as any)) as NonStreamingToolOutput<
        typeof parallelSearchTool
      >;
      const parts: string[] = [];

      for (const result of output.results) {
        const header = result.title ? `## ${result.title}\n${result.url}` : `## ${result.url}`;
        parts.push(`${header}\n${result.excerpts.join('\n\n')}`);
      }

      return truncateStringForTokenEstimate(parts.join('\n\n'), MAX_WEB_SEARCH_TOKENS);
    },
  });
}

function createParallelWebExtractTool() {
  const parallelExtractTool = createParallelExtractTool();

  return createTool({
    id: 'web-extract',
    description: parallelExtractTool.description!,
    inputSchema: parallelExtractTool.inputSchema as any,
    execute: async (input, context) => {
      const output = (await parallelExtractTool.execute!(input as any, context as any)) as NonStreamingToolOutput<
        typeof parallelExtractTool
      >;
      const parts: string[] = [];

      for (const result of output.results) {
        parts.push(`## ${result.url}\n${result.excerpts.join('\n\n')}`);
      }

      for (const error of output.errors) {
        parts.push(`## ${error.url}\nError: ${error.error_type}`);
      }

      return truncateStringForTokenEstimate(parts.join('\n\n'), MAX_WEB_EXTRACT_TOKENS);
    },
  });
}

const PARALLEL_WEB_TOOLS_PROVIDER = {
  id: 'parallel',
  createSearchTool: createParallelWebSearchTool,
  createExtractTool: createParallelWebExtractTool,
} as const;

const TAVILY_WEB_TOOLS_PROVIDER = {
  id: 'tavily',
  createSearchTool: createWebSearchTool,
  createExtractTool: createWebExtractTool,
} as const;

/**
 * Resolve the configured model-independent web provider in precedence order.
 * Returning undefined leaves the caller free to use a model-native fallback.
 */
export function getConfiguredWebToolsProvider() {
  if (process.env.PARALLEL_API_KEY) return PARALLEL_WEB_TOOLS_PROVIDER;
  if (hasTavilyKey()) return TAVILY_WEB_TOOLS_PROVIDER;
  return undefined;
}
