import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '../services/supabase';

export interface CaseRow {
  id: string;
  lawyer_id: string;
  client_id?: string;
  case_number: string;
  client_name?: string;
  client_phone?: string;
  case_type?: string;
  judgment?: string;
  total_fees: number;
  admin_fees: number;
  [key: string]: any;
}

export interface CaseEvent {
  id: string;
  case_id: string;
  event_type: string;
  event_description?: string;
  metadata?: any;
  created_at: string;
}

export interface AppointmentRequest {
  id: string;
  case_id: string;
  client_id: string;
  lawyer_id: string;
  appointment_date: string;
  appointment_time: string;
  reason?: string;
  status: 'pending' | 'accepted' | 'rejected';
  feedback?: string;
  alternative_time?: string;
  responded_by?: string;
  responded_at?: string;
  created_at: string;
}

export interface LawyerAvailability {
  id: string;
  lawyer_id: string;
  available_days: string[];
  time_slots: string[];
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface EmergencyPayload {
  caseId: string;
  createdBy: string;
  essentialNeeds: string;
  emergencyCosts?: number;
}

interface CaseContextType {
  cases: CaseRow[];
  events: CaseEvent[];
  appointments: AppointmentRequest[];
  availability: LawyerAvailability | null;
  selectedCase: CaseRow | null;
  setSelectedCase: (c: CaseRow | null) => void;
  loadCases: (lawyerId: string) => Promise<void>;
  loadEvents: (caseId: string) => Promise<void>;
  loadAppointments: (lawyerId: string) => Promise<void>;
  loadAvailability: (lawyerId: string) => Promise<void>;
  addCase: (payload: Partial<CaseRow>) => Promise<CaseRow | null>;
  updateCase: (id: string, patch: Partial<CaseRow>) => Promise<boolean>;
  deleteCase: (id: string) => Promise<boolean>;
  addEvent: (caseId: string, eventType: string, description: string, metadata?: any) => Promise<void>;
  requestAppointment: (payload: Partial<AppointmentRequest>) => Promise<boolean>;
  respondAppointment: (
    id: string,
    status: 'accepted' | 'rejected',
    options?: {
      alternativeTime?: string;
      responderId: string;
      responderRole: string;
      responderName?: string;
    }
  ) => Promise<boolean>;
  triggerEmergency: (payload: EmergencyPayload) => Promise<boolean>;
  updateAvailability: (lawyerId: string, data: Partial<LawyerAvailability>) => Promise<boolean>;
}

const CaseContext = createContext<CaseContextType | undefined>(undefined);

export function CaseProvider({ children }: { children: ReactNode }) {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [events, setEvents] = useState<CaseEvent[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRequest[]>([]);
  const [availability, setAvailability] = useState<LawyerAvailability | null>(null);
  const [selectedCase, setSelectedCase] = useState<CaseRow | null>(null);

  const loadCases = useCallback(async (lawyerId: string) => {
    const { data, error } = await supabase
      .from('cases')
      .select('*')
      .eq('lawyer_id', lawyerId)
      .order('created_at', { ascending: false });
    if (!error && data) setCases(data);
  }, []);

  const loadEvents = useCallback(async (caseId: string) => {
    const { data, error } = await supabase
      .from('case_events')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true });
    if (!error && data) setEvents(data);
  }, []);

  const loadAppointments = useCallback(async (lawyerId: string) => {
    const { data, error } = await supabase
      .from('appointment_requests')
      .select('*')
      .eq('lawyer_id', lawyerId)
      .order('created_at', { ascending: false });
    if (!error && data) setAppointments(data || []);
  }, []);

  const loadAvailability = useCallback(async (lawyerId: string) => {
    const { data, error } = await supabase
      .from('lawyer_availability')
      .select('*')
      .eq('lawyer_id', lawyerId)
      .single();
    if (!error && data) setAvailability(data);
    else if (error?.code === 'PGRST116') {
      // No availability record exists, create default
      const { data: newData } = await supabase
        .from('lawyer_availability')
        .insert([{ lawyer_id: lawyerId }])
        .select()
        .single();
      if (newData) setAvailability(newData);
    }
  }, []);

  const addCase = useCallback(async (payload: Partial<CaseRow>): Promise<CaseRow | null> => {
    const { data, error } = await supabase.from('cases').insert([payload]).select().single();
    if (error || !data) return null;
    setCases((prev) => [data, ...prev]);
    return data;
  }, []);

