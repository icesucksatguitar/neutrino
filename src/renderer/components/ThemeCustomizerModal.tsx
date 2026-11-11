import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Monitor, Moon, Pencil, Plus, RotateCcw, Sparkles, Sun, Trash2, X } from 'lucide-react';
import {
  type CustomSpaceThemePreset,
  DEFAULT_SPACE_GLOW,
  MAX_CUSTOM_THEME_PRESETS,
  SPACE_THEME_PRESETS,
  type SpaceGlowSettings,
  type SpaceGlowStyle,
  type SpaceTheme,
  type SpaceThemeMode,
  type SpaceThemePoint,
  cloneSpaceTheme,
  clamp01,
  clampWheelPos,
  colorToWheelPos,
  createCustomThemePreset,
  deleteCustomThemePreset,
  getDefaultSpaceTheme,
  hexToHsl,
  hslToHex,
  hueSatToWheelPos,
  normalizeCustomThemePresets,
  normalizeHex,
  normalizePresetName,
  renameCustomThemePreset,
  themesMatchCustomization,
  validateAndClampSpaceGlow,
  wheelPosToColorKeepingLightness,
  wheelPosToHueSat,
} from '../../main/spaceTheme';
import { applySpaceThemeToRoot, getOsPrefersDark } from '../utils/applySpaceTheme';

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
    name: 'Neutrino Pitch Black',
    mode: 'dark',
    bgApp: '#000000',
    bgCard: '#0A0A0C',
    bgInput: 'rgba(255, 255, 255, 0.06)',
    textMain: '#FFFFFF',
    textMuted: '#A1A1AA',
    borderSubtle: 'rgba(255, 255, 255, 0.10)',
  },
  {
    id: 'clean-light',
    name: 'Neutrino Warm Light',
    mode: 'light',
    bgApp: '#FAF7F2',
    bgCard: '#FFFFFF',
    bgInput: 'rgba(60, 50, 40, 0.04)',
    textMain: '#1C1917',
    textMuted: '#756E66',
    borderSubtle: 'rgba(60, 50, 40, 0.09)',
  },
];

export const ACCENT_COLORS = [
  { name: 'Pure White', hex: '#FFFFFF' },
  { name: 'Silver Slate', hex: '#E4E4E7' },
  { name: 'Zinc Graphite', hex: '#71717A' },
  { name: 'Cool Cyan', hex: '#38bdf8' },
  { name: 'Emerald', hex: '#10b981' },
];

export interface CustomThemePreference {
  themeId: string;
  accent: string;
}

export interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSpace?: { id: string; name: string };
  spaceTheme?: SpaceTheme;
  customPresets?: CustomSpaceThemePreset[];
  onChangeCustomPresets?: (nextPresets: CustomSpaceThemePreset[]) => void;
  onChangeSpaceTheme?: (
    nextTheme: SpaceTheme,
    options?: { immediateSave?: boolean; animateTransition?: boolean }
  ) => void;
  onResetSpaceTheme?: () => void;
  isDarkMode?: boolean;
  onSetDarkMode?: (dark: boolean) => void;
  persistedCustomTheme?: CustomThemePreference;
  onPersistCustomTheme?: (customTheme: CustomThemePreference) => void;
}

