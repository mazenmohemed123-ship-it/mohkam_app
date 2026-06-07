import { type ReactNode, type CSSProperties } from 'react';

/* ─── Button ─── */
interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold' | 'success' | 'google';
  size?: 'sm' | 'md' | 'lg';
  style?: CSSProperties;
  fullWidth?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}

const variantMap: Record<string, CSSProperties> = {
  primary: { background: 'var(--navy)', color: '#fff', boxShadow: '0 4px 16px rgba(15,37,87,.25)' },
  secondary: { background: '#fff', color: 'var(--navy)', border: '1.5px solid var(--border)' },
  ghost: { background: 'transparent', color: 'var(--muted)', border: 'none' },
  danger: { background: 'var(--danger)', color: '#fff' },
  gold: { background: 'var(--gold)', color: '#fff', boxShadow: '0 4px 16px rgba(200,149,42,.3)' },
  success: { background: 'var(--success)', color: '#fff' },
  google: { background: '#fff', color: '#333', border: '1.5px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,.08)' },
};
const sizeMap: Record<string, CSSProperties> = {
  sm: { padding: '6px 14px', fontSize: 12 },
  md: { padding: '10px 20px', fontSize: 14 },
  lg: { padding: '14px 28px', fontSize: 15 },
};

export function Button({ children, onClick, disabled, variant = 'primary', size = 'md', style, fullWidth, className, type }: ButtonProps) {
  return (
    <button
      type={type || 'button'}
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        borderRadius: 11, border: 'none', fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1, transition: 'all .15s',
        fontFamily: "'Cairo', sans-serif",
        width: fullWidth ? '100%' : 'auto',
        whiteSpace: 'nowrap',
        ...sizeMap[size], ...variantMap[variant], ...style,
      }}
    >
      {children}
    </button>
  );
}

/* ─── Field ─── */
interface FieldProps {
  label?: string;
  value: string | number;
  onChange?: (v: string) => void;
  type?: string;
  placeholder?: string;
  mono?: boolean;
  error?: string;
  disabled?: boolean;
  suffix?: string;
}

export function Field({ label, value, onChange, type = 'text', placeholder, mono, error, disabled, suffix }: FieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</label>}
      <div style={{ position: 'relative' }}>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            width: '100%', padding: suffix ? '10px 14px 10px 40px' : '10px 14px',
            border: error ? '1.5px solid var(--danger)' : '1.5px solid var(--border)',
            borderRadius: 10, fontSize: 13,
            background: disabled ? 'var(--bg)' : '#fff', color: 'var(--text)',
            outline: 'none', transition: 'border .15s',
            fontFamily: mono ? "'JetBrains Mono', monospace" : "'Cairo', sans-serif",
          }}
          onFocus={(e) => { if (!error) e.currentTarget.style.border = '1.5px solid var(--navy-mid)'; }}
          onBlur={(e) => { if (!error) e.currentTarget.style.border = '1.5px solid var(--border)'; }}
        />
        {suffix && <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--muted)', pointerEvents: 'none' }}>{suffix}</span>}
      </div>
      {error && <p style={{ fontSize: 11, color: 'var(--danger)' }}>{error}</p>}
    </div>
  );
}

/* ─── Badge ─── */
interface BadgeProps {
  children: ReactNode;
  color?: 'default' | 'navy' | 'green' | 'red' | 'gold' | 'orange';
}
const badgeColors: Record<string, { bg: string; text: string; border: string }> = {
  default: { bg: 'var(--bg)', text: 'var(--muted)', border: 'var(--border)' },
  navy: { bg: '#E8EDFB', text: 'var(--navy)', border: '#C5D0F0' },
  green: { bg: '#E6F7EF', text: 'var(--success)', border: '#B3E8CE' },
  red: { bg: '#FDECEF', text: 'var(--danger)', border: '#F5C0CB' },
  gold: { bg: '#FEF7E6', text: 'var(--gold)', border: '#F0D899' },
  orange: { bg: '#FFF3E0', text: 'var(--warning)', border: '#FFCC80' },
};
export function Badge({ children, color = 'default' }: BadgeProps) {
  const c = badgeColors[color];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      {children}
    </span>
  );
}

/* ─── Card ─── */
interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}
export function Card({ children, style, className = '' }: CardProps) {
  return (
    <div className={className} style={{ background: '#fff', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', ...style }}>
      {children}
    </div>
  );
}

/* ─── Spinner ─── */
export function Spinner({ size = 18, color = '#fff' }: { size?: number; color?: string }) {
  return <div className="spin" style={{ width: size, height: size, border: `2.5px solid ${color}33`, borderTopColor: color, borderRadius: '50%', display: 'inline-block' }} />;
}

/* ─── NotificationUI ─── */
import { type NotificationItem } from '../hooks/useNotifications';

const notifIcons: Record<string, string> = { success: '✓', warning: '⚠', danger: '🚨', info: 'ℹ' };
const notifColors: Record<string, string> = { success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)', info: 'var(--navy)' };

export function NotificationUI({ list }: { list: NotificationItem[] }) {
  return (
    <div style={{ position: 'fixed', top: 16, left: 16, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 260, maxWidth: 340 }}>
      {list.map((n) => (
        <div key={n.id} className="slide-up" style={{
          background: notifColors[n.type], color: '#fff', padding: '12px 16px',
          borderRadius: 12, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,.2)',
          display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.4,
        }}>
          <span style={{ fontSize: 16 }}>{notifIcons[n.type]}</span>
          {n.msg}
        </div>
      ))}
    </div>
  );
}

/* ─── Modal ─── */
interface ModalProps {
  children: ReactNode;
  onClose: () => void;
  style?: CSSProperties;
}
export function Modal({ children, onClose, style }: ModalProps) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,20,60,.75)', backdropFilter: 'blur(6px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <Card className="slide-up" style={{ width: '100%', maxWidth: 560, maxHeight: '92vh', overflow: 'auto', ...style }}>
        {children}
      </Card>
    </div>
  );
}

/* ─── Google SVG Icon ─── */
export function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.7 29.3 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l5.7-5.7C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.7 20-21 0-1.3-.1-2.7-.4-4z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3.1 0 5.9 1.1 8.1 2.9l5.7-5.7C34.6 5.1 29.6 3 24 3 16.3 3 9.7 7.9 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 45c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.3 36.3 26.8 37 24 37c-5.2 0-9.5-3.3-11.2-8H6.3C9.7 40.1 16.3 45 24 45z" />
      <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.6-2.6 4.7-4.8 6.2l6.2 5.2C40.4 36 44 30.5 44 24c0-1.3-.1-2.7-.4-4z" />
    </svg>
  );
}
