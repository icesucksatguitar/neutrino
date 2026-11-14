import React, { useState, useEffect } from 'react';
import { ArrowRight, Check, Sparkles, User, Mail, Shield, Palette, Layout } from 'lucide-react';

export interface UserProfile {
  name: string;
  email: string | null;
  isGuest: boolean;
  theme: 'obsidian' | 'charcoal' | 'slate';
  mode: 'minimal' | 'architect';
}

interface WelcomeModalProps {
  isOpen: boolean;
  onComplete: (profile: UserProfile) => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onComplete }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [authMode, setAuthMode] = useState<'signup' | 'guest'>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [theme, setTheme] = useState<'obsidian' | 'charcoal' | 'slate'>('obsidian');
  const [mode, setMode] = useState<'minimal' | 'architect'>('minimal');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (authMode === 'signup') {
      if (!email.trim() || !email.includes('@')) {
        setError('Please enter a valid email address');
        return;
      }
      if (!name.trim()) {
        const derived = email.split('@')[0];
        setName(derived.charAt(0).toUpperCase() + derived.slice(1));
      }
    } else {
      if (!name.trim()) {
        setName('Yash');
      }
    }
    setError('');
    setStep(2);
  };

  const handleFinish = () => {
    const finalName = name.trim() || (authMode === 'guest' ? 'Guest' : 'User');
    const profile: UserProfile = {
      name: finalName,
      email: authMode === 'signup' ? email.trim() : null,
      isGuest: authMode === 'guest',
      theme,
      mode,
    };

    try {
      localStorage.setItem('neutrino_user_profile', JSON.stringify(profile));
      localStorage.setItem('neutrino_onboarding_completed', 'true');
      localStorage.setItem('neutrino_dark_theme', 'true');
      localStorage.setItem('neutrino_theme_variant', theme);
    } catch {}

    onComplete(profile);
  };

  return (
    <div className="welcome-modal-backdrop">
      <div className="welcome-modal-dialog">
        {/* Glow ambient background aura (monochromatic) */}
        <div className="welcome-ambient-glow" />

        {/* Progress Dots */}
        <div className="welcome-step-indicator">
          <span className={`step-dot ${step === 1 ? 'active' : 'completed'}`} />
          <span className={`step-dot ${step === 2 ? 'active' : ''}`} />
        </div>

        {step === 1 ? (
          <form className="welcome-step-content" onSubmit={handleNextStep}>
            <div className="welcome-brand-badge">
              <span className="welcome-dot" />
              <span className="welcome-brand-title">NEUTRINO</span>
            </div>

            <h1 className="welcome-headline">The web is the product.</h1>
            <p className="welcome-subtext">
              Zero clutter, radical restraint, and instant performance. Set up your workspace to begin.
            </p>

            {/* Account Type Selector */}
            <div className="welcome-auth-switch">
              <button
                type="button"
                className={`welcome-switch-btn ${authMode === 'signup' ? 'active' : ''}`}
                onClick={() => {
                  setAuthMode('signup');
                  setError('');
                }}
              >
                <Mail size={14} />
                <span>Create Account</span>
              </button>
              <button
                type="button"
                className={`welcome-switch-btn ${authMode === 'guest' ? 'active' : ''}`}
                onClick={() => {
                  setAuthMode('guest');
                  setError('');
                }}
              >
                <User size={14} />
                <span>Continue as Guest</span>
              </button>
            </div>

            {/* Input Fields */}
            <div className="welcome-fields-group">
              {authMode === 'signup' ? (
                <>
                  <div className="welcome-field">
                    <label htmlFor="user-email">Email Address</label>
                    <input
                      id="user-email"
                      type="email"
                      autoFocus
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setError('');
                      }}
                      className="welcome-input"
                    />
                  </div>
                  <div className="welcome-field">
                    <label htmlFor="user-name">Your Name</label>
                    <input
                      id="user-name"
                      type="text"
                      placeholder="How should Neutrino address you?"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="welcome-input"
                    />
                  </div>
                </>
              ) : (
                <div className="welcome-field">
                  <label htmlFor="guest-name">What should we call you?</label>
                  <input
                    id="guest-name"
                    type="text"
                    autoFocus
                    placeholder="Enter your name (e.g. Yash)"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setError('');
                    }}
                    className="welcome-input"
                  />
                  <span className="welcome-field-hint">
                    Guest mode stores your profile strictly on your local machine.
                  </span>
                </div>
              )}

              {error && <div className="welcome-error-msg">{error}</div>}
            </div>

            {/* Next Step Action */}
            <button type="submit" className="welcome-primary-btn">
              <span>Personalize Workspace</span>
              <ArrowRight size={16} />
            </button>
          </form>
        ) : (
          <div className="welcome-step-content">
            <div className="welcome-brand-badge">
              <Palette size={13} />
              <span className="welcome-brand-title">ATMOSPHERE</span>
            </div>

            <h1 className="welcome-headline">Craft your aesthetic.</h1>
            <p className="welcome-subtext">
              Fine-tune the monochromatic palette and interface density to match your focus.
            </p>

            <div className="welcome-options-container">
              {/* Palette Choice */}
              <div className="welcome-section-label">Select Dark Theme</div>
              <div className="welcome-theme-cards">
                <div
                  className={`welcome-theme-card ${theme === 'obsidian' ? 'selected' : ''}`}
                  onClick={() => setTheme('obsidian')}
                >
                  <div className="theme-swatch obsidian-swatch" />
                  <div className="theme-card-info">
                    <span className="theme-name">Obsidian</span>
                    <span className="theme-desc">Deep pure black (#08080A)</span>
                  </div>
                  {theme === 'obsidian' && <Check size={14} className="theme-check" />}
                </div>

                <div
                  className={`welcome-theme-card ${theme === 'charcoal' ? 'selected' : ''}`}
                  onClick={() => setTheme('charcoal')}
                >
                  <div className="theme-swatch charcoal-swatch" />
                  <div className="theme-card-info">
                    <span className="theme-name">Charcoal</span>
                    <span className="theme-desc">Velvety matte (#101014)</span>
                  </div>
                  {theme === 'charcoal' && <Check size={14} className="theme-check" />}
                </div>

                <div
                  className={`welcome-theme-card ${theme === 'slate' ? 'selected' : ''}`}
                  onClick={() => setTheme('slate')}
                >
                  <div className="theme-swatch slate-swatch" />
                  <div className="theme-card-info">
                    <span className="theme-name">Slate Carbon</span>
                    <span className="theme-desc">Tactile graphite (#16161A)</span>
                  </div>
                  {theme === 'slate' && <Check size={14} className="theme-check" />}
                </div>
              </div>

              {/* Layout Mode */}
              <div className="welcome-section-label" style={{ marginTop: '16px' }}>Interface Density</div>
              <div className="welcome-mode-grid">
                <div
                  className={`welcome-mode-pill ${mode === 'minimal' ? 'selected' : ''}`}
                  onClick={() => setMode('minimal')}
                >
                  <Layout size={15} />
                  <div>
                    <div className="mode-title">Radical Minimal</div>
                    <div className="mode-desc">Edge-to-edge, floating chrome</div>
                  </div>
                </div>

                <div
                  className={`welcome-mode-pill ${mode === 'architect' ? 'selected' : ''}`}
                  onClick={() => setMode('architect')}
                >
                  <Sparkles size={15} />
                  <div>
                    <div className="mode-title">Architect</div>
                    <div className="mode-desc">Includes vertical website dock</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Finish Action */}
            <div className="welcome-footer-row">
              <button
                type="button"
                className="welcome-secondary-btn"
                onClick={() => setStep(1)}
              >
                Back
              </button>
              <button
                type="button"
                className="welcome-primary-btn"
                onClick={handleFinish}
              >
                <span>Enter Neutrino</span>
                <Check size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

