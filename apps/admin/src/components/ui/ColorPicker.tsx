interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  presets: string[];
}

/** Swatch + hex input + a row of one-click preset swatches — the same color-editing UI reused for the widget's primary color and the admin panel's own branding color. */
export default function ColorPicker({ value, onChange, presets }: ColorPickerProps) {
  return (
    <div className="color-picker-row">
      <label className="color-swatch" style={{ background: value }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
      <input className="color-hex-input" value={value} onChange={(e) => onChange(e.target.value)} maxLength={7} />
      <div className="color-presets">
        {presets.map((c) => (
          <button key={c} type="button" className="color-preset-swatch" style={{ background: c }} title={c} onClick={() => onChange(c)} />
        ))}
      </div>
    </div>
  );
}
