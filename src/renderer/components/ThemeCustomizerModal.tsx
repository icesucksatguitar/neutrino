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
    id: 'pure-light',
    name: 'Pure Light',
    mode: 'light',
    bgApp: '#fbfbfa',
    bgSidebar: '#ffffff',
    bgCard: '#ffffff',
    bgInput: '#ffffff',
    textMain: '#0f172a',
    textMuted: '#475569',
    borderSubtle: '#e2e8f0',
  },
  {
    id: 'warm-linen',
    name: 'Warm Linen',
    mode: 'light',
    bgApp: '#f8f6f0',
    bgSidebar: '#f1eee5',
    bgCard: '#ffffff',
    bgInput: '#ffffff',
    textMain: '#1c1917',
    textMuted: '#57534e',
    borderSubtle: '#e7e3da',
  },
  {
    id: 'soft-slate',
    name: 'Soft Slate',
    mode: 'light',
    bgApp: '#f1f5f9',
    bgSidebar: '#ffffff',
    bgCard: '#ffffff',
    bgInput: '#ffffff',
    textMain: '#0f172a',
    textMuted: '#475569',
    borderSubtle: '#cbd5e1',
  },
  {
    id: 'minimal-gray',
    name: 'Minimal Gray',
    mode: 'light',
    bgApp: '#f4f4f5',
    bgSidebar: '#e4e4e7',
    bgCard: '#ffffff',
    bgInput: '#ffffff',
    textMain: '#18181b',
    textMuted: '#52525b',
    borderSubtle: '#d4d4d8',
  },
  {
    id: 'ice-blue',
    name: 'Ice Blue',
    mode: 'light',
    bgApp: '#f0f9ff',
    bgSidebar: '#e0f2fe',
    bgCard: '#ffffff',
    bgInput: '#ffffff',
    textMain: '#082f49',
    textMuted: '#0369a1',
    borderSubtle: '#bae6fd',
  },
];

export const ACCENT_COLORS = [
  { name: 'Blue', hex: '#2563eb' },
  { name: 'Amber', hex: '#d97706' },
  { name: 'Forest', hex: '#15803d' },
  { name: 'Purple', hex: '#7c3aed' },
  { name: 'Rose', hex: '#e11d48' },
  { name: 'Graphite', hex: '#475569' },
];

export interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ThemeCustomizerModal: React.FC<ThemeModalProps> = ({ isOpen, onClose }) => {
  const [selectedThemeId, setSelectedThemeId] = useState('pure-light');
  const [selectedAccent, setSelectedAccent] = useState('#2563eb');
  const [textSize, setTextSize] = useState<number>(14);

  const applyTheme = useCallback((theme: SimpleTheme, accent: string, size: number) => {
    const root = document.documentElement;
    root.style.setProperty('--bg-app', theme.bgApp);
    root.style.setProperty('--bg-app-gradient', 'none');
    root.style.setProperty('--bg-sidebar', theme.bgSidebar);
    root.style.setProperty('--bg-card', theme.bgCard);
    root.style.setProperty('--bg-input', theme.bgInput);
    root.style.setProperty('--text-main', theme.textMain);
    root.style.setProperty('--text-muted', theme.textMuted);
    root.style.setProperty('--border-subtle', theme.borderSubtle);
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-glow', `${accent}40`);
    root.style.setProperty('--border-focus', accent);
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
        setSelectedAccent(accent || '#0a84ff');
        setTextSize(size || 14);
        applyTheme(t, accent || '#0a84ff', size || 14);
      } else {
        applyTheme(MAC_THEMES[0], '#0a84ff', 14);
      }
    } catch {
      applyTheme(MAC_THEMES[0], '#0a84ff', 14);
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
    <div className="mac-modal-overlay" onClick={onClose}>
      <div className="mac-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="mac-modal-header">
          <span className="mac-modal-title">Appearance</span>
          <button className="mac-modal-close" onClick={onClose} title="Close">
            <X size={15} />
          </button>
        </div>

        {/* Theme Options */}
        <div className="mac-section">
          <span className="mac-section-label">Theme</span>
          <div className="mac-theme-grid">
            {MAC_THEMES.map((t) => {
              const isSelected = t.id === selectedThemeId;
              return (
                <button
                  key={t.id}
                  className={`mac-theme-btn ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelectTheme(t)}
                >
                  <div className="mac-theme-preview" style={{ backgroundColor: t.bgApp }}>
                    <div className="mac-theme-subpreview" style={{ backgroundColor: t.bgCard }} />
                  </div>
                  <span className="mac-theme-name">{t.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Accent Color Options */}
        <div className="mac-section">
          <span className="mac-section-label">Accent Color</span>
          <div className="mac-accent-row">
            {ACCENT_COLORS.map((a) => {
              const isSelected = selectedAccent.toLowerCase() === a.hex.toLowerCase();
              return (
                <button
                  key={a.name}
                  className={`mac-accent-dot ${isSelected ? 'selected' : ''}`}
                  style={{ backgroundColor: a.hex }}
                  onClick={() => handleSelectAccent(a.hex)}
                  title={a.name}
                >
                  {isSelected && <Check size={11} style={{ color: '#ffffff' }} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Text Size */}
        <div className="mac-section">
          <span className="mac-section-label">Text Size</span>
          <div className="mac-size-row">
            {[
              { label: 'Compact', size: 12.5 },
              { label: 'Default', size: 14 },
              { label: 'Large', size: 15.5 },
            ].map((s) => {
              const isSelected = textSize === s.size;
              return (
                <button
                  key={s.label}
                  className={`mac-size-chip ${isSelected ? 'selected' : ''}`}
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
