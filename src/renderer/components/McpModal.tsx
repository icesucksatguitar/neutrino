import React, { useState, useEffect } from 'react';
import { Bot, X, CheckCircle, Terminal, Play } from 'lucide-react';

interface McpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const McpModal: React.FC<McpModalProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchLogs = async () => {
      if (window.neutrino?.getMcpLogs) {
        const history = await window.neutrino.getMcpLogs();
        setLogs(history || []);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 1500);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestCall = async (toolName: string, args: any) => {
    if (!window.neutrino?.callMcp) return;
    try {
      const res = await window.neutrino.callMcp('tools/call', { name: toolName, arguments: args });
      setTestResult(JSON.stringify(res, null, 2));
    } catch (err: any) {
      setTestResult(`Error: ${err.message}`);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content-card" style={{ width: '520px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Bot size={20} style={{ color: 'var(--accent)' }} />
            <span>Model Context Protocol (MCP) Integration</span>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div style={{
          backgroundColor: 'var(--bg-input)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 14px',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <CheckCircle size={18} style={{ color: 'var(--shield-green)' }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700 }}>Native MCP Server Active</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              AI agents (Claude, Antigravity) can inspect DOM, navigate, and control tabs via MCP standard JSON-RPC.
            </div>
          </div>
        </div>

        {/* Available MCP Tools */}
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
            Registered MCP Tools
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {[
              { name: 'browser_navigate', desc: 'Load web URL' },
              { name: 'browser_list_tabs', desc: 'List all open tabs' },
              { name: 'browser_create_tab', desc: 'Open new tab' },
              { name: 'browser_close_tab', desc: 'Close tab by ID' },
              { name: 'browser_get_adblock_stats', desc: 'Shield stats' },
              { name: 'browser_zen_optimize', desc: 'Purge background RAM' },
            ].map((tool) => (
              <div
                key={tool.name}
                style={{
                  backgroundColor: 'var(--bg-input)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px 10px',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '11.5px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent)' }}>
                    {tool.name}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>{tool.desc}</div>
                </div>
                <button
                  onClick={() => handleTestCall(tool.name, {})}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                  title="Test Tool"
                >
                  <Play size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Live Call Logs */}
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
            Recent MCP Protocol Calls
          </div>
          <div style={{
            backgroundColor: 'var(--bg-input)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            padding: '8px',
            maxHeight: '130px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: '11px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}>
            {logs.length === 0 ? (
              <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '8px' }}>
                No external MCP calls yet. Ready to receive requests.
              </div>
            ) : (
              logs.map((log, i) => (
                <div key={i} style={{ color: log.direction === 'in' ? '#38bdf8' : '#10b981' }}>
                  [{log.direction.toUpperCase()}] {log.method || 'result'}: {JSON.stringify(log.data)}
                </div>
              ))
            )}
          </div>
        </div>

        {testResult && (
          <div style={{
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid var(--accent)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px',
            fontSize: '11px',
            fontFamily: 'monospace',
            maxHeight: '100px',
            overflowY: 'auto',
          }}>
            {testResult}
          </div>
        )}
      </div>
    </div>
  );
};

