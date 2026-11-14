import React, { useState, useEffect, useRef } from 'react';

interface FlipUnitProps {
  currentVal: string;
  prevVal: string;
  label?: string;
}

const FlipUnit: React.FC<FlipUnitProps> = ({ currentVal, prevVal, label }) => {
  const [flipping, setFlipping] = useState(false);

  useEffect(() => {
    if (currentVal !== prevVal) {
      setFlipping(true);
      const timer = setTimeout(() => {
        setFlipping(false);
      }, 550);
      return () => clearTimeout(timer);
    }
  }, [currentVal, prevVal]);

  return (
    <div className="flip-card-container" title={label}>
      <div className={`flip-card ${flipping ? 'is-flipping' : ''}`}>
        {/* Upper card static: showing the new currentVal */}
        <div className="flip-card-half flip-card-upper">
          <span className="flip-digit-text">{currentVal}</span>
          <div className="flip-card-crease-shadow top" />
        </div>

        {/* Lower card static: showing the new currentVal */}
        <div className="flip-card-half flip-card-lower">
          <span className="flip-digit-text">{currentVal}</span>
          <div className="flip-card-crease-shadow bottom" />
        </div>

        {/* Flipping flap: folds from top down */}
        {flipping && (
          <div className="flip-card-half flip-flap-top">
            <span className="flip-digit-text">{prevVal}</span>
            <div className="flip-card-crease-shadow top" />
          </div>
        )}

        {/* Flipping flap: unfolds onto bottom */}
        {flipping && (
          <div className="flip-card-half flip-flap-bottom">
            <span className="flip-digit-text">{currentVal}</span>
            <div className="flip-card-crease-shadow bottom" />
          </div>
        )}

        {/* Hinge Line & Side Notches */}
        <div className="flip-hinge-line" />
        <div className="flip-hinge-notch left" />
        <div className="flip-hinge-notch right" />
      </div>
      {label && <div className="flip-unit-label">{label}</div>}
    </div>
  );
};

export const FlipClock: React.FC = () => {
  const [time, setTime] = useState<{
    hours: string;
    minutes: string;
    seconds: string;
    dateStr: string;
    ampm: string;
  }>(() => {
    const now = new Date();
    return {
      hours: String(now.getHours()).padStart(2, '0'),
      minutes: String(now.getMinutes()).padStart(2, '0'),
      seconds: String(now.getSeconds()).padStart(2, '0'),
      dateStr: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
      ampm: now.getHours() >= 12 ? 'PM' : 'AM',
    };
  });

  const prevTimeRef = useRef(time);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const nextTime = {
        hours: String(now.getHours()).padStart(2, '0'),
        minutes: String(now.getMinutes()).padStart(2, '0'),
        seconds: String(now.getSeconds()).padStart(2, '0'),
        dateStr: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
        ampm: now.getHours() >= 12 ? 'PM' : 'AM',
      };
      prevTimeRef.current = time;
      setTime(nextTime);
    };

    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [time]);

  const prev = prevTimeRef.current;

  return (
    <div className="retro-flip-clock-wrapper">
      {/* Date Header */}
      <div className="flip-clock-date-banner">
        <span>{time.dateStr}</span>
        <span className="flip-clock-ampm-pill">{time.ampm}</span>
      </div>

      {/* Flip Clock Display Board */}
      <div className="flip-clock-board">
        {/* Hours */}
        <FlipUnit currentVal={time.hours} prevVal={prev.hours} label="HOURS" />

        {/* Center Colon Divider */}
        <div className="flip-clock-colon">
          <span className="colon-dot" />
          <span className="colon-dot" />
        </div>

        {/* Minutes */}
        <FlipUnit currentVal={time.minutes} prevVal={prev.minutes} label="MINUTES" />

        {/* Seconds Mini Pill */}
        <div className="flip-seconds-capsule" title="Seconds">
          <span className="seconds-num">{time.seconds}</span>
          <span className="seconds-label">SEC</span>
        </div>
      </div>
    </div>
  );
};

