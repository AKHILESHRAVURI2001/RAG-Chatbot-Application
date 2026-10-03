import React from 'react';

interface RangeSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  displayValue?: string | number;
  onChange: (value: number) => void;
  helpText?: string;
  disabled?: boolean;
}

export function RangeSlider({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  displayValue,
  onChange,
  helpText,
  disabled = false,
}: RangeSliderProps) {
  const formattedValue = displayValue !== undefined ? displayValue : `${value}${unit ? ` ${unit}` : ''}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-main, #1e293b)', margin: 0 }}>
          {label}
        </label>
        <span className="badge" style={{ background: '#f1f5f9', color: '#475569', fontSize: 12, fontWeight: 600 }}>
          {formattedValue}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', cursor: disabled ? 'not-allowed' : 'pointer' }}
      />
      {helpText && (
        <p className="muted small" style={{ margin: 0, fontSize: 12 }}>
          {helpText}
        </p>
      )}
    </div>
  );
}
