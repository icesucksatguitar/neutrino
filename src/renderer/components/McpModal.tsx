import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot,
  X,
  Sparkles,
  Cpu,
  Wrench,
  RefreshCw,
  Send,
  Play,
  Share2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Move,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { TabState } from '../types';
import { withAssistantMarker } from '../../main/passwords/webviewMarker';
import { DEFAULT_PARTITION } from '../../main/profiles/partition';

interface McpModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab?: TabState;
  onNavigate?: (url: string) => void;
  initialTab?: McpTab;
  /** Session partition of the active profile; assistant webviews load in it. */
  partition?: string;
}

/** Fallback when no profile partition is passed (the default profile's session). */
const DEFAULT_ASSISTANT_PARTITION = DEFAULT_PARTITION;

/** Assistant webviews keep their existing preferences plus the marker that skips the password preload. */
const ASSISTANT_WEBPREFERENCES = withAssistantMarker('contextIsolation=yes,nodeIntegration=no');

type McpTab = 'assistants' | 'local' | 'tools';
type AssistantProvider = 'claude' | 'chatgpt' | 'gemini' | 'deepseek' | 'perplexity';

interface AssistantConfig {
  id: AssistantProvider;
  name: string;
  url: string;
  color: string;
}

const ASSISTANTS: AssistantConfig[] = [
  {
    id: 'claude',
    name: 'Claude',
    url: 'https://claude.ai',
    color: '#d97706',
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    url: 'https://chatgpt.com',
    color: '#10b981',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    url: 'https://gemini.google.com',
    color: '#2563eb',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    url: 'https://chat.deepseek.com',
    color: '#06b6d4',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    url: 'https://www.perplexity.ai',
    color: '#A1A1AA',
  },
];

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const McpModal: React.FC<McpModalProps> = ({
  isOpen,
  onClose,
  activeTab,
  onNavigate,
  initialTab,
  partition = DEFAULT_ASSISTANT_PARTITION,
}) => {
  const [activeTabType, setActiveTabType] = useState<McpTab>(initialTab || 'assistants');

  useEffect(() => {
    if (initialTab && isOpen) {
      setActiveTabType(initialTab);
    }
  }, [initialTab, isOpen]);

  // Assistants state
  const [selectedAssistant, setSelectedAssistant] = useState<AssistantProvider>('claude');
  const assistantWebviewRef = useRef<any>(null);

  // Local Models state
  const [isScanning, setIsScanning] = useState(false);
  const [ollamaOnline, setOllamaOnline] = useState(false);
  const [lmStudioOnline, setLmStudioOnline] = useState(false);
  const [availableModels, setAvailableModels] = useState<{ name: string; runtime: 'ollama' | 'lmstudio' }[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Tools state
  const [logs, setLogs] = useState<any[]>([]);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Personalized time-based greeting for Yash (Claude serif italic)
  const getGreeting = useCallback((): string => {
    const hour = new Date().getHours();
    let name = 'Yash';
    try {
      const stored = localStorage.getItem('neutrino_user_name');
      if (stored) name = stored;
      else {
        const profile = localStorage.getItem('neutrino_user_profile');
        if (profile) {
          const parsed = JSON.parse(profile);
          if (parsed.name) name = parsed.name;
        }
      }
    } catch { }
    if (hour >= 0 && hour < 12) {
      return `Good morning, ${name}`;
    } else if (hour >= 12 && hour < 17) {
      return `Good afternoon, ${name}`;
    } else {
      return `Good evening, ${name}`;
    }
  }, []);

  const [greeting, setGreeting] = useState<string>(getGreeting);

  useEffect(() => {
    setGreeting(getGreeting());
    const interval = setInterval(() => {
      setGreeting(getGreeting());
    }, 20000);
    return () => clearInterval(interval);
  }, [getGreeting]);

  // Draggable & Resizable Window State (Comfortable compact width & height)
  const defaultWidth = Math.min(640, Math.max(420, window.innerWidth - 40));
  const defaultHeight = Math.min(680, window.innerHeight - 84);
  const defaultTop = 48;
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: defaultWidth,
    height: defaultHeight,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; initialX: number; initialY: number }>({
    mouseX: 0,
    mouseY: 0,
    initialX: 0,
    initialY: 0,
  });
  const resizeStartRef = useRef<{ mouseX: number; mouseY: number; initialW: number; initialH: number }>({
    mouseX: 0,
    mouseY: 0,
    initialW: 0,
    initialH: 0,
  });
  const rafFrameRef = useRef<number | null>(null);

  // Reset to default right-anchored position on first open
  useEffect(() => {
    if (isOpen && position === null) {
      const initialX = Math.max(20, window.innerWidth - size.width - 24);
      setPosition({ x: initialX, y: defaultTop });
    }
  }, [isOpen, size.width, position]);

  // Handle Dragging via Header (Pointer Events + capture + RAF)
  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select')) {
      return;
    }
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events without active pointerId
    }
    setIsDragging(true);
    const curX = position ? position.x : Math.max(20, window.innerWidth - size.width - 24);
    const curY = position ? position.y : defaultTop;
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialX: curX,
      initialY: curY,
    };
  };

  // Handle Corner Resizing
  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events without active pointerId
    }
    setIsResizing(true);
    resizeStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialW: size.width,
      initialH: size.height,
    };
  };

  // Drag and Resize event listeners
  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (rafFrameRef.current !== null) {
        cancelAnimationFrame(rafFrameRef.current);
      }
      const clientX = e.clientX;
      const clientY = e.clientY;
      rafFrameRef.current = requestAnimationFrame(() => {
        rafFrameRef.current = null;
        if (isDragging) {
          const dx = clientX - dragStartRef.current.mouseX;
          const dy = clientY - dragStartRef.current.mouseY;
          const newX = Math.max(10, Math.min(window.innerWidth - size.width - 10, dragStartRef.current.initialX + dx));
          const newY = Math.max(10, Math.min(window.innerHeight - 80, dragStartRef.current.initialY + dy));
          setPosition({ x: newX, y: newY });
        } else if (isResizing) {
          const dx = clientX - resizeStartRef.current.mouseX;
          const dy = clientY - resizeStartRef.current.mouseY;
          const newW = Math.max(360, Math.min(window.innerWidth - (position?.x || 0) - 10, resizeStartRef.current.initialW + dx));
          const newH = Math.max(400, Math.min(window.innerHeight - (position?.y || 0) - 10, resizeStartRef.current.initialH + dy));
          setSize({ width: newW, height: newH });
        }
      });
    };

    const handlePointerUp = () => {
      if (rafFrameRef.current !== null) {
        cancelAnimationFrame(rafFrameRef.current);
        rafFrameRef.current = null;
      }
      setIsDragging(false);
      setIsResizing(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      if (rafFrameRef.current !== null) {
        cancelAnimationFrame(rafFrameRef.current);
        rafFrameRef.current = null;
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDragging, isResizing, size.width, size.height, position?.x, position?.y]);

  // Scan local runtimes (Ollama & LM Studio)
  const scanLocalRuntimes = async () => {
    setIsScanning(true);
    const modelsFound: { name: string; runtime: 'ollama' | 'lmstudio' }[] = [];

    // 1. Check Ollama (http://localhost:11434/api/tags)
    try {
      const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(1800) });
      if (res.ok) {
        const data = await res.json();
        setOllamaOnline(true);
        if (Array.isArray(data.models)) {
          for (const m of data.models) {
            modelsFound.push({ name: m.name || m.model, runtime: 'ollama' });
          }
        }
      } else {
        setOllamaOnline(false);
      }
    } catch {
      setOllamaOnline(false);
    }

    // 2. Check LM Studio (http://localhost:1234/v1/models)
    try {
      const res = await fetch('http://localhost:1234/v1/models', { signal: AbortSignal.timeout(1800) });
      if (res.ok) {
        const data = await res.json();
        setLmStudioOnline(true);
        if (Array.isArray(data.data)) {
          for (const m of data.data) {
            modelsFound.push({ name: m.id, runtime: 'lmstudio' });
          }
        }
      } else {
        setLmStudioOnline(false);
      }
    } catch {
      setLmStudioOnline(false);
    }

    setAvailableModels(modelsFound);
    if (modelsFound.length > 0 && !selectedModel) {
      setSelectedModel(modelsFound[0].name);
    }
    setIsScanning(false);
  };

  useEffect(() => {
    if (isOpen) {
      scanLocalRuntimes();
    }
  }, [isOpen]);

  // Fetch MCP Logs
  useEffect(() => {
    if (!isOpen || activeTabType !== 'tools') return;
    const fetchLogs = async () => {
      if (window.neutrino?.getMcpLogs) {
        const history = await window.neutrino.getMcpLogs();
        setLogs(history || []);
      }
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 1500);
    return () => clearInterval(interval);
  }, [isOpen, activeTabType]);

  // Send message to local model with streaming response
  const handleSendLocalChat = async () => {
    const text = userInput.trim();
    if (!text || isGenerating || !selectedModel) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    const nextMessages = [...chatMessages, userMsg];
    setChatMessages(nextMessages);
    setUserInput('');
    setIsGenerating(true);

    const modelObj = availableModels.find((m) => m.name === selectedModel);
    const runtime = modelObj?.runtime || 'ollama';

    const assistantMsg: ChatMessage = { role: 'assistant', content: '' };
    setChatMessages([...nextMessages, assistantMsg]);

    try {
      if (runtime === 'ollama') {
        const res = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: selectedModel,
            prompt: text,
            stream: true,
          }),
        });

        if (!res.body) throw new Error('No streaming response from Ollama');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let full = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.response) {
                full += parsed.response;
                setChatMessages([...nextMessages, { role: 'assistant', content: full }]);
              }
            } catch {
              // ignore partial chunk
            }
          }
        }
      } else {
        // LM Studio (OpenAI-compatible)
        const res = await fetch('http://localhost:1234/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: selectedModel,
            messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
            stream: true,
          }),
        });

        if (!res.body) throw new Error('No streaming response from LM Studio');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let full = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));
          for (const line of lines) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(dataStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                full += delta;
                setChatMessages([...nextMessages, { role: 'assistant', content: full }]);
              }
            } catch {
              // ignore partial chunk
            }
          }
        }
      }
    } catch (err: any) {
      setChatMessages([
        ...nextMessages,
        { role: 'assistant', content: `Error communicating with ${runtime}: ${err.message}` },
      ]);
    } finally {
      setIsGenerating(false);
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Send current active page to the AI assistant
  const handleSendCurrentPage = () => {
    if (!activeTab?.url) return;
    const info = `Current Page: ${activeTab.title} (${activeTab.url})`;
    navigator.clipboard.writeText(info);
    if (assistantWebviewRef.current) {
      assistantWebviewRef.current.executeJavaScript(`
        const el = document.querySelector('textarea, div[contenteditable="true"]');
        if (el) {
          el.focus();
          document.execCommand('insertText', false, ${JSON.stringify(info + '\n\n')});
        }
      `).catch(() => { });
    }
  };

  const handleTestTool = async (toolName: string, args: any) => {
    if (!window.neutrino?.callMcp) return;
    try {
      const res = await window.neutrino.callMcp('tools/call', { name: toolName, arguments: args });
      setTestResult(JSON.stringify(res, null, 2));
    } catch (err: any) {
      setTestResult(`Error: ${err.message}`);
    }
  };

  if (!isOpen) return null;

  const currentAssistant = ASSISTANTS.find((a) => a.id === selectedAssistant) || ASSISTANTS[0];
  const posX = position ? position.x : Math.max(20, window.innerWidth - size.width - 24);
  const posY = position ? position.y : defaultTop;

  return (
    <>
      {/* Non-blocking semi-transparent ambient backdrop */}
      <div className="mcp-drawer-overlay floating-backdrop" onClick={onClose} />

      {/* Right-Anchored, Moveable & Resizable AI Panel */}
      <aside
        className={`mcp-drawer floating-panel ${isDragging ? 'is-dragging' : ''} ${isResizing ? 'is-resizing' : ''}`}
        style={{
          position: 'fixed',
          left: `${posX}px`,
          top: `${posY}px`,
          width: `${size.width}px`,
          height: `${size.height}px`,
          right: 'auto',
          bottom: 'auto',
          zIndex: 10100,
        }}
      >
        {/* Header - Interactive Drag Grip */}
        <div
          className="mcp-drawer-header draggable-header"
          onPointerDown={handleHeaderPointerDown}
          title="Click and drag to move panel"
        >
          <div className="mcp-drawer-title-group">
            <Move size={15} className="mcp-drag-grip-icon" />
            <Bot size={20} style={{ color: 'var(--accent)' }} />
            <h2 className="mcp-drawer-title">AI & MCP Platform</h2>
            {availableModels.length > 0 && (
              <span className="mcp-runtime-badge-pill">
                ● {availableModels.length} local
              </span>
            )}
          </div>

          <div className="mcp-header-actions">
            <button
              type="button"
              className="mcp-drawer-header-btn"
              onClick={() => {
                setPosition({ x: Math.max(20, window.innerWidth - defaultWidth - 24), y: defaultTop });
                setSize({ width: defaultWidth, height: defaultHeight });
              }}
              title="Reset Position"
            >
              <Minimize2 size={14} />
            </button>
            <button
              className="mcp-drawer-close-btn"
              onClick={onClose}
              title="Close Panel"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Personalized Time-Based Greeting for Yash */}
        <div className="mcp-greeting-banner">
          <span className="mcp-greeting-text">{greeting}</span>
        </div>

        {/* Modern Segmented Tab Slider */}
        <div className="mcp-tab-slider-wrap">
          <div className="mcp-tab-slider-track">
            {/* Sliding Pill Indicator */}
            <div
              className="mcp-tab-slider-pill"
              style={{
                transform: `translateX(${activeTabType === 'assistants' ? '0%' : activeTabType === 'local' ? '100%' : '200%'
                  })`,
              }}
            />
            <button
              type="button"
              className={`mcp-slider-tab-btn ${activeTabType === 'assistants' ? 'active' : ''}`}
              onClick={() => setActiveTabType('assistants')}
            >
              <Sparkles size={13} />
              <span>Assistants</span>
            </button>
            <button
              type="button"
              className={`mcp-slider-tab-btn ${activeTabType === 'local' ? 'active' : ''}`}
              onClick={() => setActiveTabType('local')}
            >
              <Cpu size={13} />
              <span>Local models</span>
            </button>
            <button
              type="button"
              className={`mcp-slider-tab-btn ${activeTabType === 'tools' ? 'active' : ''}`}
              onClick={() => setActiveTabType('tools')}
            >
              <Wrench size={13} />
              <span>Tools</span>
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        <div className="mcp-drawer-body">
          {/* TAB 1: ASSISTANTS (Claude, ChatGPT, Gemini) */}
          {activeTabType === 'assistants' && (
            <div className="assistant-container">
              {/* Provider Switcher */}
              <div className="assistant-provider-selector">
                {ASSISTANTS.map((asst) => (
                  <button
                    key={asst.id}
                    type="button"
                    className={`assistant-chip ${selectedAssistant === asst.id ? 'selected' : ''}`}
                    onClick={() => setSelectedAssistant(asst.id)}
                    title={`Switch to ${asst.name}`}
                  >
                    <span className="assistant-chip-dot" style={{ backgroundColor: asst.color }}>●</span>
                    <span className="assistant-chip-name">{asst.name}</span>
                  </button>
                ))}

                <button
                  type="button"
                  className="assistant-chip local-switch-btn"
                  onClick={() => setActiveTabType('local')}
                  title="Switch to Local Models (Ollama / LM Studio)"
                >
                  <Cpu size={12} style={{ color: '#10B981' }} />
                  <span>Local</span>
                </button>

                <div className="assistant-spacer" />

                {activeTab?.url && (
                  <button
                    type="button"
                    className="assistant-action-chip"
                    onClick={handleSendCurrentPage}
                    title="Send active tab URL and title to assistant"
                  >
                    <Share2 size={12} />
                    <span>Send Tab</span>
                  </button>
                )}

                <button
                  type="button"
                  className="assistant-action-chip assistant-action-icon-only"
                  onClick={() => onNavigate?.(currentAssistant.url)}
                  title="Open in active browser tab"
                  aria-label="Open in active browser tab"
                >
                  <ExternalLink size={12} />
                </button>
              </div>

              {/* Embedded Assistant Webview */}
              <div
                className="assistant-webview-frame"
                style={{ pointerEvents: isDragging || isResizing ? 'none' : 'auto' }}
              >
                {React.createElement('webview', {
                  // The partition is part of the key: Electron fixes a webview's
                  // session at attach time, so a profile change must remount it.
                  key: `assistant-webview|${partition}`,
                  ref: assistantWebviewRef,
                  src: currentAssistant.url,
                  partition,
                  className: 'assistant-webview',
                  allowpopups: 'true',
                  webpreferences: ASSISTANT_WEBPREFERENCES,
                })}
              </div>
            </div>
          )}

          {/* TAB 2: LOCAL MODELS (Ollama & LM Studio with streaming responses) */}
          {activeTabType === 'local' && (
            <div className="local-models-container">
              {/* Runtime Status & Model Selector */}
              <div className="local-runtime-status-bar">
                <div className="runtime-pills-row">
                  <div className={`runtime-indicator ${ollamaOnline ? 'online' : 'offline'}`} title="Ollama API (port 11434)">
                    <span className="runtime-dot" />
                    <span className="runtime-name">Ollama</span>
                    <span className="runtime-state-tag">{ollamaOnline ? '11434' : 'offline'}</span>
                  </div>
                  <div className={`runtime-indicator ${lmStudioOnline ? 'online' : 'offline'}`} title="LM Studio API (port 1234)">
                    <span className="runtime-dot" />
                    <span className="runtime-name">LM Studio</span>
                    <span className="runtime-state-tag">{lmStudioOnline ? '1234' : 'offline'}</span>
                  </div>
                  <button
                    type="button"
                    className="refresh-runtimes-btn"
                    onClick={scanLocalRuntimes}
                    disabled={isScanning}
                    title="Rescan local runtimes (ports 11434 & 1234)"
                  >
                    <RefreshCw size={12} className={isScanning ? 'spinning' : ''} />
                    <span>{isScanning ? 'Scanning...' : 'Scan'}</span>
                  </button>
                </div>

                {availableModels.length > 0 && (
                  <div className="model-selector-row">
                    <label htmlFor="model-select">Model:</label>
                    <select
                      id="model-select"
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="model-select-dropdown"
                    >
                      {availableModels.map((m) => (
                        <option key={m.name} value={m.name}>
                          {m.name} ({m.runtime})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Chat View */}
              {availableModels.length === 0 ? (
                <div className="no-runtime-card">
                  <div className="no-runtime-icon-wrap">
                    <AlertCircle size={24} />
                  </div>
                  <h4 className="no-runtime-title">No local models detected</h4>
                  <p className="no-runtime-desc">
                    Start <strong>Ollama</strong> (port 11434) or <strong>LM Studio</strong> (port 1234) with local server enabled, then click <strong>Scan</strong>.
                  </p>
                </div>
              ) : (
                <div className="local-chat-thread">
                  <div className="local-chat-messages">
                    {chatMessages.length === 0 ? (
                      <div className="chat-empty-hint">
                        Start chatting with {selectedModel}. Responses are generated entirely locally on your device.
                      </div>
                    ) : (
                      chatMessages.map((msg, i) => (
                        <div key={i} className={`chat-bubble ${msg.role}`}>
                          <div className="bubble-author">
                            {msg.role === 'user' ? 'You' : selectedModel}
                          </div>
                          <div className="bubble-content">{msg.content}</div>
                        </div>
                      ))
                    )}
                    <div ref={chatBottomRef} />
                  </div>

                  {/* Input row */}
                  <form
                    className="local-chat-input-bar"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendLocalChat();
                    }}
                  >
                    <input
                      type="text"
                      className="local-chat-input"
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      placeholder={`Ask ${selectedModel}...`}
                      disabled={isGenerating}
                    />
                    <button
                      type="submit"
                      className="local-chat-send-btn"
                      disabled={isGenerating || !userInput.trim()}
                    >
                      <Send size={14} />
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TOOLS (Native MCP Server Tools & Live Protocol Logs) */}
          {activeTabType === 'tools' && (
            <div className="tools-tab-container">
              {/* Server Status Header */}
              <div
                style={{
                  background: 'var(--bg-subtle, rgba(0,0,0,0.03))',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px 14px',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <CheckCircle2 size={18} style={{ color: 'var(--shield-green, #10b981)' }} />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                    Native MCP Server Active
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    JSON-RPC 2.0 interface listening on standard protocol pipes.
                  </div>
                </div>
              </div>

              {/* Registered Tools */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Registered MCP Tools
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {[
                    { name: 'browser_navigate', desc: 'Load web URL into target or active tab' },
                    { name: 'browser_list_tabs', desc: 'List all open tabs, status, and spaces' },
                    { name: 'browser_create_tab', desc: 'Open a new tab in target space' },
                    { name: 'browser_close_tab', desc: 'Close specific tab by ID' },
                    { name: 'browser_get_adblock_stats', desc: 'Get shield blocked tracker stats' },
                    { name: 'browser_zen_optimize', desc: 'Hibernate inactive background tabs' },
                    { name: 'browser_media_control', desc: 'Control active media playback & PiP' },
                  ].map((tool) => (
                    <div key={tool.name} className="tool-card">
                      <div>
                        <div className="tool-name">{tool.name}</div>
                        <div className="tool-desc">{tool.desc}</div>
                      </div>
                      <button
                        className="tool-run-btn"
                        onClick={() => handleTestTool(tool.name, {})}
                        title="Run Tool Test"
                      >
                        <Play size={10} />
                        <span>Test</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Test Output if any */}
              {testResult && (
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Tool Execution Output:
                  </div>
                  <pre className="logs-pre" style={{ color: 'var(--accent)' }}>
                    {testResult}
                  </pre>
                </div>
              )}

              {/* Recent Protocol Calls Feed */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Recent Protocol Calls
                </div>
                <div className="logs-pre">
                  {logs.length === 0 ? (
                    <div style={{ color: 'var(--text-dim, #888)', textAlign: 'center', padding: '8px' }}>
                      No protocol calls logged yet. Listening on JSON-RPC.
                    </div>
                  ) : (
                    logs.map((log, i) => (
                      <div
                        key={i}
                        style={{ color: log.direction === 'in' ? '#2563eb' : '#15803d', marginBottom: '2px' }}
                      >
                        [{log.direction.toUpperCase()}] {log.method || 'result'}: {JSON.stringify(log.data)}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Fixed Bottom Circular Icon Dock */}
        <div className="mcp-bottom-dock">
          <div className="mcp-bottom-dock-inner">
            <button
              className={`mcp-dock-circle-btn ${activeTabType === 'assistants' ? 'active' : ''}`}
              onClick={() => setActiveTabType('assistants')}
              title="Assistants"
              aria-label="Assistants"
            >
              <Sparkles size={17} />
            </button>
            <button
              className={`mcp-dock-circle-btn ${activeTabType === 'local' ? 'active' : ''}`}
              onClick={() => setActiveTabType('local')}
              title="Local models"
              aria-label="Local models"
            >
              <Cpu size={17} />
            </button>
            <button
              className={`mcp-dock-circle-btn ${activeTabType === 'tools' ? 'active' : ''}`}
              onClick={() => setActiveTabType('tools')}
              title="Tools"
              aria-label="Tools"
            >
              <Wrench size={17} />
            </button>
          </div>
        </div>

        {/* Interactive Bottom-Right Resize Grip Handle */}
        <div
          className="mcp-resize-handle"
          onPointerDown={handleResizePointerDown}
          title="Drag to resize panel"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M9 1L1 9M9 5L5 9M9 9L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </aside>
    </>
  );
};