  const updateCase = useCallback(async (id: string, patch: Partial<CaseRow>): Promise<boolean> => {
    const { error } = await supabase.from('cases').update(patch).eq('id', id);
    if (!error) {
      setCases((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
      return true;
    }
    return false;
  }, []);

  const deleteCase = useCallback(async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('cases').delete().eq('id', id);
    if (!error) {
      setCases((prev) => prev.filter((c) => c.id !== id));
      if (selectedCase?.id === id) setSelectedCase(null);
      return true;
    }
    return false;
  }, [selectedCase]);

  const addEvent = useCallback(
    async (caseId: string, eventType: string, description: string, metadata?: any) => {
      const { data, error } = await supabase
        .from('case_events')
        .insert([{ case_id: caseId, event_type: eventType, event_description: description, metadata }])
        .select()
        .single();
      if (!error && data) {
        setEvents((prev) => [...prev, data]);
      }
    },
    []
  );

  const requestAppointment = useCallback(async (payload: Partial<AppointmentRequest>): Promise<boolean> => {
    const { error } = await supabase.from('appointment_requests').insert([payload]);
    return !error;
  }, []);

  /**
   * Respond to an appointment request with status and optional alternative time.
   * Injects an automated message into the messages table for real-time chat visibility.
   */
  const respondAppointment = useCallback(
    async (
      id: string,
      status: 'accepted' | 'rejected',
      options?: {
        alternativeTime?: string;
        responderId: string;
        responderRole: string;
        responderName?: string;
      }
    ): Promise<boolean> => {
      const update: any = {
        status,
        responded_by: options?.responderId,
        responded_at: new Date().toISOString(),
      };
      if (options?.alternativeTime) {
        update.alternative_time = options.alternativeTime;
      }

      const { data: appointment, error: updateError } = await supabase
        .from('appointment_requests')
        .update(update)
        .eq('id', id)
        .select()
        .single();

      if (updateError || !appointment) return false;

      // Update local state
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...update } : a))
      );

      // Inject automated message into messages table for real-time chat visibility
      const caseId = appointment.case_id;
      const responderLabel = options?.responderRole === 'lawyer' ? 'المحامي'
        : options?.responderRole === 'secretary' ? 'السكرتارية'
        : options?.responderRole === 'partner' ? 'الشريك'
        : 'المكتب';

      let messageText: string;
      if (status === 'accepted') {
        const timeInfo = options?.alternativeTime
          ? `الساعة ${options.alternativeTime}`
          : (appointment.appointment_time ? `الساعة ${appointment.appointment_time}` : '');
        messageText = `⚖️ تم قبول طلب موعدكم ليوم ${appointment.appointment_date} ${timeInfo} وجاري تثبيته بالجدول.`;
      } else {
        const altInfo = options?.alternativeTime
          ? `\n📅 يمكن إعادة الحجز في الوقت المقترح: ${options.alternativeTime}`
          : '';
        messageText = `❌ تم رفض طلب الموعد.${altInfo}\nيرجى التواصل لإعادة الحجز.`;
      }

      // Insert the message signed by the responder role
      await supabase.from('messages').insert([{
        case_id: caseId,
        sender_id: options?.responderId,
        sender_role: options?.responderRole || 'lawyer',
        message_text: `【${responderLabel}】${messageText}`,
      }]);

      // Also add a case event for audit trail
      await supabase.from('case_events').insert([{
        case_id: caseId,
        event_type: 'APPOINTMENT_RESPONSE',
        event_description: `📅 ${status === 'accepted' ? 'تم قبول' : 'تم رفض'} طلب الموعد - ${appointment.appointment_date}`,
        metadata: { appointment_id: id, status, alternative_time: options?.alternativeTime },
      }]);

      return true;
    },
    []
  );

  /**
   * Trigger a client emergency and inject high-visibility alert into messages.
   */
  const triggerEmergency = useCallback(async (payload: EmergencyPayload): Promise<boolean> => {
    const { data: emergency, error } = await supabase
      .from('case_emergencies')
      .insert([{
        case_id: payload.caseId,
        created_by: payload.createdBy,
        essential_needs: payload.essentialNeeds,
        emergency_costs: payload.emergencyCosts || 0,
        needs_status: 'عاجل',
      }])
      .select()
      .single();

    if (error || !emergency) return false;

    // Inject high-visibility alert message into messages table
    // This forces instant rendering in both lawyer and client chat logs
    await supabase.from('messages').insert([{
      case_id: payload.caseId,
      sender_id: payload.createdBy,
      sender_role: 'client',
      message_text: `🆘 【طلب طوارئ عاجل】\n${payload.essentialNeeds}\n⚠️ الرجاء الرد بأسرع وقت ممكن.`,
    }]);

    // Add case event for audit
    await supabase.from('case_events').insert([{
      case_id: payload.caseId,
      event_type: 'EMERGENCY_TRIGGERED',
      event_description: `🆘 تم إرسال طلب طوارئ عاجل`,
      metadata: { emergency_id: emergency.id, essential_needs: payload.essentialNeeds },
    }]);

    return true;
  }, []);

  const updateAvailability = useCallback(async (
    lawyerId: string,
    data: Partial<LawyerAvailability>
  ): Promise<boolean> => {
    const { error } = await supabase
      .from('lawyer_availability')
      .upsert({
        lawyer_id: lawyerId,
        ...data,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'lawyer_id' });

    if (!error) {
      // Reload availability
      await loadAvailability(lawyerId);
      return true;
    }
    return false;
  }, [loadAvailability]);

  return (
    <CaseContext.Provider
      value={{
        cases,
        events,
        appointments,
        availability,
        selectedCase,
        setSelectedCase,
        loadCases,
        loadEvents,
        loadAppointments,
        loadAvailability,
        addCase,
        updateCase,
        deleteCase,
        addEvent,
        requestAppointment,
        respondAppointment,
        triggerEmergency,
        updateAvailability,
      }}
    >
      {children}
    </CaseContext.Provider>
  );
}

export function useCase() {
  const ctx = useContext(CaseContext);
  if (!ctx) throw new Error('useCase must be used within CaseProvider');
  return ctx;
}
