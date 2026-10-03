import React from 'react';
import { FiSearch, FiX } from 'react-icons/fi';

interface SearchInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function SearchInput({ value, onChange, placeholder = 'Search...', className = '', style }: SearchInputProps) {
  return (
    <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', ...style }} className={className}>
      <FiSearch style={{ position: 'absolute', left: 12, color: 'var(--muted)', fontSize: 16, pointerEvents: 'none' }} />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          paddingLeft: 36,
          paddingRight: value ? 32 : 12,
          height: 38,
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--bg-card, white)',
          fontSize: 13.5,
          color: 'var(--text)',
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          style={{
            position: 'absolute',
            right: 8,
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
          }}
          title="Clear search"
        >
          <FiX style={{ fontSize: 14 }} />
        </button>
      )}
    </div>
  );
}

export default SearchInput;
