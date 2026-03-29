'use strict';

/**
 * Guardian Angel Clinical Trial v2 — Tool Definitions
 *
 * Anthropic Messages API tool schemas mirroring Claude Code's core tools.
 * These are passed to the API in the `tools` parameter.
 */

const TOOL_DEFINITIONS = [
  {
    name: 'Bash',
    description:
      'Execute a bash command and return its output. Use for running scripts, ' +
      'installing packages, file operations, and system commands. The working ' +
      'directory is /workspace unless otherwise specified.',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The bash command to execute',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default 30000, max 120000)',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'Read',
    description:
      'Read the contents of a file at the given absolute path. Returns the ' +
      'file content as text. Use offset and limit for large files.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute path to the file to read',
        },
        offset: {
          type: 'number',
          description: 'Line number to start reading from (0-based)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of lines to read',
        },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'Write',
    description:
      'Write content to a file, creating it if it does not exist or ' +
      'overwriting if it does. Use for creating new files or complete rewrites.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute path to the file to write',
        },
        content: {
          type: 'string',
          description: 'The content to write to the file',
        },
      },
      required: ['file_path', 'content'],
    },
  },
  {
    name: 'Edit',
    description:
      'Make a targeted edit to an existing file by replacing old_string with ' +
      'new_string. The old_string must appear exactly once in the file.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute path to the file to edit',
        },
        old_string: {
          type: 'string',
          description: 'The exact text to find and replace',
        },
        new_string: {
          type: 'string',
          description: 'The replacement text',
        },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'Glob',
    description:
      'Find files matching a glob pattern (e.g. "**/*.js", "src/**/*.ts"). ' +
      'Returns matching file paths.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The glob pattern to match files against',
        },
        path: {
          type: 'string',
          description: 'The directory to search in (default /workspace)',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'Grep',
    description:
      'Search file contents for a regex pattern. Returns matching lines ' +
      'with file paths and line numbers.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The regex pattern to search for',
        },
        path: {
          type: 'string',
          description: 'File or directory to search in (default /workspace)',
        },
        glob: {
          type: 'string',
          description: 'Glob pattern to filter files (e.g. "*.js")',
        },
      },
      required: ['pattern'],
    },
  },
];

module.exports = { TOOL_DEFINITIONS };
