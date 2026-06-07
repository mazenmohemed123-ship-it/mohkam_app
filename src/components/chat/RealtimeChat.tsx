import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Edit3, Trash2, MessageSquare, Shield, Scale, Phone, Hash, FileText, User, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Card, Badge } from '../atoms';
import { sanitize } from '../../services/sanitize';
import { supabase } from '../../services/supabase';
import { checkFloodLimit } from '../../services/floodProtection';
import { useRole } from '../../context/RoleContext';

interface Message {
  id: string;
  case_id: string;
  sender_id: string;
  message_text: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

interface CaseInfo {
  id: string;
  case_number: string;
  client_name?: string;
  client_phone?: string;
  case_type?: string;
  judgment?: string;
  total_fees: number;
}

/* Helper functions for emergency/system message detection */
const isEmergencyMessage = (text: string): boolean =>
  text.includes('🆘') || text.includes('【طلب طوارئ') || text.includes('عاجل');

const isSystemMessage = (text: string): boolean =>
  text.startsWith('【') || text.includes('تم قبول') || text.includes('تم رفض');

interface RealtimeChatProps {
  cases: CaseInfo[];
  userId: string;
  push: (msg: string, type: 'success' | 'warning' | 'danger') => void;
}

export function RealtimeChat({ cases, userId, push }: RealtimeChatProps) {
  const { canViewChat } = useRole();
  const [selectedCase, setSelectedCase] = useState<CaseInfo | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const MAX_MSG_LEN = 2000;
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const chRef = useRef<any>(null);

  useEffect(() => {
    if (cases.length > 0 && !selectedCase) {
      setSelectedCase(cases[0]);
    }
  }, [cases, selectedCase]);

  useEffect(() => {
    if (!selectedCase) return;
    setLoading(true);

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('case_id', selectedCase.id)
        .order('created_at', { ascending: true });

      if (!error && data) setMsgs(data);
      setLoading(false);
    };

    fetchMessages();

    chRef.current?.unsubscribe();
    chRef.current = supabase
      .channel('msgs:' + selectedCase.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `case_id=eq.${selectedCase.id}`,
      }, (payload) => {
        setMsgs((prev) => {
          if (prev.some((m) => m.id === payload.new.id)) return prev;
          return [...prev, payload.new as Message];
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'messages',
        filter: `case_id=eq.${selectedCase.id}`,
      }, (payload) => {
        setMsgs((prev) => prev.map((m) => m.id === payload.new.id ? (payload.new as Message) : m));
      })
      .subscribe();

    return () => { chRef.current?.unsubscribe(); };
  }, [selectedCase]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !selectedCase) return;
    if (input.length > MAX_MSG_LEN) { push('⚠️ الرسالة طويلة جداً', 'warning'); return; }

    const { allowed } = checkFloodLimit();
    if (!allowed) {
      push('⚠️ إرسال سريع جداً! انتظر قليلاً قبل الإرسال مرة أخرى', 'warning');
      return;
    }

    const safeInput = sanitize(input);
    const { error } = await supabase.from('messages').insert([{
      case_id: selectedCase.id,
      sender_id: userId,
      message_text: safeInput,
    }]);

    if (!error) setInput('');
    else push('خطأ في الإرسال', 'danger');
  }, [input, selectedCase, userId, push]);

  const deleteMessage = async (id: string) => {
    await supabase.from('messages').update({ is_deleted: true, message_text: '🚫 تم حذف هذه الرسالة' }).eq('id', id);
    setMsgs((prev) => prev.map((m) => m.id === id ? { ...m, is_deleted: true, message_text: '🚫 تم حذف هذه الرسالة' } : m));
  };

  const editMessage = async (id: string) => {
    if (!editText.trim()) return;
    const safeText = sanitize(editText);
    await supabase.from('messages').update({ message_text: safeText }).eq('id', id);
    setMsgs((prev) => prev.map((m) => m.id === id ? { ...m, message_text: safeText } : m));
    setEditingId(null);
    setEditText('');
  };

  if (!canViewChat) {
    return (
      <Card style={{ padding: 32, textAlign: 'center' }}>
        <Shield size={40} color="var(--muted)" style={{ margin: '0 auto 12px' }} />
        <p style={{ fontWeight: 700, color: 'var(--muted)', fontSize: 14 }}>الشات غير متاح لدورك الحالي</p>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: '#fff', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)' }}>
      {/* Case List Sidebar */}
      <div style={{
        width: sidebarCollapsed ? 48 : 220,
        borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        transition: 'width .2s',
        flexShrink: 0,
        background: '#FAFBFE',
      }}>
        <div style={{
          padding: '12px 14px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {!sidebarCollapsed && (
            <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--navy)' }}>قائمة القضايا</span>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: 4, display: 'flex', alignItems: 'center',
            }}
          >
            {sidebarCollapsed ? <ChevronLeft size={16} color="var(--muted)" /> : <ChevronRight size={16} color="var(--muted)" />}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {cases.map((c) => {
            const isSelected = selectedCase?.id === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedCase(c)}
                style={{
                  width: '100%', padding: sidebarCollapsed ? '10px 12px' : '10px 14px',
                  border: 'none', background: isSelected ? '#fff' : 'transparent',
                  cursor: 'pointer', textAlign: 'right',
                  borderRight: isSelected ? '3px solid var(--navy)' : '3px solid transparent',
                  transition: 'all .15s',
                  display: 'flex', alignItems: 'center', gap: sidebarCollapsed ? 0 : 10,
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: isSelected ? 'var(--navy)' : 'var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Scale size={14} color={isSelected ? '#fff' : 'var(--muted)'} />
                </div>
                {!sidebarCollapsed && (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: 12, fontWeight: 700, color: isSelected ? 'var(--navy)' : 'var(--text)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {c.client_name || c.case_number}
                    </p>
                    <p style={{
                      fontSize: 10, color: 'var(--muted)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      {c.case_number}
                    </p>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {selectedCase ? (
          <>
            {/* Case Metadata Header */}
            <div style={{
              padding: '14px 18px', borderBottom: '1px solid var(--border)',
              background: 'linear-gradient(135deg, #F5F8FF, #fff)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 11,
                  background: 'var(--navy)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Scale size={18} color="var(--gold)" />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 900, fontSize: 15, color: 'var(--navy)' }}>
                    {selectedCase.client_name || selectedCase.case_number}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                    {selectedCase.case_number}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span className="pulse" style={{ width: 7, height: 7, background: 'var(--success)', borderRadius: '50%', display: 'inline-block' }} />
                  <span style={{ fontSize: 10, color: 'var(--success)', fontWeight: 700 }}>Real-time</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {selectedCase.case_type && (
                  <Badge color="navy">
                    <FileText size={10} style={{ marginLeft: 4 }} />
                    {selectedCase.case_type}
                  </Badge>
                )}
                {selectedCase.judgment && (
                  <Badge color={/براءة/.test(selectedCase.judgment) ? 'green' : /انتظار/.test(selectedCase.judgment) ? 'orange' : 'default'}>
                    {selectedCase.judgment}
                  </Badge>
                )}
                {selectedCase.client_phone && (
                  <Badge color="default">
                    <Phone size={10} style={{ marginLeft: 4 }} />
                    {selectedCase.client_phone}
                  </Badge>
                )}
                <Badge color="gold">
                  <Hash size={10} style={{ marginLeft: 4 }} />
                  {selectedCase.total_fees?.toLocaleString() || 0} ج
                </Badge>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 10, background: '#FAFBFE' }}>
              {loading && <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>جاري التحميل...</p>}
              {!loading && msgs.length === 0 && (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <MessageSquare size={32} color="var(--border)" style={{ margin: '0 auto 10px' }} />
                  <p style={{ fontSize: 13, color: 'var(--muted)' }}>لا توجد رسائل بعد</p>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>ابدأ المحادثة الآن</p>
                </div>
              )}

              {msgs.map((msg) => {
                const isMe = msg.sender_id === userId;
                const isEmergency = isEmergencyMessage(msg.message_text);
                const isSystem = isSystemMessage(msg.message_text);
                const chatClass = msg.is_deleted
                  ? 'chat-deleted'
                  : isEmergency
                    ? 'chat-emergency'
                    : isSystem
                      ? 'chat-system'
                      : isMe
                        ? 'chat-me'
                        : 'chat-other';
                return (
                  <div
                    key={msg.id}
                    className="fade-up"
                    style={{ display: 'flex', justifyContent: isMe ? 'flex-start' : 'flex-end', position: 'relative' }}
                    onMouseEnter={() => setHoveredId(msg.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <div style={{ position: 'relative', maxWidth: '72%' }}>
                      {isEmergency && !msg.is_deleted && (
                        <div style={{ position: 'absolute', top: -6, right: -6, width: 14, height: 14, background: '#C41E3A', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
                          <span style={{ fontSize: 8, color: '#fff' }}>🆘</span>
                        </div>
                      )}
                      <div
                        className={chatClass}
                        style={{ padding: '10px 14px', fontSize: 13, lineHeight: 1.75, direction: 'rtl' }}
                      >
                        {editingId === msg.id ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <input
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && editMessage(msg.id)}
                              maxLength={MAX_MSG_LEN}
                              style={{
                                flex: 1, padding: '4px 8px', border: '1.5px solid var(--navy-mid)',
                                borderRadius: 6, fontSize: 12, outline: 'none', fontFamily: "'Cairo',sans-serif",
                              }}
                              autoFocus
                            />
                            <Button size="sm" onClick={() => editMessage(msg.id)}>✓</Button>
                          </div>
                        ) : (
                          msg.message_text
                        )}
                        <p style={{ fontSize: 9, marginTop: 4, opacity: 0.45, textAlign: 'left', fontFamily: "'JetBrains Mono', monospace" }}>
                          {new Date(msg.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>

                      {hoveredId === msg.id && !msg.is_deleted && isMe && editingId !== msg.id && (
                        <div style={{
                          position: 'absolute', top: -8, right: 0,
                          display: 'flex', gap: 4, background: '#fff', borderRadius: 6,
                          padding: '2px 4px', boxShadow: '0 2px 8px rgba(0,0,0,.1)', zIndex: 10,
                        }}>
                          <button
                            onClick={() => { setEditingId(msg.id); setEditText(msg.message_text); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontFamily: "'Cairo',sans-serif" }}
                          >
                            <Edit3 size={10} /> تعديل
                          </button>
                          <button
                            onClick={() => deleteMessage(msg.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontFamily: "'Cairo',sans-serif" }}
                          >
                            <Trash2 size={10} /> حذف
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>

            {/* Input */}
            <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, background: '#fff' }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="اكتب رسالة..."
                dir="rtl"
                maxLength={MAX_MSG_LEN}
                style={{
                  flex: 1, padding: '10px 14px', border: '1.5px solid var(--border)',
                  borderRadius: 10, fontSize: 13, fontFamily: "'Cairo',sans-serif", outline: 'none',
                }}
                onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.border = '1.5px solid var(--navy-mid)'; }}
                onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.border = '1.5px solid var(--border)'; }}
              />
              <Button onClick={sendMessage} style={{ padding: '10px 16px' }}>
                <Send size={16} />
              </Button>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, padding: 40 }}>
            <MessageSquare size={40} color="var(--border)" />
            <p style={{ fontWeight: 700, color: 'var(--muted)', fontSize: 14 }}>اختر قضية لبدء المحادثة</p>
          </div>
        )}
      </div>
    </div>
  );
}
