/**
 * BrainDriveWhyDetector
 * Find Your Why - Multi-agent coaching flow
 */

import React, { Component } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import './BrainDriveWhyDetector.css';
import {
  BrainDriveWhyDetectorProps,
  BrainDriveWhyDetectorState,
  ChatMessage,
  ModelInfo,
  SessionPhase,
  SessionData,
  PHASE_ORDER,
  PHASE_LABELS,
  generateId,
  formatTimestamp
} from './types';
import { AIService } from './services';
import { INITIAL_GREETING } from './prompts';

// Initial session data
const INITIAL_SESSION_DATA: SessionData = {
  energizers: [],
  drainers: [],
  stories: [],
  patterns: [],
  whyStatement: '',
  snapshot: null
};

class BrainDriveWhyDetector extends Component<BrainDriveWhyDetectorProps, BrainDriveWhyDetectorState> {
  private aiService: AIService | null = null;
  private abortController: AbortController | null = null;
  private themeChangeListener: ((theme: string) => void) | null = null;
  private chatEndRef: React.RefObject<HTMLDivElement>;
  private inputRef: React.RefObject<HTMLTextAreaElement>;

  constructor(props: BrainDriveWhyDetectorProps) {
    super(props);
    
    this.chatEndRef = React.createRef();
    this.inputRef = React.createRef();
    
    this.state = {
      messages: [],
      inputText: '',
      isLoading: false,
      error: '',
      currentTheme: 'light',
      selectedModel: null,
      models: [],
      isLoadingModels: true,
      isStreaming: false,
      isInitializing: true,
      sessionStarted: false,
      currentPhase: 'intro',
      sessionData: { ...INITIAL_SESSION_DATA },
      showPhaseIndicator: true
    };
  }

  async componentDidMount() {
    console.log('WhyDetector: componentDidMount');
    
    // Initialize AI service
    this.aiService = new AIService(this.props.services);
    
    // Initialize theme
    this.initializeTheme();
    
    // Load models
    await this.loadModels();
    
    this.setState({ isInitializing: false });
  }

