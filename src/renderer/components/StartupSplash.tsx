import React, { useEffect, useState, useCallback } from 'react';

interface StartupSplashProps {
  onFinished: () => void;
}

export const StartupSplash: React.FC<StartupSplashProps> = ({ onFinished }) => {
  const [phase, setPhase] = useState<'entering' | 'holding' | 'leaving' | 'done'>('entering');

  const triggerExit = useCallback(() => {
    setPhase((current) => {
      if (current === 'leaving' || current === 'done') return current;
      return 'leaving';
    });
  }, []);

  useEffect(() => {
    // 0ms -> 600ms: entering
    const holdTimer = setTimeout(() => {
      setPhase('holding');
    }, 600);

    // 1300ms: start smooth fade-out
    const leaveTimer = setTimeout(() => {
      triggerExit();
    }, 1300);

    // 1800ms: finished completely, unmount
    const finishTimer = setTimeout(() => {
      setPhase('done');
      onFinished();
    }, 1800);

    // Allow user to click or press any key to skip immediately
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        triggerExit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(holdTimer);
      clearTimeout(leaveTimer);
      clearTimeout(finishTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [triggerExit, onFinished]);

  if (phase === 'done') return null;

  return (
    <div
      className={`startup-splash-overlay ${phase === 'leaving' ? 'splash-leaving' : 'splash-active'}`}
      onClick={triggerExit}
      role="presentation"
      title="Click or press Space to skip"
    >
      <div className="startup-splash-bg-ambient" />

      {/* Orbiting quantum particle representing a Neutrino */}
      <div className="startup-splash-orbital">
        <div className="splash-ring splash-ring-outer" />
        <div className="splash-ring splash-ring-inner" />
        <div className="splash-particle-orbit">
          <span className="splash-quantum-dot" />
        </div>
      </div>

      {/* Centered Brand Typography */}
      <div className="startup-splash-center">
        <h1 className="startup-splash-logo">Neutrino</h1>
        <div className="startup-splash-subline">
          <span className="splash-dash" />
          <span className="splash-tagline">SOVEREIGN BROWSER</span>
          <span className="splash-dash" />
        </div>
      </div>

      {/* Minimal micro-pulse dots */}
      <div className="startup-splash-loader">
        <span className="splash-pulse-dot dot-1" />
        <span className="splash-pulse-dot dot-2" />
        <span className="splash-pulse-dot dot-3" />
      </div>
    </div>
  );
};
