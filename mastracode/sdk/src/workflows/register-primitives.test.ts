import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConfiguredWebToolsProvider: vi.fn(),
}));

vi.mock('@mastra/core/notifications', () => ({
  createNotificationInboxTool: vi.fn(),
}));

vi.mock('@mastra/core/workspace', () => ({
  WORKSPACE_TOOLS: {
    FILESYSTEM: {
      READ_FILE: 'read-file',
      WRITE_FILE: 'write-file',
      EDIT_FILE: 'edit-file',
      LIST_FILES: 'list-files',
      DELETE: 'delete-file',
      FILE_STAT: 'file-stat',
      MKDIR: 'mkdir',
      GREP: 'grep',
      AST_EDIT: 'ast-edit',
    },
    SANDBOX: {
      EXECUTE_COMMAND: 'execute-command',
      GET_PROCESS_OUTPUT: 'get-process-output',
      KILL_PROCESS: 'kill-process',
    },
    LSP: {
      LSP_INSPECT: 'lsp-inspect',
    },
  },
  LocalFilesystem: class LocalFilesystem {},
  LocalSandbox: class LocalSandbox {},
  Workspace: class Workspace {},
  createWorkspaceTools: vi.fn(async () => ({})),
}));

vi.mock('../agents/tools.js', () => ({
  LazyNotificationsStorage: class LazyNotificationsStorage {},
}));

vi.mock('../agents/workflow-builder-agent.js', () => ({
  workflowBuilderAgent: { id: 'workflow-builder' },
}));

vi.mock('../tools/web-search.js', () => ({
  getConfiguredWebToolsProvider: mocks.getConfiguredWebToolsProvider,
}));

import { registerWorkflowBuilderPrimitives } from './register-primitives.js';

describe('registerWorkflowBuilderPrimitives', () => {
  it('registers the configured provider with the existing workflow tool IDs', async () => {
    const searchTool = { id: 'web-search' };
    const extractTool = { id: 'web-extract' };
    mocks.getConfiguredWebToolsProvider.mockReturnValueOnce({
      id: 'parallel',
      createSearchTool: () => searchTool,
      createExtractTool: () => extractTool,
    });
    const mastra = {
      addAgent: vi.fn(),
      addTool: vi.fn(),
      getStorage: vi.fn(() => undefined),
    };

    await registerWorkflowBuilderPrimitives(mastra as any, {
      projectPath: '/tmp/project',
      codeAgent: { id: 'code-agent' } as any,
    });

    expect(mastra.addTool).toHaveBeenCalledWith(searchTool, 'web-search');
    expect(mastra.addTool).toHaveBeenCalledWith(extractTool, 'web-extract');
  });

  it('does not register model-locked web tools without an external provider', async () => {
    mocks.getConfiguredWebToolsProvider.mockReturnValueOnce(undefined);
    const mastra = {
      addAgent: vi.fn(),
      addTool: vi.fn(),
      getStorage: vi.fn(() => undefined),
    };

    await registerWorkflowBuilderPrimitives(mastra as any, {
      projectPath: '/tmp/project',
      codeAgent: { id: 'code-agent' } as any,
    });

    expect(mastra.addTool).not.toHaveBeenCalled();
  });
});
