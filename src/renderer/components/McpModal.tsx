import React, { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { TabState } from '../types';

interface McpModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab?: TabState;
  onNavigate?: (url: string) => void;
}

type McpTab = 'assistants' | 'local' | 'tools';
type AssistantProvider = 'claude' | 'chatgpt' | 'gemini';

interface AssistantConfig {
  id: AssistantProvider;
  name: string;
  url: string;
  partition: string;
  color: string;
}

const ASSISTANTS: AssistantConfig[] = [
  {
    id: 'claude',
    name: 'Claude',
    url: 'https://claude.ai',
    partition: 'persist:claude',
    color: '#d97706',
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    url: 'https://chatgpt.com',
    partition: 'persist:chatgpt',
    color: '#10b981',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    url: 'https://gemini.google.com',
    partition: 'persist:gemini',
    color: '#2563eb',
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
}) => {
  const [activeTabType, setActiveTabType] = useState<McpTab>('assistants');

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

  // Scan local runtimes (Ollama & LM Studio, Section 7)
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

  // Send message to local model with streaming response (Section 7)
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

    // Assistant response container
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
      `).catch(() => {});
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

  return (
    <>
      {/* Light Backdrop */}
      <div className="mcp-drawer-overlay" onClick={onClose} />

      {/* 7. Right-Side Drawer (Assistants, Local models, Tools) */}
      <aside className="mcp-drawer">
        {/* Header */}
        <div className="mcp-drawer-header">
          <div className="mcp-drawer-title-group">
            <Bot size={22} style={{ color: 'var(--accent)' }} />
            <h2 className="mcp-drawer-title">AI & MCP Platform</h2>
          </div>
          <button className="mcp-drawer-close-btn" onClick={onClose} title="Close Panel">
            <X size={18} />
          </button>
        </div>

        {/* 3 Tabs Bar */}
        <div className="mcp-tab-bar">
          <button
            className={`mcp-tab-btn ${activeTabType === 'assistants' ? 'active' : ''}`}
            onClick={() => setActiveTabType('assistants')}
          >
            <Sparkles size={14} />
            <span>Assistants</span>
          </button>
          <button
            className={`mcp-tab-btn ${activeTabType === 'local' ? 'active' : ''}`}
            onClick={() => setActiveTabType('local')}
          >
            <Cpu size={14} />
            <span>Local models</span>
          </button>
          <button
            className={`mcp-tab-btn ${activeTabType === 'tools' ? 'active' : ''}`}
            onClick={() => setActiveTabType('tools')}
          >
            <Wrench size={14} />
            <span>Tools</span>
          </button>
        </div>

        {/* Drawer Body */}
        <div className="mcp-drawer-body">
          {/* TAB 1: ASSISTANTS (Claude, ChatGPT, Gemini with Electron <webview> & Persistent Partitions) */}
          {activeTabType === 'assistants' && (
            <div className="assistant-container">
              {/* Provider Switcher */}
              <div className="assistant-provider-selector">
                {ASSISTANTS.map((asst) => (
                  <button
                    key={asst.id}
                    className={`assistant-chip ${selectedAssistant === asst.id ? 'selected' : ''}`}
                    onClick={() => setSelectedAssistant(asst.id)}
                  >
                    <span style={{ color: asst.color }}>●</span>
                    <span>{asst.name}</span>
                  </button>
                ))}
              </div>

              {/* Actions Bar */}
              <div className="assistant-actions-bar">
                <span style={{ color: 'var(--text-muted)' }}>
                  Session: <strong style={{ color: 'var(--text-main)' }}>{currentAssistant.name}</strong>
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {activeTab && activeTab.url && activeTab.url !== 'neutrino://newtab' && (
                    <button
                      className="assistant-send-btn"
                      onClick={handleSendCurrentPage}
                      title="Send current web page URL & title to assistant"
                    >
                      <Share2 size={12} />
                      <span>Send Page</span>
                    </button>
                  )}
                  {onNavigate && (
                    <button
                      className="assistant-send-btn"
                      onClick={() => onNavigate(currentAssistant.url)}
                      title="Open full page in browser tab"
                    >
                      <ExternalLink size={12} />
                      <span>Open Tab</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Embedded Assistant Webview with persistent session partition (Section 7) */}
              {React.createElement('webview', {
                key: currentAssistant.id,
                ref: assistantWebviewRef,
                src: currentAssistant.url,
                partition: currentAssistant.partition,
                className: 'assistant-webview-frame',
                allowpopups: 'true',
                webpreferences: 'contextIsolation=yes',
              })}
            </div>
          )}

          {/* TAB 2: LOCAL MODELS (Ollama & LM Studio Detection + Streaming Chat) */}
          {activeTabType === 'local' && (
            <div className="local-models-container">
              {/* Runtime Status Card */}
              <div className="runtime-status-card">
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                    Local AI Runtimes
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Ollama (11434) &amp; LM Studio (1234)
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className={`runtime-badge ${ollamaOnline ? 'online' : 'offline'}`}>
                    Ollama: {ollamaOnline ? 'Active' : 'Offline'}
                  </span>
                  <span className={`runtime-badge ${lmStudioOnline ? 'online' : 'offline'}`}>
                    LM Studio: {lmStudioOnline ? 'Active' : 'Offline'}
                  </span>
                  <button
                    className="nav-icon-btn"
                    onClick={scanLocalRuntimes}
                    title="Rescan Local Runtimes"
                  >
                    <RefreshCw size={13} className={isScanning ? 'spinning' : ''} />
                  </button>
                </div>
              </div>

              {/* Model Picker or Empty State */}
              {availableModels.length === 0 ? (
                <div style={{
                  padding: '24px 16px',
                  border: '1px dashed var(--border)',
                  borderRadius: 'var(--radius-md)',
                  textAlign: 'center',
                  background: 'var(--bg-subtle)',
                }}>
                  <AlertCircle size={28} style={{ color: 'var(--text-dim)', margin: '0 auto 8px' }} />
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                    No Local Model Runtime Detected
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '340px', margin: '0 auto 14px' }}>
                    Start <strong>Ollama</strong> (<code>ollama serve</code>) or <strong>LM Studio</strong> (enable Local Server), then click Rescan to load local models offline.
                  </p>
                  <button
                    className="floating-new-tab-btn"
                    onClick={scanLocalRuntimes}
                    style={{ margin: '0 auto' }}
                  >
                    <RefreshCw size={13} />
                    <span>Rescan Runtimes</span>
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
                    Active Model:
                  </label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border)',
                      fontFamily: 'var(--font-ui)',
                      fontSize: '13px',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-main)',
                      outline: 'none',
                    }}
                  >
                    {availableModels.map((m) => (
                      <option key={`${m.runtime}-${m.name}`} value={m.name}>
                        [{m.runtime.toUpperCase()}] {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Local Chat Window */}
              {availableModels.length > 0 && (
                <div className="local-chat-box">
                  <div className="local-chat-messages">
                    {chatMessages.length === 0 ? (
                      <div style={{ color: 'var(--text-dim)', textAlign: 'center', margin: 'auto', fontSize: '12px' }}>
                        Start a conversation with <strong>{selectedModel}</strong>. Responses run entirely offline.
                      </div>
                    ) : (
                      chatMessages.map((msg, i) => (
                        <div key={i} className={`local-msg ${msg.role}`}>
                          {msg.content}
                        </div>
                      ))
                    )}
                    <div ref={chatBottomRef} />
                  </div>

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
              <div style={{
                background: 'var(--bg-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}>
                <CheckCircle2 size={18} style={{ color: 'var(--shield-green)' }} />
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
                    <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '8px' }}>
                      No protocol calls logged yet. Listening on JSON-RPC.
                    </div>
                  ) : (
                    logs.map((log, i) => (
                      <div key={i} style={{ color: log.direction === 'in' ? '#2563eb' : '#15803d', marginBottom: '2px' }}>
                        [{log.direction.toUpperCase()}] {log.method || 'result'}: {JSON.stringify(log.data)}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
