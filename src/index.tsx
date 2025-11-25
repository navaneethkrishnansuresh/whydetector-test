/**
 * BrainDriveWhyDetector Entry Point
 */

import React from 'react';
import BrainDriveWhyDetector from './BrainDriveWhyDetector';

// Export the component
export default BrainDriveWhyDetector;

// Export named for Module Federation
export { BrainDriveWhyDetector };

// Plugin metadata
export const metadata = {
  name: 'BrainDriveWhyDetector',
  version: '1.0.0',
  description: 'Find Your Why - Multi-agent coaching flow to discover your core purpose'
};

// Development mode rendering
if (process.env.NODE_ENV === 'development') {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    const ReactDOM = require('react-dom/client');
    
    // Mock services for development
    const mockServices = {
      api: {
        get: async (url: string) => {
          console.log('Mock API GET:', url);
          if (url.includes('all-models')) {
            return {
              models: [
                { name: 'llama3.2', provider: 'ollama', server_name: 'Local', server_id: 'local' }
              ]
            };
          }
          if (url.includes('auth/me')) {
            return { id: 'dev-user' };
          }
          return {};
        },
        post: async (url: string, data: any) => {
          console.log('Mock API POST:', url, data);
          return { message: { content: 'Mock response' } };
        },
        postStreaming: async (url: string, data: any, onChunk: (chunk: string) => void) => {
          console.log('Mock API POST Streaming:', url);
          const mockResponse = "This is a mock streaming response for development.";
          for (const char of mockResponse) {
            await new Promise(r => setTimeout(r, 20));
            onChunk(char);
          }
          return {};
        },
        put: async () => ({}),
        delete: async () => ({})
      },
      theme: {
        getCurrentTheme: () => 'light',
        addThemeChangeListener: () => {},
        removeThemeChangeListener: () => {}
      },
      settings: {
        get: () => null,
        set: async () => {}
      }
    };

    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <div style={{ height: '100vh', padding: '20px', boxSizing: 'border-box' }}>
          <BrainDriveWhyDetector services={mockServices} />
        </div>
      </React.StrictMode>
    );
  }
}
