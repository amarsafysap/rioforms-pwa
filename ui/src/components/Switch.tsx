// ui/src/components/Switch.tsx
import React from 'react';

type Props = {
  checked: boolean;
  onChange: (value: boolean) => void;
  id?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
};

export default function Switch({ checked, onChange, id, label, disabled, className }: Props) {
  return (
    <label className={`switch ${className || ''}`} aria-label={label}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        aria-checked={checked}
        role="switch"
      />
      <span className="slider" />
    </label>
  );
}
