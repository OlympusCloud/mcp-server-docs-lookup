/**
 * Prompt Handler - Manages MCP prompts
 */
import { ServiceManager } from './service-manager';

enum PromptName {
  EXPLAIN_CODE = "explain_code",
  WRITE_DOCUMENTATION = "write_documentation", 
  CODE_EXAMPLE = "code_example",
}

export class PromptHandler {
  constructor(private serviceManager: ServiceManager) {}

  listPrompts() {
    return {
      prompts: [
        {
          name: PromptName.EXPLAIN_CODE,
          description: "Generate detailed explanations for code using documentation context",
          arguments: [
            {
              name: "code",
              description: "Code snippet to explain",
              required: true,
            },
            {
              name: "language",
              description: "Programming language",
              required: false,
            },
          ],
        },
        {
          name: PromptName.WRITE_DOCUMENTATION,
          description: "Generate comprehensive documentation using existing docs as reference",
          arguments: [
            {
              name: "topic",
              description: "Topic or feature to document",
              required: true,
            },
            {
              name: "framework",
              description: "Framework context",
              required: false,
            },
          ],
        },
        {
          name: PromptName.CODE_EXAMPLE,
          description: "Generate code examples using documentation patterns",
          arguments: [
            {
              name: "task",
              description: "Programming task description",
              required: true,
            },
            {
              name: "language",
              description: "Programming language",
              required: true,
            },
          ],
        },
      ],
    };
  }

  async getPrompt(params: { name: string; arguments?: any }) {
    const { name, arguments: args } = params;

    switch (name) {
      case PromptName.EXPLAIN_CODE:
        return await this.handleExplainCode(args);
      case PromptName.WRITE_DOCUMENTATION:
        return await this.handleWriteDocumentation(args);
      case PromptName.CODE_EXAMPLE:
        return await this.handleCodeExample(args);
      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  }

  private async handleExplainCode(args: any) {
    const { code, language } = args || {};
    if (!code) {
      throw new Error("Code parameter is required");
    }

    const contextGenerator = this.serviceManager.getContextGenerator();
    const context = await contextGenerator.generateContext({
      task: `Explain this ${language || ''} code: ${code.substring(0, 100)}...`,
      language,
    });

    const contextText = context.chunks
      .map(chunk => `${chunk.repository}/${chunk.filepath}:\n${chunk.content}`)
      .join('\n\n---\n\n');

    return {
      description: `Explain ${language || ''} code with documentation context`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please explain this ${language || ''} code using the provided documentation context:\n\n\`\`\`${language || ''}\n${code}\n\`\`\`\n\n**Documentation Context:**\n${contextText}`,
          },
        },
      ],
    };
  }

  private async handleWriteDocumentation(args: any) {
    const { topic, framework } = args || {};
    if (!topic) {
      throw new Error("Topic parameter is required");
    }

    const contextGenerator = this.serviceManager.getContextGenerator();
    const context = await contextGenerator.generateContext({
      task: `Write documentation for ${topic}`,
      framework,
    });

    const contextText = context.chunks
      .map(chunk => `${chunk.repository}/${chunk.filepath}:\n${chunk.content}`)
      .join('\n\n---\n\n');

    return {
      description: `Write documentation for ${topic}`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please write comprehensive documentation for "${topic}" using the style and patterns from the provided documentation context:\n\n**Documentation Context:**\n${contextText}`,
          },
        },
      ],
    };
  }

  private async handleCodeExample(args: any) {
    const { task, language } = args || {};
    if (!task) {
      throw new Error("Task parameter is required");
    }
    if (!language) {
      throw new Error("Language parameter is required");
    }

    const contextGenerator = this.serviceManager.getContextGenerator();
    const context = await contextGenerator.generateContext({
      task: `${language} code example for ${task}`,
      language,
    });

    const contextText = context.chunks
      .map(chunk => `${chunk.repository}/${chunk.filepath}:\n${chunk.content}`)
      .join('\n\n---\n\n');

    return {
      description: `Generate ${language} code example for ${task}`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please generate a ${language} code example for "${task}" using the patterns and examples from the provided documentation:\n\n**Documentation Context:**\n${contextText}`,
          },
        },
      ],
    };
  }
}
