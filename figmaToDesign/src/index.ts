#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { WebToFigmaConverter } from './converters/web-to-figma.js';
import { CodeToFigmaConverter } from './converters/code-to-figma.js';
import { FigmaApiClient } from './figma/api-client.js';
import { H2DFile, validateH2DFile } from './types/h2d-format.js';

class HtmlToDesignMcpServer {
  private server: Server;
  private webConverter: WebToFigmaConverter;
  private codeConverter: CodeToFigmaConverter;
  private figmaClient: FigmaApiClient;

  constructor() {
    this.server = new Server(
      {
        name: 'html-to-design-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.webConverter = new WebToFigmaConverter();
    this.codeConverter = new CodeToFigmaConverter();
    this.figmaClient = new FigmaApiClient();

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupToolHandlers() {
    // 列出所有可用工具
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'import_web_to_figma',
          description: '从网页 URL 导入并转换为 Figma 设计稿。支持设置视口大小和主题。',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: '要导入的网页 URL',
              },
              viewport: {
                type: 'object',
                description: '视口设置',
                properties: {
                  width: {
                    type: 'number',
                    description: '视口宽度（像素）',
                    default: 1440,
                  },
                  height: {
                    type: 'number',
                    description: '视口高度（像素）',
                    default: 900,
                  },
                },
              },
              theme: {
                type: 'string',
                enum: ['light', 'dark'],
                description: '主题模式：light 或 dark',
                default: 'light',
              },
              outputPath: {
                type: 'string',
                description: '输出 Figma JSON 文件的路径（可选）',
              },
            },
            required: ['url'],
          },
        },
        {
          name: 'import_code_to_figma',
          description: '从 HTML + CSS 代码导入并转换为 Figma 设计稿',
          inputSchema: {
            type: 'object',
            properties: {
              html: {
                type: 'string',
                description: 'HTML 代码',
              },
              css: {
                type: 'string',
                description: 'CSS 代码（可选）',
              },
              viewport: {
                type: 'object',
                description: '视口设置',
                properties: {
                  width: {
                    type: 'number',
                    description: '视口宽度（像素）',
                    default: 1440,
                  },
                  height: {
                    type: 'number',
                    description: '视口高度（像素）',
                    default: 900,
                  },
                },
              },
              outputPath: {
                type: 'string',
                description: '输出 Figma JSON 文件的路径（可选）',
              },
            },
            required: ['html'],
          },
        },
        {
          name: 'create_figma_file',
          description: '使用 Figma API 创建新的设计文件（需要 Figma Access Token）',
          inputSchema: {
            type: 'object',
            properties: {
              figmaJson: {
                type: 'string',
                description: 'Figma JSON 数据（从 import_web_to_figma 或 import_code_to_figma 获取）',
              },
              fileName: {
                type: 'string',
                description: 'Figma 文件名称',
                default: 'Imported Design',
              },
              teamId: {
                type: 'string',
                description: 'Figma 团队 ID（可选，如果不提供则创建到个人文件）',
              },
              accessToken: {
                type: 'string',
                description: 'Figma Personal Access Token（如果未设置环境变量）',
              },
            },
            required: ['figmaJson'],
          },
        },
        {
          name: 'import_h2d_file',
          description: '从 .h2d 文件导入并转换为 Figma 设计稿（浏览器扩展捕获的文件）',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: {
                type: 'string',
                description: '.h2d 文件路径',
              },
              outputPath: {
                type: 'string',
                description: '输出 Figma JSON 文件的路径（可选）',
              },
            },
            required: ['filePath'],
          },
        },
      ],
    }));

    // 处理工具调用
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'import_web_to_figma': {
            const url = args?.url as string;
            const viewport = (args?.viewport as any) || { width: 1440, height: 900 };
            const theme = (args?.theme as string) || 'light';
            const outputPath = args?.outputPath as string | undefined;

            const result = await this.webConverter.convert(url, {
              viewport,
              theme,
            });

            if (outputPath) {
              const fs = await import('fs/promises');
              await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      message: '网页已成功转换为 Figma 格式',
                      figmaJson: result,
                      outputPath: outputPath || '未保存到文件',
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'import_code_to_figma': {
            const html = args?.html as string;
            const css = (args?.css as string) || '';
            const viewport = (args?.viewport as any) || { width: 1440, height: 900 };
            const outputPath = args?.outputPath as string | undefined;

            const result = await this.codeConverter.convert(html, css, {
              viewport,
            });

            if (outputPath) {
              const fs = await import('fs/promises');
              await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      message: '代码已成功转换为 Figma 格式',
                      figmaJson: result,
                      outputPath: outputPath || '未保存到文件',
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'create_figma_file': {
            const figmaJson = args?.figmaJson as string;
            const fileName = (args?.fileName as string) || 'Imported Design';
            const teamId = args?.teamId as string | undefined;
            const accessToken = (args?.accessToken as string) || process.env.FIGMA_ACCESS_TOKEN;

            if (!accessToken) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                '需要 Figma Access Token。请设置环境变量 FIGMA_ACCESS_TOKEN 或在参数中提供 accessToken'
              );
            }

            const jsonData = typeof figmaJson === 'string' ? JSON.parse(figmaJson) : figmaJson;
            const fileUrl = await this.figmaClient.createFile(jsonData, fileName, teamId, accessToken);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      message: 'Figma 文件已创建',
                      fileUrl,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'import_h2d_file': {
            const filePath = args?.filePath as string;
            const outputPath = args?.outputPath as string | undefined;

            // 读取 .h2d 文件
            const fs = await import('fs/promises');
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const h2dData = JSON.parse(fileContent);

            // 验证文件格式
            if (!validateH2DFile(h2dData)) {
              throw new McpError(ErrorCode.InvalidRequest, '无效的 .h2d 文件格式');
            }

            // 转换为 Figma 格式
            const result = await this.codeConverter.convert(h2dData.html, h2dData.css, {
              viewport: h2dData.viewport,
            });

            // 添加元数据
            result.metadata = h2dData.metadata;

            if (outputPath) {
              await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      message: '.h2d 文件已成功转换为 Figma 格式',
                      figmaJson: result,
                      outputPath: outputPath || '未保存到文件',
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          default:
            throw new McpError(ErrorCode.MethodNotFound, `未知工具: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `执行工具时出错: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  private setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('HTML to Design MCP 服务器已启动');
  }
}

const server = new HtmlToDesignMcpServer();
server.run().catch(console.error);
