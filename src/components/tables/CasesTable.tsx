import { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, X, Copy, Link, Pencil, Check, Lock } from 'lucide-react';
import { Button, Badge } from '../atoms';
import { useRole } from '../../context/RoleContext';

interface Column {
  key: string;
  label: string;
  type: string;
}

interface Row {
  id: string;
  [key: string]: any;
}

interface CasesTableProps {
  cases: Row[];
  columns: Column[];
  onUpdate: (id: string, patch: Record<string, any>) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onAddCol: (name: string) => void;
  onDelCol: (key: string) => void;
  onRowClick: (row: Row) => void;
  selectedId?: string;
  onGenerateInvoiceLink: (row: Row) => void;
}

export function CasesTable({
  cases,
  columns,
  onUpdate,
  onAdd,
  onDelete,
  onAddCol,
  onDelCol,
  onRowClick,
  selectedId,
  onGenerateInvoiceLink,
}: CasesTableProps) {
  const { canDeleteCase, tier } = useRole();
  const [editingCell, setEditingCell] = useState<{ rowId: string; colKey: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [addColName, setAddColName] = useState('');
  const [showAddCol, setShowAddCol] = useState(false);
  const [hoveredCol, setHoveredCol] = useState<string | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const cellRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCell && cellRef.current) cellRef.current.focus();
  }, [editingCell]);

  const isFreeTierLocked = tier === 'free' && cases.length >= 3;

  const startEdit = (rowId: string, colKey: string, value: any) => {
    setEditingCell({ rowId, colKey });
    setEditValue(String(value ?? ''));
  };

  const finishEdit = () => {
    if (editingCell) {
      const patch: Record<string, any> = {};
      const col = columns.find((c) => c.key === editingCell.colKey);
      let val: any = editValue;
      if (col?.type === 'number') val = parseFloat(editValue) || 0;
      patch[editingCell.colKey] = val;
      onUpdate(editingCell.rowId, patch);
      setEditingCell(null);
    }
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const handleAddCol = () => {
    if (addColName.trim()) {
      onAddCol(addColName.trim());
      setAddColName('');
      setShowAddCol(false);
    }
  };

  const handleCopyLink = (row: Row) => {
    const origin = window.location.origin;
    const link = `${origin}/?join_lawyer=${row.lawyer_id}&client_invite_token=${row.case_number}`;
    navigator.clipboard?.writeText(link);
    setCopiedId(row.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div style={{ borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden', background: '#fff' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 50 }}></th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onMouseEnter={() => setHoveredCol(col.key)}
                  onMouseLeave={() => setHoveredCol(null)}
                  style={{ position: 'relative' }}
                >
                  {col.label}
                  {hoveredCol === col.key && col.key !== 'case_number' && col.key !== 'client_name' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelCol(col.key); }}
                      style={{
                        position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)',
                        background: 'var(--danger)', border: 'none', borderRadius: 4,
                        width: 18, height: 18, cursor: 'pointer', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', color: '#fff',
                      }}
                    >
                      <X size={10} />
                    </button>
                  )}
                </th>
              ))}
              <th style={{ width: 140 }}>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((row) => (
              <tr
                key={row.id}
                onClick={() => onRowClick(row)}
                onMouseEnter={() => setHoveredRow(row.id)}
                onMouseLeave={() => setHoveredRow(null)}
                style={{
                  background: selectedId === row.id ? '#F5F8FF' : undefined,
                  cursor: 'pointer',
                }}
              >
                <td style={{ textAlign: 'center' }}>
                  {selectedId === row.id && (
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--navy)', display: 'inline-block' }} />
                  )}
                </td>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    onDoubleClick={(e) => { e.stopPropagation(); startEdit(row.id, col.key, row[col.key]); }}
                    style={{ position: 'relative' }}
                  >
                    {editingCell?.rowId === row.id && editingCell?.colKey === col.key ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input
                          ref={cellRef}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') finishEdit(); if (e.key === 'Escape') cancelEdit(); }}
                          onBlur={finishEdit}
                          type={col.type === 'number' ? 'number' : 'text'}
                          style={{
                            width: '100%', padding: '4px 8px', border: '1.5px solid var(--navy-mid)',
                            borderRadius: 6, fontSize: 12, fontFamily: "'Cairo',sans-serif",
                            outline: 'none',
                          }}
                        />
                        <button onClick={finishEdit} style={{ background: 'var(--success)', border: 'none', borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}>
                          <Check size={12} color="#fff" />
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontFamily: col.type === 'number' ? "'JetBrains Mono', monospace" : undefined }}>
                        {col.type === 'number' && row[col.key] != null
                          ? Number(row[col.key]).toLocaleString()
                          : row[col.key] || '—'}
                      </span>
                    )}
                  </td>
                ))}
                <td>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCopyLink(row); }}
                      title="نسخ رابط دعوة الموكل"
                      style={{
                        background: copiedId === row.id ? 'var(--success)' : 'transparent',
                        border: copiedId === row.id ? 'none' : '1px solid var(--border)',
                        borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4,
                        color: copiedId === row.id ? '#fff' : 'var(--muted)',
                        transition: 'all .15s',
                      }}
                    >
                      {copiedId === row.id ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onGenerateInvoiceLink(row); }}
                      title="رابط دفع الفاتورة"
                      style={{
                        background: 'transparent', border: '1px solid var(--border)',
                        borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center',
                        color: 'var(--gold)',
                      }}
                    >
                      <Link size={12} />
                    </button>
                    {canDeleteCase && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(row.id); }}
                        style={{
                          background: 'transparent', border: '1px solid var(--border)',
                          borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center',
                          color: 'var(--danger)',
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <Button
          size="sm"
          onClick={onAdd}
          disabled={isFreeTierLocked}
          style={{ opacity: isFreeTierLocked ? 0.5 : 1 }}
        >
          {isFreeTierLocked ? <Lock size={12} /> : <Plus size={12} />}
          {isFreeTierLocked ? ' وصلت للحد الأقصى' : ' إضافة صف جديد'}
        </Button>

        {!showAddCol ? (
          <Button size="sm" variant="ghost" onClick={() => setShowAddCol(true)}>
            <Plus size={12} /> عمود جديد
          </Button>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={addColName}
              onChange={(e) => setAddColName(e.target.value)}
              placeholder="اسم العمود"
              style={{
                padding: '4px 10px', border: '1.5px solid var(--border)',
                borderRadius: 8, fontSize: 12, fontFamily: "'Cairo',sans-serif",
                outline: 'none', width: 140,
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddCol(); if (e.key === 'Escape') { setShowAddCol(false); setAddColName(''); } }}
            />
            <Button size="sm" onClick={handleAddCol}>إضافة</Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowAddCol(false); setAddColName(''); }}>
              <X size={12} />
            </Button>
          </div>
        )}
      </div>

      {isFreeTierLocked && (
        <div style={{ padding: '8px 14px', background: '#FFFBEB', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Lock size={12} color="var(--gold)" />
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            الباقة المجانية محدودة بـ 3 قضايا. <strong style={{ color: 'var(--navy)', cursor: 'pointer' }}>قم بالترقية</strong> لإضافة المزيد.
          </span>
        </div>
      )}
    </div>
  );
}
