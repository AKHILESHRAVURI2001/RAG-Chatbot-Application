import React from 'react';

interface FormFieldProps {
  label: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({ label, description, children, className = '' }: FormFieldProps) {
  return (
    <div className={`form-field-group ${className}`} style={{ marginBottom: '16px' }}>
      <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px', color: '#1e293b' }}>
        {label}
      </label>
      {description && (
        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', lineHeight: 1.4 }}>
          {description}
        </div>
      )}
      {children}
    </div>
  );
}

export function FormInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: '100%',
        padding: '8px 12px',
        fontSize: '13.5px',
        borderRadius: '6px',
        border: '1px solid #cbd5e1',
        outline: 'none',
        transition: 'border-color 0.15s ease',
        ...props.style,
      }}
    />
  );
}

export function FormTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      style={{
        width: '100%',
        padding: '8px 12px',
        fontSize: '13.5px',
        borderRadius: '6px',
        border: '1px solid #cbd5e1',
        outline: 'none',
        fontFamily: 'inherit',
        transition: 'border-color 0.15s ease',
        ...props.style,
      }}
    />
  );
}

export function FormSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      style={{
        width: '100%',
        padding: '8px 12px',
        fontSize: '13.5px',
        borderRadius: '6px',
        border: '1px solid #cbd5e1',
        outline: 'none',
        backgroundColor: '#ffffff',
        cursor: 'pointer',
        transition: 'border-color 0.15s ease',
        ...props.style,
      }}
    />
  );
}
