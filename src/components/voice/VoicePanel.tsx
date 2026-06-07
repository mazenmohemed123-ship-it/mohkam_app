import { useState, useRef } from 'react';
import { Mic, MicOff, Type, X, RefreshCw, Save, AlertCircle } from 'lucide-react';
import { Button, Field, Modal, Spinner } from '../atoms';
import { supabase, sendPushToClient } from '../../services/supabase';
import { detectIntent, type ParsedVoice } from '../../services/voiceParser';
import { sanitize } from '../../services/sanitize';

interface VoicePanelProps {
  cases: any[];
  lawyerId: string;
  onDone: () => void;
  onClose: () => void;
  push: (msg: string, type: 'success' | 'warning' | 'danger') => void;
}

export function VoicePanel({ cases, lawyerId, onDone, onClose, push }: VoicePanelProps) {
  const [mode, setMode] = useState<'idle' | 'listening' | 'preview' | 'text'>('idle');
  const [transcript, setTranscript] = useState('');
  const [textIn, setTextIn] = useState('');
  const [result, setResult] = useState<any>(null);
  const [fields, setFields] = useState<Partial<ParsedVoice>>({});
  const [saving, setSaving] = useState(false);
  const recRef = useRef<any>(null);

  const startListen = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('استخدم Chrome أو Edge للتسجيل الصوتي'); return; }
    const r = new SR();
    r.lang = 'ar-EG'; r.continuous = true; r.interimResults = true;
    r.onresult = (e: any) => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript + ' ';
      setTranscript(t.trim());
    };
    r.onerror = () => setMode('idle');
    r.start();
    recRef.current = r;
    setMode('listening');
  };

  const process = (text: string) => {
    recRef.current?.stop();
    const r = detectIntent(text, cases);
    setResult(r);
    const merged = r.existing ? { ...r.existing, ...r.parsed } : r.parsed;
    setFields({ ...merged, case_number: merged.case_number || 'MHK-' + Date.now().toString().slice(-5) });
    setMode('preview');
  };

  const saveToSupabase = async () => {
    setSaving(true);
    try {
      const payload = {
        case_number: sanitize(fields.case_number || ''),
        case_type: sanitize(fields.case_type || 'عام'),
        client_name: sanitize(fields.client_name || 'غير محدد'),
        client_phone: fields.client_phone || '',
        judgment: sanitize(fields.judgment || 'قيد الانتظار'),
        total_fees: parseFloat(String(fields.total_fees)) || 0,
        admin_fees: parseFloat(String(fields.admin_fees)) || 0,
        lawyer_id: lawyerId,
      };
      if (result?.type === 'update' && result.existing?.id) {
        const { error } = await supabase.from('cases').update(payload).eq('id', result.existing.id);
        if (error) throw error;
        if (result.existing.client_id) await sendPushToClient(result.existing.client_id, 'تحديث على قضيتك', `تم تحديث قضية ${fields.client_name}: ${fields.judgment}`);
        push(`✏️ تم تحديث قضية ${fields.client_name} — إشعار أُرسل`, 'warning');
      } else {
        const { error } = await supabase.from('cases').insert([payload]);
        if (error) throw error;
        push(`✨ تمت إضافة قضية ${fields.client_name}`, 'success');
      }
      onDone();
      onClose();
    } catch (e: any) {
      push(`خطأ في الحفظ: ${e.message}`, 'danger');
    }
    setSaving(false);
  };

  const previewCols = [
    { key: 'client_name', label: 'اسم الموكل' },
    { key: 'case_number', label: 'رقم القضية', mono: true },
    { key: 'case_type', label: 'نوع القضية' },
    { key: 'judgment', label: 'الحكم' },
    { key: 'total_fees', label: 'الأتعاب (جنيه)', type: 'number' },
    { key: 'admin_fees', label: 'المصاريف الإدارية (جنيه)', type: 'number' },
    { key: 'client_phone', label: 'رقم الهاتف', type: 'tel' },
  ];

  return (
    <Modal onClose={onClose}>
      {/* Header */}
      <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Mic size={18} /> {mode === 'preview' ? (result?.type === 'update' ? '✏️ تحديث قضية' : '✨ قضية جديدة') : 'إضافة / تحديث قضية'}
        </h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {mode !== 'preview' && (
            <Button size="sm" variant={mode === 'text' ? 'primary' : 'secondary'} onClick={() => setMode(mode === 'text' ? 'idle' : 'text')}>
              {mode === 'text' ? <><Mic size={14} /> صوت</> : <><Type size={14} /> كتابة</>}
            </Button>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--muted)', width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={18} />
          </button>
        </div>
      </div>

      <div style={{ padding: 20 }}>
        {/* Text input mode */}
        {mode === 'text' && (
          <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>اكتب وصف القضية أو التحديث بشكل طبيعي:</p>
            <textarea value={textIn} onChange={(e) => setTextIn(e.target.value)} rows={5} maxLength={2000}
              placeholder={'قضية أحمد محمد رقم 404040 الحكم براءة الأتعاب 1000 جنيه\nأو: مصاريف إدارية 2000 جنيه قضية رقم 404040'}
              style={{ width: '100%', padding: 14, border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, resize: 'vertical', fontFamily: "'Cairo',sans-serif", outline: 'none', lineHeight: 1.8, direction: 'rtl' }}
            />
            <Button onClick={() => process(textIn)} disabled={!textIn.trim()} fullWidth>تحليل النص</Button>
          </div>
        )}

        {/* Voice recording mode */}
        {(mode === 'idle' || mode === 'listening') && (
          <div className="fade-up" style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
              {mode === 'listening' && (
                <>
                  <div className="ping" style={{ position: 'absolute', width: 104, height: 104, borderRadius: '50%', background: 'rgba(59,95,192,.2)' }} />
                  <div className="ping" style={{ position: 'absolute', width: 136, height: 136, borderRadius: '50%', background: 'rgba(59,95,192,.1)', animationDelay: '.35s' }} />
                </>
              )}
              <button
                onClick={mode === 'listening' ? () => process(transcript) : startListen}
                className={mode === 'listening' ? 'mic-active' : ''}
                style={{
                  width: 90, height: 90, borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: mode === 'listening' ? 'var(--navy-light)' : 'var(--navy)',
                  color: '#fff', fontSize: 34,
                  boxShadow: '0 8px 30px rgba(15,37,87,.3)', transition: 'all .3s',
                  position: 'relative', zIndex: 1,
                }}
              >
                {mode === 'listening' ? <MicOff size={32} /> : <Mic size={32} />}
              </button>
            </div>

            {mode === 'listening' ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14 }}>
                  <span className="pulse" style={{ width: 9, height: 9, background: 'var(--danger)', borderRadius: '50%', display: 'inline-block' }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>جاري الاستماع...</span>
                </div>
                {transcript && (
                  <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 12, fontSize: 12, color: 'var(--muted)', direction: 'rtl', textAlign: 'right', minHeight: 50, lineHeight: 1.7 }}>
                    {transcript}
                  </div>
                )}
                <Button variant="danger" style={{ marginTop: 16 }} onClick={() => process(transcript)}>
                  <MicOff size={14} /> إيقاف ومعالجة
                </Button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 8 }}>اضغط للتحدث</p>
                <p style={{ fontSize: 12, color: 'var(--muted)', opacity: 0.65, lineHeight: 1.7 }}>
                  "قضية أحمد محمد رقم 404040 الحكم براءة الأتعاب ألف جنيه"
                </p>
              </>
            )}
          </div>
        )}

        {/* Preview & edit mode */}
        {mode === 'preview' && result && (
          <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{
              background: result.type === 'update' ? '#FFFBEB' : '#EFF6FF',
              borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              {result.type === 'update' ? <AlertCircle size={20} color="var(--warning)" /> : <AlertCircle size={20} color="var(--navy)" />}
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: result.type === 'update' ? 'var(--warning)' : 'var(--navy)' }}>
                  {result.type === 'update' ? `تحديث: ${result.existing?.client_name || 'قضية موجودة'}` : 'قضية جديدة'}
                </p>
                <p style={{ fontSize: 11, color: 'var(--muted)' }}>راجع وعدّل البيانات قبل الحفظ</p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {previewCols.map((col) => (
                <Field
                  key={col.key}
                  label={col.label}
                  value={fields[col.key as keyof ParsedVoice] || ''}
                  onChange={(v) => setFields((p) => ({ ...p, [col.key]: v }))}
                  type={col.type || 'text'}
                  mono={col.mono}
                  placeholder={col.label}
                />
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button fullWidth onClick={saveToSupabase} disabled={saving}>
                {saving ? <><Spinner /> جاري الحفظ...</> : <><Save size={14} /> {result.type === 'update' ? 'تحديث وإرسال إشعار' : 'حفظ في Supabase'}</>}
              </Button>
              <Button variant="secondary" onClick={() => setMode('idle')}>
                <RefreshCw size={14} /> إعادة
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
