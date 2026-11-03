import React, { useState, useEffect, useCallback } from 'react';
import { X, Check } from 'lucide-react';

export interface SimpleTheme {
  id: string;
  name: string;
  mode: 'dark' | 'light';
  bgApp: string;
  bgSidebar: string;
  bgCard: string;
  bgInput: string;
  textMain: string;
  textMuted: string;
  borderSubtle: string;
}

export const MAC_THEMES: SimpleTheme[] = [
  {
    id: 'obsidian-dark',
    name: 'Obsidian',
    mode: 'dark',
    bgApp: '#0b0d12',
    bgSidebar: '#12151d',
    bgCard: '#151821',
    bgInput: '#151821',
    textMain: '#eceef4',
    textMuted: '#939aa8',
    borderSubtle: 'rgba(255, 255, 255, 0.08)',
  },
  {
    id: 'midnight-slate',
    name: 'Midnight',
    mode: 'dark',
    bgApp: '#0e1117',
    bgSidebar: '#161b22',
    bgCard: '#1a202c',
    bgInput: '#1a202c',
    textMain: '#f0f6fc',
    textMuted: '#8b949e',
    borderSubtle: 'rgba(255, 255, 255, 0.1)',
  },
  {
    id: 'deep-charcoal',
    name: 'Charcoal',
    mode: 'dark',
    bgApp: '#121214',
    bgSidebar: '#18181b',
    bgCard: '#1f1f23',
    bgInput: '#1f1f23',
    textMain: '#fafafa',
    textMuted: '#a1a1aa',
    borderSubtle: 'rgba(255, 255, 255, 0.08)',
  },
  {
    id: 'graphite-black',
    name: 'Graphite',
    mode: 'dark',
    bgApp: '#08090b',
    bgSidebar: '#0f1013',
    bgCard: '#14151a',
    bgInput: '#14151a',
    textMain: '#e5e7eb',
    textMuted: '#9ca3af',
    borderSubtle: 'rgba(255, 255, 255, 0.06)',
  },
];

export const ACCENT_COLORS = [
  { name: 'Indigo', hex: '#7c9cff' },
  { name: 'Cyan', hex: '#38bdf8' },
  { name: 'Emerald', hex: '#4ade80' },
  { name: 'Violet', hex: '#a78bfa' },
  { name: 'Rose', hex: '#fb7185' },
  { name: 'Amber', hex: '#fbbf24' },
];

export interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ThemeCustomizerModal: React.FC<ThemeModalProps> = ({ isOpen, onClose }) => {
  const [selectedThemeId, setSelectedThemeId] = useState('obsidian-dark');
  const [selectedAccent, setSelectedAccent] = useState('#7c9cff');
  const [textSize, setTextSize] = useState<number>(13.5);

  const applyTheme = useCallback((theme: SimpleTheme, accent: string, size: number) => {
    const root = document.documentElement;
    root.style.setProperty('--bg', theme.bgApp);
    root.style.setProperty('--bg-app', theme.bgApp);
    root.style.setProperty('--bg-elevated', theme.bgSidebar);
    root.style.setProperty('--surface-solid', theme.bgCard);
    root.style.setProperty('--bg-card', theme.bgCard);
    root.style.setProperty('--bg-input', theme.bgInput);
    root.style.setProperty('--text', theme.textMain);
    root.style.setProperty('--text-main', theme.textMain);
    root.style.setProperty('--text-muted', theme.textMuted);
    root.style.setProperty('--border', theme.borderSubtle);
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-soft', `${accent}25`);
    root.style.setProperty('--accent-glow', `${accent}40`);
    root.style.setProperty('--font-size-base', `${size}px`);

    localStorage.setItem(
      'neutrino_simple_theme',
      JSON.stringify({ themeId: theme.id, accent, size })
    );
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('neutrino_simple_theme');
      if (saved) {
        const { themeId, accent, size } = JSON.parse(saved);
        const t = MAC_THEMES.find((x) => x.id === themeId) || MAC_THEMES[0];
        setSelectedThemeId(t.id);
        setSelectedAccent(accent || '#7c9cff');
        setTextSize(size || 13.5);
        applyTheme(t, accent || '#7c9cff', size || 13.5);
      } else {
        applyTheme(MAC_THEMES[0], '#7c9cff', 13.5);
      }
    } catch {
      applyTheme(MAC_THEMES[0], '#7c9cff', 13.5);
    }
  }, [applyTheme]);

  if (!isOpen) return null;

  const currentTheme = MAC_THEMES.find((t) => t.id === selectedThemeId) || MAC_THEMES[0];

  const handleSelectTheme = (t: SimpleTheme) => {
    setSelectedThemeId(t.id);
    applyTheme(t, selectedAccent, textSize);
  };

  const handleSelectAccent = (hex: string) => {
    setSelectedAccent(hex);
    applyTheme(currentTheme, hex, textSize);
  };

  const handleSelectSize = (size: number) => {
    setTextSize(size);
    applyTheme(currentTheme, selectedAccent, size);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <span className="modal-title">Theme & Appearance</span>
          <button className="close-btn" onClick={onClose} title="Close">
            <X size={15} />
          </button>
        </div>

        {/* Theme Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Theme Palette</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            {MAC_THEMES.map((t) => {
              const isSelected = t.id === selectedThemeId;
              return (
                <button
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                    backgroundColor: isSelected ? 'var(--surface-hover)' : 'var(--bg-elevated)',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => handleSelectTheme(t)}
                >
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      backgroundColor: t.bgApp,
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                    }}
                  />
                  <span style={{ fontSize: '12.5px', fontWeight: 500 }}>{t.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Accent Color Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Accent Color</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {ACCENT_COLORS.map((a) => {
              const isSelected = selectedAccent.toLowerCase() === a.hex.toLowerCase();
              return (
                <button
                  key={a.name}
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: a.hex,
                    border: isSelected ? '2px solid #ffffff' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 0 8px var(--accent-glow)' : 'none',
                  }}
                  onClick={() => handleSelectAccent(a.hex)}
                  title={a.name}
                >
                  {isSelected && <Check size={12} style={{ color: '#0b0d12' }} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Text Size */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Interface Scale</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[
              { label: 'Compact', size: 12.5 },
              { label: 'Default', size: 13.5 },
              { label: 'Relaxed', size: 15 },
            ].map((s) => {
              const isSelected = textSize === s.size;
              return (
                <button
                  key={s.label}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                    backgroundColor: isSelected ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                    color: isSelected ? 'var(--accent)' : 'var(--text)',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                  onClick={() => handleSelectSize(s.size)}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
