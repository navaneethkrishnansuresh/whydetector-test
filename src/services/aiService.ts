/**
 * WhyDetector AI Service
 * Handles communication with AI providers (same pattern as BrainDriveChat)
 */

import { ModelInfo, Services, SessionPhase, SessionData, CRISIS_KEYWORDS } from '../types';
import { buildCoachMessages, CRISIS_RESPONSE } from '../prompts';

// Provider settings ID map (same as BrainDriveChat)
const PROVIDER_SETTINGS_ID_MAP: Record<string, string> = {
  'ollama': 'ollama_servers_settings',
  'anthropic': 'anthropic_api_settings',
  'openai': 'openai_api_settings',
  'openrouter': 'openrouter_api_settings'
};

/**
 * Extract text from various AI response formats
 */
function extractTextFromData(data: any): string {
  if (!data) return '';
  if (typeof data === 'string') return data;

  // OpenAI format
  if (data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  }
  if (data.choices?.[0]?.delta?.content) {
    return data.choices[0].delta.content;
  }
  // Ollama format
  if (data.message?.content) {
    return data.message.content;
  }
  if (data.response) {
    return data.response;
  }
  // Generic
  if (data.content) {
    return typeof data.content === 'string' ? data.content : JSON.stringify(data.content);
  }
  if (data.text) {
    return data.text;
  }
  return '';
}

export class AIService {
  private services: Services;
  private currentUserId: string | null = null;

  constructor(services: Services) {
    this.services = services;
    this.initializeUserId();
  }

  private async initializeUserId() {
    try {
      if (this.services?.api) {
        const response = await this.services.api.get('/api/v1/auth/me');
        if (response && response.id) {
          this.currentUserId = response.id;
        }
      }
    } catch (error) {
      console.error('WhyDetector: Error getting user ID:', error);
    }
  }

  getCurrentUserId(): string | null {
    return this.currentUserId;
  }

  /**
   * Fetch available models (same pattern as BrainDriveChat)
   */
  async fetchModels(): Promise<ModelInfo[]> {
    if (!this.services?.api) {
      console.error('WhyDetector: API service not available');
      return [];
    }

    try {
      const resp = await this.services.api.get('/api/v1/ai/providers/all-models');
      const raw = resp?.models || resp?.data?.models || (Array.isArray(resp) ? resp : []);

      const models: ModelInfo[] = Array.isArray(raw)
        ? raw.map((m: any) => {
            const provider = m.provider || 'ollama';
            return {
              name: m.name || m.id || '',
              provider,
              providerId: PROVIDER_SETTINGS_ID_MAP[provider] || provider,
              serverName: m.server_name || m.serverName || 'Unknown Server',
              serverId: m.server_id || m.serverId || 'unknown',
            };
          })
        : [];

      return models;
    } catch (error) {
      console.error('WhyDetector: Error fetching models:', error);
      return [];
    }
  }

  /**
   * Check for crisis content
   */
  checkForCrisisContent(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return CRISIS_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
  }

  /**
   * Send message to coach agent
   */
  async sendToCoach(
    userMessage: string,
    phase: SessionPhase,
    sessionData: SessionData,
    conversationHistory: { role: string; content: string }[],
    selectedModel: ModelInfo,
    onChunk: (chunk: string) => void,
    abortController?: AbortController
  ): Promise<string> {
    if (!this.services?.api) {
      throw new Error('API service not available');
    }

    // Crisis check
    if (this.checkForCrisisContent(userMessage)) {
      onChunk(CRISIS_RESPONSE);
      return CRISIS_RESPONSE;
    }

    // Build messages
    const messages = buildCoachMessages(phase, sessionData, conversationHistory, userMessage);

    const endpoint = '/api/v1/ai/providers/chat';
    const requestParams: any = {
      provider: selectedModel.provider || 'ollama',
      settings_id: selectedModel.providerId || 'ollama_servers_settings',
      server_id: selectedModel.serverId,
      model: selectedModel.name,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      params: {
        temperature: 0.7,
        max_tokens: 2048
      },
      stream: true,
      user_id: this.currentUserId || 'current',
      conversation_type: 'whydetector'
    };

    let fullResponse = '';

    try {
      if (typeof this.services.api.postStreaming === 'function') {
        await this.services.api.postStreaming(
          endpoint,
          requestParams,
          (chunk: string) => {
            try {
              if (abortController?.signal.aborted) return;

              let jsonString = chunk;
              if (chunk.startsWith('data: ')) {
                jsonString = chunk.substring(6);
              }

              if (!jsonString.trim() || jsonString.trim() === '[DONE]') return;

              const data = JSON.parse(jsonString);
              const text = extractTextFromData(data);
              if (text) {
                fullResponse += text;
                onChunk(text);
              }
            } catch (e) {
              // Ignore parse errors for partial chunks
            }
          },
          {
            timeout: 120000,
            signal: abortController?.signal
          }
        );
      } else {
        // Non-streaming fallback
        const response = await this.services.api.post(endpoint, {
          ...requestParams,
          stream: false
        }, { timeout: 60000 });

        const text = extractTextFromData(response.data || response);
        if (text) {
          fullResponse = text;
          onChunk(text);
        }
      }

      return fullResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      console.error('WhyDetector: Coach error:', error);
      throw error;
    }
  }
}
