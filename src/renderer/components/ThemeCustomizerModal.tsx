import React, { useState, useEffect, useCallback } from 'react';
import { X, Check } from 'lucide-react';

export interface SimpleTheme {
  id: string;
  name: string;
  mode: 'dark' | 'light';
  bgApp: string;
  bgCard: string;
  bgInput: string;
  textMain: string;
  textMuted: string;
  borderSubtle: string;
}

export const MAC_THEMES: SimpleTheme[] = [
  {
    id: 'radical-dark',
    name: 'Neutrino Dark',
    mode: 'dark',
    bgApp: '#0A0A0B',
    bgCard: '#151518',
    bgInput: 'rgba(255, 255, 255, 0.06)',
    textMain: '#F2F2F3',
    textMuted: '#8A8A90',
    borderSubtle: 'rgba(255, 255, 255, 0.12)',
  },
  {
    id: 'clean-light',
    name: 'Neutrino Light',
    mode: 'light',
    bgApp: '#FAFAFA',
    bgCard: '#FFFFFF',
    bgInput: 'rgba(0, 0, 0, 0.04)',
    textMain: '#111113',
    textMuted: '#555558',
    borderSubtle: 'rgba(0, 0, 0, 0.08)',
  },
];

export const ACCENT_COLORS = [
  { name: 'Pure White', hex: '#FFFFFF' },
  { name: 'Silver Slate', hex: '#E4E4E7' },
  { name: 'Zinc Graphite', hex: '#71717A' },
  { name: 'Cool Cyan', hex: '#38bdf8' },
  { name: 'Emerald', hex: '#10b981' },
];

export interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ThemeCustomizerModal: React.FC<ThemeModalProps> = ({ isOpen, onClose }) => {
  const [selectedThemeId, setSelectedThemeId] = useState('radical-dark');
  const [selectedAccent, setSelectedAccent] = useState('#FFFFFF');

  const applyTheme = useCallback((theme: SimpleTheme, accent: string) => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme.mode);
    if (theme.mode === 'dark') {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }

    root.style.setProperty('--bg', theme.bgApp);
    root.style.setProperty('--bg-app', theme.bgApp);
    root.style.setProperty('--bg-sidebar', theme.mode === 'dark' ? 'rgba(18, 18, 22, 0.88)' : 'rgba(245, 245, 247, 0.92)');
    root.style.setProperty('--surface', theme.mode === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.88)');
    root.style.setProperty('--surface-solid', theme.bgCard);
    root.style.setProperty('--bg-card', theme.bgCard);
    root.style.setProperty('--bg-input', theme.bgInput);
    root.style.setProperty('--text', theme.textMain);
    root.style.setProperty('--text-main', theme.textMain);
    root.style.setProperty('--text-muted', theme.textMuted);
    root.style.setProperty('--border', theme.borderSubtle);
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-soft', `${accent}25`);
    root.style.setProperty('--accent-glow', `0 0 20px ${accent}40`);
    root.style.colorScheme = theme.mode;

    try {
      localStorage.setItem(
        'neutrino_simple_theme_v5',
        JSON.stringify({ themeId: theme.id, accent })
      );
      localStorage.setItem('neutrino_dark_theme', theme.mode === 'dark' ? 'true' : 'false');
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('neutrino_simple_theme_v5');
      if (saved) {
        const { themeId, accent } = JSON.parse(saved);
        const validTheme = MAC_THEMES.find((t) => t.id === themeId) || MAC_THEMES[0];
        const validAccent = accent || '#FFFFFF';
        setSelectedThemeId(validTheme.id);
        setSelectedAccent(validAccent);
        applyTheme(validTheme, validAccent);
      }
    } catch {}
  }, [applyTheme]);

  if (!isOpen) return null;

  const currentTheme = MAC_THEMES.find((t) => t.id === selectedThemeId) || MAC_THEMES[0];

  const handleSelectTheme = (t: SimpleTheme) => {
    setSelectedThemeId(t.id);
    applyTheme(t, selectedAccent);
  };

  const handleSelectAccent = (hex: string) => {
    setSelectedAccent(hex);
    applyTheme(currentTheme, hex);
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
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>{t.name}</span>
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
      </div>
    </div>
  );
};