  componentWillUnmount() {
    if (this.themeChangeListener && this.props.services?.theme) {
      this.props.services.theme.removeThemeChangeListener(this.themeChangeListener);
    }
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  componentDidUpdate(_prevProps: BrainDriveWhyDetectorProps, prevState: BrainDriveWhyDetectorState) {
    // Auto-scroll when new messages
    if (this.state.messages.length !== prevState.messages.length) {
      this.scrollToBottom();
    }
  }

  private initializeTheme() {
    if (this.props.services?.theme) {
      const theme = this.props.services.theme.getCurrentTheme();
      this.setState({ currentTheme: theme });
      
      this.themeChangeListener = (newTheme: string) => {
        this.setState({ currentTheme: newTheme });
      };
      this.props.services.theme.addThemeChangeListener(this.themeChangeListener);
    }
  }

  private async loadModels() {
    console.log('WhyDetector: Loading models...');
    
    if (!this.aiService) {
      this.setState({ isLoadingModels: false, error: 'Service not initialized' });
      return;
    }

    try {
      const models = await this.aiService.fetchModels();
      console.log('WhyDetector: Models loaded:', models.length);
      
      this.setState({
        models,
        selectedModel: models.length > 0 ? models[0] : null,
        isLoadingModels: false,
        error: models.length === 0 ? 'No AI models available. Please configure a model provider.' : ''
      });
    } catch (error) {
      console.error('WhyDetector: Error loading models:', error);
      this.setState({
        isLoadingModels: false,
        error: 'Failed to load AI models'
      });
    }
  }

  private scrollToBottom() {
    this.chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  private handleStartSession = async () => {
    const { selectedModel, models } = this.state;
    
    if (!selectedModel && models.length > 0) {
      this.setState({ selectedModel: models[0] });
    }
    
    if (!selectedModel && models.length === 0) {
      this.setState({ error: 'No AI model available. Please configure a model provider.' });
      return;
    }

    this.setState({
      sessionStarted: true,
      currentPhase: 'intro',
      messages: [],
      sessionData: { ...INITIAL_SESSION_DATA }
    });

    // Send initial greeting from coach
    await this.sendCoachMessage('START_SESSION');
  };

  private sendCoachMessage = async (userMessage: string) => {
    const { selectedModel, currentPhase, sessionData, messages } = this.state;
    
    if (!this.aiService || !selectedModel) {
      this.setState({ error: 'No model selected' });
      return;
    }

    // Add user message to chat (if not START_SESSION)
    if (userMessage !== 'START_SESSION') {
      const userMsg: ChatMessage = {
        id: generateId('msg'),
        sender: 'user',
        content: userMessage,
        timestamp: new Date().toISOString(),
        phase: currentPhase
      };
      this.setState(prev => ({
        messages: [...prev.messages, userMsg]
      }));
    }

    // Create coach message placeholder
    const coachMsgId = generateId('msg');
    const coachMsg: ChatMessage = {
      id: coachMsgId,
      sender: 'coach',
      content: userMessage === 'START_SESSION' ? INITIAL_GREETING : '',
      timestamp: new Date().toISOString(),
      isStreaming: userMessage !== 'START_SESSION',
      phase: currentPhase
    };

    this.setState(prev => ({
      messages: [...prev.messages, coachMsg],
      isLoading: true,
      isStreaming: userMessage !== 'START_SESSION',
      inputText: ''
    }));

    // If START_SESSION, just show the greeting
    if (userMessage === 'START_SESSION') {
      this.setState({ isLoading: false });
      return;
    }

    // Send to AI
    this.abortController = new AbortController();

    try {
      // Build conversation history
      const history = messages.map(m => ({
        role: m.sender === 'user' ? 'user' : 'coach',
        content: m.content
      }));

      await this.aiService.sendToCoach(
        userMessage,
        currentPhase,
        sessionData,
        history,
        selectedModel,
        (chunk: string) => {
          this.setState(prev => ({
            messages: prev.messages.map(m =>
              m.id === coachMsgId
                ? { ...m, content: m.content + chunk }
                : m
            )
          }));
        },
        this.abortController
      );

      // Finalize message
      this.setState(prev => ({
        messages: prev.messages.map(m =>
          m.id === coachMsgId
            ? { ...m, isStreaming: false }
            : m
        ),
        isLoading: false,
        isStreaming: false
      }));

      // Analyze response for phase transition
      this.analyzeAndUpdatePhase(userMessage);

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // User cancelled
        this.setState(prev => ({
          messages: prev.messages.map(m =>
            m.id === coachMsgId
              ? { ...m, isStreaming: false, content: m.content + ' [Stopped]' }
              : m
          ),
          isLoading: false,
          isStreaming: false
        }));
      } else {
        console.error('WhyDetector: Error:', error);
        this.setState({
          error: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          isLoading: false,
          isStreaming: false
        });
      }
    }
  };

  private analyzeAndUpdatePhase(userMessage: string) {
    const { currentPhase, sessionData, messages } = this.state;
    
    // Simple phase progression logic
    const messageCount = messages.filter(m => m.phase === currentPhase).length;
    const userLower = userMessage.toLowerCase();
    
    let newPhase = currentPhase;
    let newSessionData = { ...sessionData };

    // Extract data from user message
    if (currentPhase === 'energy_map') {
      if (userLower.includes('energiz') || userLower.includes('love') || userLower.includes('enjoy')) {
        newSessionData.energizers = [...sessionData.energizers, userMessage.substring(0, 100)];
      }
      if (userLower.includes('drain') || userLower.includes('hate') || userLower.includes('frustrat')) {
        newSessionData.drainers = [...sessionData.drainers, userMessage.substring(0, 100)];
      }
    }

    if (currentPhase === 'deep_stories' && userMessage.length > 50) {
      newSessionData.stories = [...sessionData.stories, userMessage.substring(0, 100)];
    }

    // Phase transition logic (simplified)
    const phaseIndex = PHASE_ORDER.indexOf(currentPhase);
    
    if (currentPhase === 'intro' && messageCount >= 2) {
      newPhase = 'snapshot';
    } else if (currentPhase === 'snapshot' && messageCount >= 4) {
      newPhase = 'energy_map';
    } else if (currentPhase === 'energy_map' && 
               newSessionData.energizers.length >= 2 && 
               newSessionData.drainers.length >= 2) {
      newPhase = 'deep_stories';
    } else if (currentPhase === 'deep_stories' && newSessionData.stories.length >= 2) {
      newPhase = 'patterns';
    } else if (currentPhase === 'patterns' && messageCount >= 4) {
      newPhase = 'statement';
    } else if (currentPhase === 'statement' && messageCount >= 3) {
      newPhase = 'action';
    } else if (currentPhase === 'action' && messageCount >= 3) {
      newPhase = 'completed';
    }

    if (newPhase !== currentPhase || newSessionData !== sessionData) {
      this.setState({
        currentPhase: newPhase,
        sessionData: newSessionData
      });
    }
  }

  private handleSendMessage = () => {
    const { inputText, isLoading } = this.state;
    
    if (!inputText.trim() || isLoading) return;
    
    this.sendCoachMessage(inputText.trim());
  };

  private handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.handleSendMessage();
    }
  };

  private handleStopGeneration = () => {
    if (this.abortController) {
      this.abortController.abort();
    }
  };

  private handleModelSelect = (model: ModelInfo) => {
    this.setState({ selectedModel: model });
  };

  private dismissError = () => {
    this.setState({ error: '' });
  };

  // Render methods
  private renderWelcomeScreen() {
    const { models, isLoadingModels, error, selectedModel } = this.state;
    const hasModels = models.length > 0;

    return (
      <div className="welcome-screen">
        <div className="welcome-content">
          <div className="welcome-icon">🧭</div>
          <h2>Discover Your Why</h2>
          <p className="welcome-subtitle">
            A guided journey to understand what truly drives you
          </p>
          
          <div className="welcome-description">
            <p>
              This is a structured self-reflection session designed to help you uncover 
              your personal "Why" - the core purpose that energizes and motivates you.
            </p>
            <p>
              Through conversation, we'll explore what gives you energy, 
              what drains you, and the patterns that reveal your authentic self.
            </p>
          </div>

          <div className="welcome-disclaimer">
            <span>ℹ️</span>
            <span>
              This is not therapy or mental health treatment. It's a self-discovery tool 
              for reflection and clarity.
            </span>
          </div>

          {error && (
            <div className="welcome-error">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {!hasModels && !isLoadingModels && (
            <div className="welcome-warning">
              <span>⚠️</span>
              <span>
                No AI models available. Please configure a model provider (like Ollama) 
                in BrainDrive settings first.
              </span>
            </div>
          )}

          <button 
            className="start-btn"
            onClick={this.handleStartSession}
            disabled={isLoadingModels || !hasModels}
          >
            {isLoadingModels ? 'Loading models...' : 'Find My Why :)'}
          </button>

          <div className="welcome-time">
            ⏱️ Typically 30-60 minutes for a complete session
          </div>
        </div>
      </div>
    );
  }

  private renderHeader() {
    const { models, selectedModel, isLoadingModels, currentPhase } = this.state;
    const [showModelDropdown, setShowModelDropdown] = React.useState(false);

    return (
      <div className="why-detector-header">
        <div className="header-left">
          <span className="header-title">🧭 Why Discovery</span>
          {this.renderPhaseIndicator()}
        </div>
        
        <div className="header-right">
          <div className="model-selector">
            <button 
              className="model-selector-btn"
              onClick={() => this.setState(prev => ({ ...prev }))}
              disabled={isLoadingModels}
            >
              <span className="model-name">
                {selectedModel?.name || 'Select model'}
              </span>
              <span>▼</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  private renderPhaseIndicator() {
    const { currentPhase } = this.state;
    const currentIndex = PHASE_ORDER.indexOf(currentPhase);

    return (
      <div className="phase-indicator">
        {PHASE_ORDER.slice(0, -1).map((phase, index) => (
          <div 
            key={phase}
            className={`phase-dot ${
              index < currentIndex ? 'completed' : 
              index === currentIndex ? 'active' : ''
            }`}
            title={PHASE_LABELS[phase]}
          />
        ))}
        <span className="phase-label">{PHASE_LABELS[currentPhase]}</span>
      </div>
    );
  }

  private renderMessages() {
    const { messages } = this.state;

    return (
      <div className="why-detector-chat">
        {messages.map(message => (
          <div key={message.id} className={`chat-message ${message.sender}`}>
            <div className="message-header">
              <span className="message-sender">
                {message.sender === 'user' ? 'You' : 'Coach'}
              </span>
              <span className="message-time">{formatTimestamp(message.timestamp)}</span>
            </div>
            <div className={`message-bubble ${message.isStreaming ? 'message-streaming' : ''}`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          </div>
        ))}
        <div ref={this.chatEndRef} />
      </div>
    );
  }

  private renderInput() {
    const { inputText, isLoading, isStreaming } = this.state;

    return (
      <div className="why-detector-input">
        <div className="input-wrapper">
          <textarea
            ref={this.inputRef}
            className="input-textarea"
            value={inputText}
            onChange={e => this.setState({ inputText: e.target.value })}
            onKeyPress={this.handleKeyPress}
            placeholder="Share your thoughts..."
            disabled={isLoading}
            rows={1}
          />
        </div>
        
        {isStreaming ? (
          <button className="stop-btn" onClick={this.handleStopGeneration}>
            ⬛
          </button>
        ) : (
          <button 
            className="send-btn" 
            onClick={this.handleSendMessage}
            disabled={!inputText.trim() || isLoading}
          >
            ➤
          </button>
        )}
      </div>
    );
  }

  render() {
    const { currentTheme, isInitializing, error, sessionStarted } = this.state;

    return (
      <div className={`why-detector ${currentTheme === 'dark' ? 'dark-theme' : ''}`}>
        {error && (
          <div className="error-banner">
            <span>⚠️ {error}</span>
            <button className="error-dismiss" onClick={this.dismissError}>×</button>
          </div>
        )}

        {isInitializing ? (
          <div className="loading-container">
            <div className="loading-spinner" />
            <p>Initializing...</p>
          </div>
        ) : !sessionStarted ? (
          this.renderWelcomeScreen()
        ) : (
          <>
            {this.renderHeader()}
            {this.renderMessages()}
            {this.renderInput()}
          </>
        )}
      </div>
    );
  }
}

export default BrainDriveWhyDetector;