export const ThemeCustomizerModal: React.FC<ThemeModalProps> = ({
  isOpen,
  onClose,
  activeSpace = { id: 'space-study', name: 'Study' },
  spaceTheme,
  customPresets,
  onChangeCustomPresets,
  onChangeSpaceTheme,
  onResetSpaceTheme,
}) => {
  const initialTheme = spaceTheme ? cloneSpaceTheme(spaceTheme) : getDefaultSpaceTheme(activeSpace.id);
  const initialGlow = validateAndClampSpaceGlow(initialTheme.glow, DEFAULT_SPACE_GLOW);
  const [draftTheme, setDraftTheme] = useState<SpaceTheme>(initialTheme);
  const [selectedDotIndex, setSelectedDotIndex] = useState<number>(0);
  const [hexDraft, setHexDraft] = useState<string>(initialTheme.points[0]?.color || '#0E5E43');
  const [glowHexDraft, setGlowHexDraft] = useState<string>(initialGlow.color);
  const [isWheelDragging, setIsWheelDragging] = useState<boolean>(false);
  const [localPresets, setLocalPresets] = useState<CustomSpaceThemePreset[]>(() =>
    normalizeCustomThemePresets(customPresets)
  );
  const [presetNameInput, setPresetNameInput] = useState<string>('');
  const [presetFormError, setPresetFormError] = useState<string>('');
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingPresetName, setEditingPresetName] = useState<string>('');

  const wheelRef = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef<SpaceTheme>(initialTheme);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCommitThemeRef = useRef<SpaceTheme | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const dragDotIndexRef = useRef<number>(0);

  // Keep draft synced when Space or external settings change while not actively dragging
  useEffect(() => {
    if (!spaceTheme || isWheelDragging) return;
    const next = cloneSpaceTheme(spaceTheme);
    setDraftTheme(next);
    draftRef.current = next;
    const clampedIdx = Math.min(selectedDotIndex, next.points.length - 1);
    setSelectedDotIndex(clampedIdx);
    setHexDraft(next.points[clampedIdx]?.color || next.points[0].color);
    const nextGlow = validateAndClampSpaceGlow(next.glow, DEFAULT_SPACE_GLOW);
    setGlowHexDraft(nextGlow.color);
  }, [spaceTheme, activeSpace.id, isOpen, isWheelDragging, selectedDotIndex]);

  const flushPendingSave = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (pendingCommitThemeRef.current) {
      const toCommit = pendingCommitThemeRef.current;
      pendingCommitThemeRef.current = null;
      onChangeSpaceTheme?.(toCommit, { immediateSave: true });
    }
  }, [onChangeSpaceTheme]);

  useEffect(() => {
    return () => {
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      flushPendingSave();
    };
  }, [flushPendingSave]);

  useEffect(() => {
    if (customPresets !== undefined) {
      setLocalPresets(normalizeCustomThemePresets(customPresets));
    }
  }, [customPresets]);

  // Esc closes the floating popover (or cancels an active inline preset rename first)
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (editingPresetId !== null) {
          setEditingPresetId(null);
          setEditingPresetName('');
          return;
        }
        flushPendingSave();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, editingPresetId, flushPendingSave, onClose]);

  const applyLiveAndScheduleSave = useCallback(
    (nextTheme: SpaceTheme, options?: { immediateSave?: boolean; animateTransition?: boolean }) => {
      draftRef.current = nextTheme;
      setDraftTheme(nextTheme);
      applySpaceThemeToRoot(nextTheme, getOsPrefersDark());

      if (options?.immediateSave) {
        if (debounceTimerRef.current !== null) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        pendingCommitThemeRef.current = null;
        onChangeSpaceTheme?.(nextTheme, { immediateSave: true, animateTransition: options.animateTransition });
        return;
      }

      pendingCommitThemeRef.current = nextTheme;
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        const latest = pendingCommitThemeRef.current;
        pendingCommitThemeRef.current = null;
        if (latest) {
          onChangeSpaceTheme?.(latest, { immediateSave: true });
        }
      }, 150);
    },
    [onChangeSpaceTheme]
  );

  const updatePointFromClientXY = useCallback(
    (clientX: number, clientY: number, pointIndex: number) => {
      const wheelEl = wheelRef.current;
      if (!wheelEl) return;
      const rect = wheelEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const rawX = (clientX - rect.left) / rect.width;
      const rawY = (clientY - rect.top) / rect.height;
      const clamped = clampWheelPos(rawX, rawY);

      const cur = draftRef.current;
      const currentPoint = cur.points[pointIndex];
      if (!currentPoint) return;

      const nextColor = wheelPosToColorKeepingLightness(clamped.x, clamped.y, currentPoint.color);
      const nextPoints = cur.points.map((pt, idx) =>
        idx === pointIndex ? { color: nextColor, x: clamped.x, y: clamped.y } : pt
      );
      const nextTheme: SpaceTheme = { ...cur, points: nextPoints };
      setHexDraft(nextColor);
      applyLiveAndScheduleSave(nextTheme);
    },
    [applyLiveAndScheduleSave]
  );

  const handleWheelPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const dotEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dot-index]');
    let targetIdx = selectedDotIndex;

    if (dotEl) {
      targetIdx = Number(dotEl.dataset.dotIndex);
    } else if (wheelRef.current) {
      // Clicking empty area on the wheel picks nearest dot to pointer so interaction feels effortless
      const rect = wheelRef.current.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
      const relY = (e.clientY - rect.top) / Math.max(1, rect.height);
      let bestIdx = 0;
      let bestDist = Infinity;
      draftRef.current.points.forEach((pt, idx) => {
        const d = Math.hypot(pt.x - relX, pt.y - relY);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = idx;
        }
      });
      targetIdx = bestIdx;
    }

    setSelectedDotIndex(targetIdx);
    dragDotIndexRef.current = targetIdx;
    setIsWheelDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events without active pointerId
    }
    updatePointFromClientXY(e.clientX, e.clientY, targetIdx);
  };

  const handleWheelPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isWheelDragging) return;
    const cx = e.clientX;
    const cy = e.clientY;
    const dotIdx = dragDotIndexRef.current;

    if (dragRafRef.current !== null) {
      cancelAnimationFrame(dragRafRef.current);
    }
    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = null;
      updatePointFromClientXY(cx, cy, dotIdx);
    });
  };

  const endWheelDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isWheelDragging) return;
    if (dragRafRef.current !== null) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }
    setIsWheelDragging(false);
  };

  const handleDotKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const step = e.shiftKey ? 0.08 : 0.03;
    let dx = 0;
    let dy = 0;
    if (e.key === 'ArrowLeft') dx = -step;
    else if (e.key === 'ArrowRight') dx = step;
    else if (e.key === 'ArrowUp') dy = -step;
    else if (e.key === 'ArrowDown') dy = step;
    else return;

    e.preventDefault();
    setSelectedDotIndex(idx);
    const cur = draftRef.current;
    const pt = cur.points[idx];
    if (!pt) return;

    const clamped = clampWheelPos(pt.x + dx, pt.y + dy);
    const nextColor = wheelPosToColorKeepingLightness(clamped.x, clamped.y, pt.color);
    const nextPoints = cur.points.map((p, i) => (i === idx ? { color: nextColor, x: clamped.x, y: clamped.y } : p));
    setHexDraft(nextColor);
    applyLiveAndScheduleSave({ ...cur, points: nextPoints });
  };

  const handleAddThirdPoint = () => {
    const cur = draftRef.current;
    if (cur.points.length >= 3) return;
    const { h, s } = hexToHsl(cur.points[0].color);
    const nextHue = (h + 115) % 360;
    const nextSat = Math.max(42, Math.min(82, s || 64));
    const lightness = cur.mode === 'light' ? 76 : 46;
    const color = hslToHex(nextHue, nextSat, lightness);
    const pos = hueSatToWheelPos(nextHue, nextSat);
    const newPoint: SpaceThemePoint = { color, x: pos.x, y: pos.y };
    const nextTheme: SpaceTheme = { ...cur, points: [...cur.points, newPoint] };
    setSelectedDotIndex(nextTheme.points.length - 1);
    setHexDraft(color);
    applyLiveAndScheduleSave(nextTheme, { immediateSave: true });
  };

  const handleRemovePoint = () => {
    const cur = draftRef.current;
    if (cur.points.length <= 2) return;
    const removeAt = Math.min(selectedDotIndex, cur.points.length - 1);
    const nextPoints = cur.points.filter((_, i) => i !== removeAt);
    const nextIdx = Math.max(0, Math.min(removeAt, nextPoints.length - 1));
    setSelectedDotIndex(nextIdx);
    setHexDraft(nextPoints[nextIdx].color);
    applyLiveAndScheduleSave({ ...cur, points: nextPoints }, { immediateSave: true });
  };

  const handleHexChange = (rawInput: string) => {
    setHexDraft(rawInput);
    const normalized = normalizeHex(rawInput, '');
    if (!normalized) return;
    const cur = draftRef.current;
    const pos = colorToWheelPos(normalized);
    const nextPoints = cur.points.map((p, idx) =>
      idx === selectedDotIndex ? { color: normalized, x: pos.x, y: pos.y } : p
    );
    applyLiveAndScheduleSave({ ...cur, points: nextPoints });
  };

  const handleHexBlur = () => {
    const current = draftRef.current.points[selectedDotIndex];
    if (current) {
      setHexDraft(current.color);
    }
  };

  const handleModeChange = (mode: SpaceThemeMode) => {
    const cur = draftRef.current;
    applyLiveAndScheduleSave({ ...cur, mode }, { immediateSave: true, animateTransition: true });
  };

  const currentGlow: SpaceGlowSettings = validateAndClampSpaceGlow(draftTheme.glow, DEFAULT_SPACE_GLOW);

  const updateGlow = (patch: Partial<SpaceGlowSettings>, immediateSave = false) => {
    const cur = draftRef.current;
    const baseGlow = validateAndClampSpaceGlow(cur.glow, DEFAULT_SPACE_GLOW);
    const nextGlow = validateAndClampSpaceGlow({ ...baseGlow, ...patch }, baseGlow);
    applyLiveAndScheduleSave({ ...cur, glow: nextGlow }, { immediateSave });
  };

  const handleGlowStyleChange = (style: SpaceGlowStyle) => {
    const cur = draftRef.current;
    const baseGlow = validateAndClampSpaceGlow(cur.glow, DEFAULT_SPACE_GLOW);
    const nextIntensity =
      style !== 'off' && baseGlow.intensity <= 0.02 ? DEFAULT_SPACE_GLOW.intensity : baseGlow.intensity;
    updateGlow({ style, intensity: nextIntensity }, true);
  };

  const handleGlowHexChange = (rawInput: string) => {
    setGlowHexDraft(rawInput);
    const normalized = normalizeHex(rawInput, '');
    if (!normalized) return;
    updateGlow({ style: 'custom', color: normalized }, false);
  };

  const handleGlowHexBlur = () => {
    const baseGlow = validateAndClampSpaceGlow(draftRef.current.glow, DEFAULT_SPACE_GLOW);
    setGlowHexDraft(baseGlow.color);
  };

  const commitCustomPresets = useCallback(
    (nextPresets: CustomSpaceThemePreset[]) => {
      const normalized = normalizeCustomThemePresets(nextPresets);
      setLocalPresets(normalized);
      onChangeCustomPresets?.(normalized);
    },
    [onChangeCustomPresets]
  );

  const handleSaveCustomPreset = (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleaned = normalizePresetName(presetNameInput);
    if (!cleaned) {
      setPresetFormError('Enter a preset name');
      return;
    }
    if (localPresets.length >= MAX_CUSTOM_THEME_PRESETS) {
      setPresetFormError(`Maximum ${MAX_CUSTOM_THEME_PRESETS} saved presets reached`);
      return;
    }
    const next = createCustomThemePreset(localPresets, cleaned, draftRef.current);
    commitCustomPresets(next);
    setPresetNameInput('');
    setPresetFormError('');
  };

  const handleStartRenamePreset = (preset: CustomSpaceThemePreset) => {
    setEditingPresetId(preset.id);
    setEditingPresetName(preset.name);
    setPresetFormError('');
  };

  const handleCommitRenamePreset = () => {
    if (!editingPresetId) return;
    const cleaned = normalizePresetName(editingPresetName);
    if (!cleaned) {
      setPresetFormError('Preset name cannot be empty');
      return;
    }
    const next = renameCustomThemePreset(localPresets, editingPresetId, cleaned);
    commitCustomPresets(next);
    setEditingPresetId(null);
    setEditingPresetName('');
    setPresetFormError('');
  };

  const handleDeleteCustomPreset = (presetId: string) => {
    const next = deleteCustomThemePreset(localPresets, presetId);
    if (editingPresetId === presetId) {
      setEditingPresetId(null);
      setEditingPresetName('');
    }
    setPresetFormError('');
    commitCustomPresets(next);
  };

  const formatPresetSwatchBackground = (theme: SpaceTheme): string => {
    const p1 = theme.points[0].color;
    const p2 = theme.points[1].color;
    const p3 = theme.points[2]?.color;
    return p3
      ? `radial-gradient(circle at 24% 28%, ${p1} 0%, transparent 72%), radial-gradient(circle at 80% 74%, ${p2} 0%, transparent 72%), ${p3}`
      : `linear-gradient(135deg, ${p1} 0%, ${p2} 100%)`;
  };

  const handleSelectPreset = (presetTheme: SpaceTheme) => {
    const cloned = cloneSpaceTheme(presetTheme);
    setSelectedDotIndex(0);
    setHexDraft(cloned.points[0].color);
    setGlowHexDraft(validateAndClampSpaceGlow(cloned.glow, DEFAULT_SPACE_GLOW).color);
    applyLiveAndScheduleSave(cloned, { immediateSave: true, animateTransition: true });
  };

  const handleReset = () => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingCommitThemeRef.current = null;
    if (onResetSpaceTheme) {
      onResetSpaceTheme();
    } else {
      const def = getDefaultSpaceTheme(activeSpace.id);
      setSelectedDotIndex(0);
      setHexDraft(def.points[0].color);
      setGlowHexDraft(validateAndClampSpaceGlow(def.glow, DEFAULT_SPACE_GLOW).color);
      applyLiveAndScheduleSave(def, { immediateSave: true, animateTransition: true });
    }
  };

  const handleDone = () => {
    flushPendingSave();
    onClose();
  };

  if (!isOpen) return null;

  const activeDotIdx = Math.min(selectedDotIndex, draftTheme.points.length - 1);
  const wheelBlendBackground =
    draftTheme.points.length >= 3
      ? `radial-gradient(circle at ${(draftTheme.points[0].x * 100).toFixed(0)}% ${(draftTheme.points[0].y * 100).toFixed(0)}%, ${draftTheme.points[0].color} 0%, transparent 65%), radial-gradient(circle at ${(draftTheme.points[1].x * 100).toFixed(0)}% ${(draftTheme.points[1].y * 100).toFixed(0)}%, ${draftTheme.points[1].color} 0%, transparent 65%), radial-gradient(circle at ${(draftTheme.points[2].x * 100).toFixed(0)}% ${(draftTheme.points[2].y * 100).toFixed(0)}%, ${draftTheme.points[2].color} 0%, transparent 65%)`
      : `radial-gradient(circle at ${(draftTheme.points[0].x * 100).toFixed(0)}% ${(draftTheme.points[0].y * 100).toFixed(0)}%, ${draftTheme.points[0].color} 0%, transparent 70%), radial-gradient(circle at ${(draftTheme.points[1].x * 100).toFixed(0)}% ${(draftTheme.points[1].y * 100).toFixed(0)}%, ${draftTheme.points[1].color} 0%, transparent 70%)`;

  return (
    <div
      className="theme-popover-backdrop"
      onClick={() => {
        flushPendingSave();
        onClose();
      }}
    >
      <div
        className="theme-popover-card"
        role="dialog"
        aria-modal="true"
        aria-label={`Theme editor for ${activeSpace.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="theme-popover-header">
          <div className="theme-popover-title-wrap">
            <h2 className="theme-popover-title">Space Theme</h2>
            <span className="theme-popover-space-badge">{activeSpace.name}</span>
          </div>

          <div className="theme-popover-header-actions">
            <button
              type="button"
              className="theme-popover-btn-ghost"
              onClick={handleReset}
              title="Reset theme for this Space"
              aria-label="Reset Space theme"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
            <button
              type="button"
              className="theme-popover-btn-done"
              onClick={handleDone}
            >
              Done
            </button>
          </div>
        </div>

        {/* Circular Gradient Wheel */}
        <div className="theme-wheel-stage">
          <div
            ref={wheelRef}
            className="theme-color-wheel"
            role="group"
            aria-label="Gradient color wheel"
            onPointerDown={handleWheelPointerDown}
            onPointerMove={handleWheelPointerMove}
            onPointerUp={endWheelDrag}
            onPointerCancel={endWheelDrag}
          >
            <div
              className="theme-wheel-blend-preview"
              style={{ background: wheelBlendBackground }}
              aria-hidden="true"
            />
            {draftTheme.points.map((pt, idx) => {
              const { hue, saturation } = wheelPosToHueSat(pt.x, pt.y);
              return (
                <button
                  key={idx}
                  type="button"
                  data-dot-index={idx}
                  className={`theme-wheel-dot ${idx === activeDotIdx ? 'selected' : ''}`}
                  style={{
                    left: `${(pt.x * 100).toFixed(2)}%`,
                    top: `${(pt.y * 100).toFixed(2)}%`,
                    backgroundColor: pt.color,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedDotIndex(idx);
                    setHexDraft(pt.color);
                  }}
                  onKeyDown={(e) => handleDotKeyDown(e, idx)}
                  aria-label={`Color stop ${idx + 1}: ${pt.color}, hue ${Math.round(hue)} degrees, saturation ${Math.round(saturation)} percent. Use arrow keys to nudge.`}
                  aria-pressed={idx === activeDotIdx}
                />
              );
            })}
          </div>

          <div className="theme-points-toolbar">
            <div className="theme-point-pills">
              {draftTheme.points.map((pt, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`theme-point-pill ${idx === activeDotIdx ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedDotIndex(idx);
                    setHexDraft(pt.color);
                  }}
                >
                  <span className="theme-point-pill-swatch" style={{ backgroundColor: pt.color }} />
                  <span>Stop {idx + 1}</span>
                </button>
              ))}
            </div>

            <div className="theme-point-actions">
              {draftTheme.points.length < 3 && (
                <button
                  type="button"
                  className="theme-popover-btn-ghost"
                  onClick={handleAddThirdPoint}
                  aria-label="Add third gradient color stop"
                  title="Add 3rd gradient point"
                >
                  <Plus size={12} />
                </button>
              )}
              {draftTheme.points.length > 2 && (
                <button
                  type="button"
                  className="theme-popover-btn-ghost"
                  onClick={handleRemovePoint}
                  aria-label={`Remove color stop ${activeDotIdx + 1}`}
                  title="Remove selected color stop"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>

          <div className="theme-point-hex-row">
            <label htmlFor="theme-dot-hex-input" className="theme-hex-label">
              Color {activeDotIdx + 1} Hex
            </label>
            <input
              id="theme-dot-hex-input"
              type="text"
              className="theme-hex-input"
              value={hexDraft}
              onChange={(e) => handleHexChange(e.target.value)}
              onBlur={handleHexBlur}
              maxLength={7}
              spellCheck={false}
              aria-label="Selected gradient stop hex color"
            />
          </div>
        </div>

        {/* Intensity & Grain Sliders */}
        <div className="theme-sliders-group">
          <div className="theme-slider-row">
            <div className="theme-slider-label-row">
              <label htmlFor="theme-intensity-slider">Intensity</label>
              <span className="theme-slider-value">{Math.round(draftTheme.intensity * 100)}%</span>
            </div>
            <input
              id="theme-intensity-slider"
              type="range"
              min={0}
              max={1}
              step={0.01}
              className="theme-range-input"
              value={draftTheme.intensity}
              aria-label="Gradient intensity"
              onChange={(e) => {
                const nextVal = clamp01(parseFloat(e.target.value), draftTheme.intensity);
                applyLiveAndScheduleSave({ ...draftRef.current, intensity: nextVal });
              }}
            />
          </div>

          <div className="theme-slider-row">
            <div className="theme-slider-label-row">
              <label htmlFor="theme-grain-slider">Grain</label>
              <span className="theme-slider-value">{Math.round(draftTheme.grain * 100)}%</span>
            </div>
            <input
              id="theme-grain-slider"
              type="range"
              min={0}
              max={1}
              step={0.01}
              className="theme-range-input"
              value={draftTheme.grain}
              aria-label="Texture grain"
              onChange={(e) => {
                const nextVal = clamp01(parseFloat(e.target.value), draftTheme.grain);
                applyLiveAndScheduleSave({ ...draftRef.current, grain: nextVal });
              }}
            />
          </div>
        </div>

        {/* Light / Dark / Auto Mode Toggle */}
        <div className="theme-mode-segment-row" role="group" aria-label="Space appearance mode">
          <button
            type="button"
            className={`theme-mode-segment-btn ${draftTheme.mode === 'light' ? 'active' : ''}`}
            onClick={() => handleModeChange('light')}
            aria-pressed={draftTheme.mode === 'light'}
          >
            <Sun size={12} />
            <span>Light</span>
          </button>
          <button
            type="button"
            className={`theme-mode-segment-btn ${draftTheme.mode === 'dark' ? 'active' : ''}`}
            onClick={() => handleModeChange('dark')}
            aria-pressed={draftTheme.mode === 'dark'}
          >
            <Moon size={12} />
            <span>Dark</span>
          </button>
          <button
            type="button"
            className={`theme-mode-segment-btn ${draftTheme.mode === 'auto' ? 'active' : ''}`}
            onClick={() => handleModeChange('auto')}
            aria-pressed={draftTheme.mode === 'auto'}
          >
            <Monitor size={12} />
            <span>Auto</span>
          </button>
        </div>

        {/* Ambient Homescreen Glow Customization */}
        <div className="theme-glow-section" aria-label="Homescreen ambient glow settings">
          <div className="theme-glow-header">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Sparkles size={12} aria-hidden="true" />
              Ambient Glow
            </span>
            <span>
              {currentGlow.style === 'off'
                ? 'Off'
                : currentGlow.style === 'prism'
                  ? 'Spectrum'
                  : currentGlow.style === 'custom'
                    ? 'Custom'
                    : 'Match Theme'}
            </span>
          </div>

          <div className="theme-glow-style-row" role="group" aria-label="Ambient glow color mode">
            {(
              [
                { id: 'theme', label: 'Theme' },
                { id: 'prism', label: 'Prism' },
                { id: 'custom', label: 'Custom' },
                { id: 'off', label: 'Off' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`theme-glow-style-btn ${currentGlow.style === opt.id ? 'active' : ''}`}
                onClick={() => handleGlowStyleChange(opt.id)}
                aria-pressed={currentGlow.style === opt.id}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {currentGlow.style === 'custom' && (
            <div className="theme-glow-custom-color-row">
              <label htmlFor="theme-glow-hex-input" className="theme-hex-label">
                Glow Color
              </label>
              <div className="theme-glow-color-controls">
                <input
                  type="color"
                  className="theme-glow-color-picker"
                  value={currentGlow.color}
                  aria-label="Pick ambient glow color"
                  onChange={(e) => {
                    const normalized = normalizeHex(e.target.value, currentGlow.color);
                    setGlowHexDraft(normalized);
                    updateGlow({ style: 'custom', color: normalized }, false);
                  }}
                />
                <input
                  id="theme-glow-hex-input"
                  type="text"
                  className="theme-hex-input"
                  value={glowHexDraft}
                  onChange={(e) => handleGlowHexChange(e.target.value)}
                  onBlur={handleGlowHexBlur}
                  maxLength={7}
                  spellCheck={false}
                  aria-label="Ambient glow hex color"
                />
              </div>
            </div>
          )}

          {currentGlow.style !== 'off' && (
            <div className="theme-glow-sliders-grid">
              <div className="theme-slider-row">
                <div className="theme-slider-label-row">
                  <label htmlFor="theme-glow-intensity-slider">Glow Strength</label>
                  <span className="theme-slider-value">{Math.round(currentGlow.intensity * 100)}%</span>
                </div>
                <input
                  id="theme-glow-intensity-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  className="theme-range-input"
                  value={currentGlow.intensity}
                  aria-label="Ambient glow strength"
                  onChange={(e) => {
                    const nextVal = clamp01(parseFloat(e.target.value), currentGlow.intensity);
                    updateGlow({ intensity: nextVal });
                  }}
                />
              </div>

              <div className="theme-slider-row">
                <div className="theme-slider-label-row">
                  <label htmlFor="theme-glow-speed-slider">Motion Speed</label>
                  <span className="theme-slider-value">
                    {currentGlow.speed <= 0.01 ? 'Paused' : `${Math.round(currentGlow.speed * 100)}%`}
                  </span>
                </div>
                <input
                  id="theme-glow-speed-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  className="theme-range-input"
                  value={currentGlow.speed}
                  aria-label="Ambient glow animation speed"
                  onChange={(e) => {
                    const nextVal = clamp01(parseFloat(e.target.value), currentGlow.speed);
                    updateGlow({ speed: nextVal });
                  }}
                />
              </div>

              <div className="theme-slider-row">
                <div className="theme-slider-label-row">
                  <label htmlFor="theme-glow-size-slider">Aura Spread</label>
                  <span className="theme-slider-value">{Math.round(currentGlow.size * 100)}%</span>
                </div>
                <input
                  id="theme-glow-size-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  className="theme-range-input"
                  value={currentGlow.size}
                  aria-label="Ambient glow spread"
                  onChange={(e) => {
                    const nextVal = clamp01(parseFloat(e.target.value), currentGlow.size);
                    updateGlow({ size: nextVal });
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Saved Custom Presets & Curated Presets */}
        <div className="theme-presets-section">
          <div className="theme-presets-header">
            <span>Presets</span>
            <button
              type="button"
              className="theme-preset-reset-btn"
              onClick={handleReset}
              aria-label="Reset customization to default"
            >
              Reset to default
            </button>
          </div>

          <form className="theme-preset-save-row" onSubmit={handleSaveCustomPreset}>
            <input
              type="text"
              className="theme-preset-name-input"
              placeholder="Save preset as..."
              aria-label="New custom preset name"
              maxLength={40}
              value={presetNameInput}
              onChange={(e) => {
                setPresetNameInput(e.target.value);
                if (presetFormError) setPresetFormError('');
              }}
            />
            <button type="submit" className="theme-preset-save-btn">
              Save
            </button>
          </form>

          {presetFormError && (
            <div className="theme-preset-error" role="alert">
              {presetFormError}
            </div>
          )}

          {localPresets.length > 0 ? (
            <div className="theme-custom-presets-list" role="list" aria-label="Saved custom presets">
              {localPresets.map((preset) => {
                const isEditing = editingPresetId === preset.id;
                const isActive = themesMatchCustomization(draftTheme, preset.theme);
                return (
                  <div
                    key={preset.id}
                    className={`theme-custom-preset-item ${isActive ? 'active' : ''}`}
                    role="listitem"
                  >
                    {isEditing ? (
                      <>
                        <input
                          type="text"
                          className="theme-preset-rename-input"
                          aria-label={`Rename preset ${preset.name}`}
                          maxLength={40}
                          autoFocus
                          value={editingPresetName}
                          onChange={(e) => {
                            setEditingPresetName(e.target.value);
                            if (presetFormError) setPresetFormError('');
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleCommitRenamePreset();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="theme-preset-icon-btn"
                          aria-label={`Confirm rename ${preset.name}`}
                          title="Save name"
                          onClick={handleCommitRenamePreset}
                        >
                          <Check size={12} />
                        </button>
                        <button
                          type="button"
                          className="theme-preset-icon-btn"
                          aria-label="Cancel rename"
                          title="Cancel"
                          onClick={() => {
                            setEditingPresetId(null);
                            setEditingPresetName('');
                            setPresetFormError('');
                          }}
                        >
                          <X size={12} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="theme-custom-preset-load-btn"
                          onClick={() => handleSelectPreset(preset.theme)}
                          title={`Load preset "${preset.name}"`}
                          aria-label={`Load preset ${preset.name}`}
                          aria-pressed={isActive}
                        >
                          <span
                            className="theme-custom-preset-dot"
                            style={{ background: formatPresetSwatchBackground(preset.theme) }}
                            aria-hidden="true"
                          />
                          <span className="theme-custom-preset-name">{preset.name}</span>
                        </button>
                        <button
                          type="button"
                          className="theme-preset-icon-btn"
                          title="Rename preset"
                          aria-label={`Rename preset ${preset.name}`}
                          onClick={() => handleStartRenamePreset(preset)}
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          type="button"
                          className="theme-preset-icon-btn danger"
                          title="Delete preset"
                          aria-label={`Delete preset ${preset.name}`}
                          onClick={() => handleDeleteCustomPreset(preset.id)}
                        >
                          <Trash2 size={11} />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="theme-preset-empty-hint">
              No saved presets yet — name &amp; save your current setup above.
            </div>
          )}

          <div className="theme-presets-subheader">
            <span>Curated</span>
            <span>{SPACE_THEME_PRESETS.length} built-in</span>
          </div>
          <div className="theme-presets-grid">
            {SPACE_THEME_PRESETS.map((preset) => {
              const bg = formatPresetSwatchBackground(preset.theme);

              const isSelected =
                draftTheme.mode === preset.theme.mode &&
                draftTheme.points.length === preset.theme.points.length &&
                draftTheme.points.every((pt, i) => pt.color === preset.theme.points[i].color);

              return (
                <button
                  key={preset.id}
                  type="button"
                  className={`theme-preset-swatch ${isSelected ? 'active' : ''}`}
                  style={{ background: bg }}
                  onClick={() => handleSelectPreset(preset.theme)}
                  title={`${preset.name} — ${preset.description}`}
                  aria-label={`Apply preset ${preset.name}`}
                  aria-pressed={isSelected}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
