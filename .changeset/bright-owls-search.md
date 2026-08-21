---
'@mastra/code-sdk': minor
---

Added Parallel as the default provider for Mastra Code web search and extraction. Set `PARALLEL_API_KEY` to use Parallel-backed `web_search` and `web_extract` tools. Parallel takes priority when `TAVILY_API_KEY` is also set, while Tavily and native model search remain available as fallbacks.
