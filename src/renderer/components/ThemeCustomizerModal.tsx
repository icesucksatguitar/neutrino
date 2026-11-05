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
    id: 'sumi-white',
    name: 'Sumi Ink White',
    mode: 'light',
    bgApp: '#ffffff',
    bgSidebar: 'transparent',
    bgCard: '#ffffff',
    bgInput: 'rgba(245, 245, 247, 0.95)',
    textMain: '#111111',
    textMuted: '#555555',
    borderSubtle: 'rgba(0, 0, 0, 0.08)',
  },
  {
    id: 'sakura',
    name: 'Sakura Pixel',
    mode: 'light',
    bgApp: '#fdeef2',
    bgSidebar: 'transparent',
    bgCard: '#fff7f9',
    bgInput: 'rgba(255, 250, 252, 0.9)',
    textMain: '#5a3345',
    textMuted: '#8a5d72',
    borderSubtle: 'rgba(217, 102, 138, 0.18)',
  },
  {
    id: 'lunar',
    name: 'Lunar',
    mode: 'dark',
    bgApp: '#0a0b0e',
    bgSidebar: 'transparent',
    bgCard: '#1a1c21',
    bgInput: '#121419',
    textMain: '#e9e7e1',
    textMuted: '#a7a9b0',
    borderSubtle: 'rgba(214, 218, 226, 0.09)',
  },
];

export const ACCENT_COLORS = [
  { name: 'Ink Black', hex: '#111111' },
  { name: 'Charcoal', hex: '#333333' },
  { name: 'Rose', hex: '#d9668a' },
  { name: 'Matcha', hex: '#589b6b' },
  { name: 'Amber Gold', hex: '#f5ba58' },
  { name: 'Moon Glow', hex: '#d8d2bd' },
];

export interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ThemeCustomizerModal: React.FC<ThemeModalProps> = ({ isOpen, onClose }) => {
  const [selectedThemeId, setSelectedThemeId] = useState('sumi-white');
  const [selectedAccent, setSelectedAccent] = useState('#e91e63');
  const [textSize, setTextSize] = useState<number>(13.5);

  const applyTheme = useCallback((theme: SimpleTheme, accent: string, size: number) => {
    const root = document.documentElement;
    root.style.setProperty('--bg', theme.bgApp);
    root.style.setProperty('--bg-app', theme.bgApp);
    root.style.setProperty('--bg-sidebar', 'transparent');
    root.style.setProperty('--bg-elevated', theme.id === 'sumi-white' ? '#f8f8f9' : (theme.id === 'sakura' ? '#fff5f8' : (theme.id === 'lunar' ? '#111317' : '#f5f0eb')));
    root.style.setProperty('--surface', theme.id === 'sumi-white' ? 'rgba(255, 255, 255, 0.90)' : (theme.id === 'sakura' ? 'rgba(255, 248, 250, 0.82)' : (theme.id === 'lunar' ? 'rgba(26, 28, 33, 0.72)' : theme.bgCard)));
    root.style.setProperty('--surface-solid', theme.bgCard);
    root.style.setProperty('--surface-hover', theme.id === 'sumi-white' ? '#f3f3f5' : (theme.id === 'sakura' ? '#ffeef3' : (theme.id === 'lunar' ? '#23262c' : 'rgba(0, 0, 0, 0.05)')));
    root.style.setProperty('--bg-card', theme.bgCard);
    root.style.setProperty('--bg-input', theme.bgInput);
    root.style.setProperty('--text', theme.textMain);
    root.style.setProperty('--text-main', theme.textMain);
    root.style.setProperty('--text-muted', theme.textMuted);
    root.style.setProperty('--text-faint', theme.id === 'sumi-white' ? '#888888' : (theme.id === 'sakura' ? '#a87d91' : (theme.id === 'lunar' ? '#74777f' : '#9E9892')));
    root.style.setProperty('--border', theme.borderSubtle);
    root.style.setProperty('--border-subtle', theme.id === 'sumi-white' ? 'rgba(0, 0, 0, 0.04)' : (theme.id === 'sakura' ? 'rgba(217, 102, 138, 0.10)' : (theme.id === 'lunar' ? 'rgba(214, 218, 226, 0.05)' : 'rgba(0, 0, 0, 0.04)')));
    root.style.setProperty('--border-strong', theme.id === 'sumi-white' ? 'rgba(0, 0, 0, 0.18)' : (theme.id === 'sakura' ? 'rgba(217, 102, 138, 0.36)' : (theme.id === 'lunar' ? 'rgba(214, 218, 226, 0.20)' : 'rgba(0, 0, 0, 0.12)')));
    root.style.setProperty('--bg-sidebar-hover', theme.id === 'sumi-white' ? 'rgba(0, 0, 0, 0.04)' : (theme.id === 'sakura' ? 'rgba(255, 238, 243, 0.65)' : (theme.id === 'lunar' ? '#23262c' : 'rgba(0, 0, 0, 0.05)')));
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-soft', `${accent}25`);
    root.style.setProperty('--accent-glow', `0 0 20px ${accent}40`);
    root.style.setProperty('--earthshine', '#7f9bbd');
    root.style.setProperty('--art', theme.id === 'sumi-white' ? '#ff2a85' : (theme.id === 'sakura' ? '#d9668a' : '#6a6e78'));
    root.style.setProperty('--success', '#2e7d32');
    root.style.setProperty('--danger', '#d32f2f');
    root.style.setProperty('--font-size-base', `${size}px`);
    root.style.colorScheme = theme.mode;

    localStorage.setItem(
      'neutrino_simple_theme_v5',
      JSON.stringify({ themeId: theme.id, accent, size })
    );
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('neutrino_simple_theme_v5');
      if (saved) {
        const { themeId, accent, size } = JSON.parse(saved);
        const validTheme = MAC_THEMES.find((t) => t.id === themeId) || MAC_THEMES[0];
        const validAccent = accent || '#e91e63';
        setSelectedThemeId(validTheme.id);
        setSelectedAccent(validAccent);
        setTextSize(size || 13.5);
        applyTheme(validTheme, validAccent, size || 13.5);
      } else {
        applyTheme(MAC_THEMES[0], '#e91e63', 13.5);
      }
    } catch {
      applyTheme(MAC_THEMES[0], '#e91e63', 13.5);
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
                  {isSelected && <Check size={12} style={{ color: '#ffffff' }} />}
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
