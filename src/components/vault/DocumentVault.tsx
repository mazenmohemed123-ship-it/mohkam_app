import { useState, useCallback } from 'react';
import { Upload, FileText, Image, File, Download, Trash2, Lock, FolderOpen } from 'lucide-react';
import { Card, Button, Badge } from '../atoms';
import { supabase } from '../../services/supabase';
import { useRole } from '../../context/RoleContext';

interface Document {
  id: string;
  case_id: string;
  uploaded_by: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  download_token: string;
  created_at: string;
}

interface DocumentVaultProps {
  caseId: string;
  userId: string;
  push: (msg: string, type: 'success' | 'warning' | 'danger') => void;
}

const FILE_SIZE_LIMIT = 25 * 1024 * 1024; // 25MB

export function DocumentVault({ caseId, userId, push }: DocumentVaultProps) {
  const { canUploadFiles } = useRole();
  const [docs, setDocs] = useState<Document[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadDocs = useCallback(async () => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false });
    if (!error && data) setDocs(data);
    setLoading(false);
  }, [caseId]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || !canUploadFiles) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      if (file.size > FILE_SIZE_LIMIT) {
        push(`الملف ${file.name} أكبر من 25MB`, 'danger');
        continue;
      }
      const path = `cases/${caseId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from('documents')
        .upload(path, file, { upsert: true });

      if (uploadErr) {
        push(`خطأ في رفع ${file.name}`, 'danger');
        continue;
      }

      const token = crypto.randomUUID ? crypto.randomUUID() : 'tk_' + Date.now();
      await supabase.from('documents').insert([{
        case_id: caseId,
        uploaded_by: userId,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        storage_path: path,
        download_token: token,
      }]);

      push(`✓ تم رفع ${file.name}`, 'success');
    }

    await loadDocs();
    setUploading(false);
  };

  const handleDelete = async (doc: Document) => {
    await supabase.storage.from('documents').remove([doc.storage_path]);
    await supabase.from('documents').delete().eq('id', doc.id);
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    push('تم حذف المستند', 'warning');
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (type: string) => {
    if (type.includes('pdf')) return FileText;
    if (type.startsWith('image/')) return Image;
    return File;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3 style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <FolderOpen size={18} /> المستندات المحمية
      </h3>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); if (canUploadFiles) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (canUploadFiles) handleUpload(e.dataTransfer.files); }}
        onClick={() => {
          if (!canUploadFiles) return;
          const input = document.createElement('input');
          input.type = 'file';
          input.multiple = true;
          input.onchange = (e) => handleUpload((e.target as HTMLInputElement).files);
          input.click();
        }}
        style={{
          border: `2px dashed ${canUploadFiles ? (dragOver ? 'var(--navy)' : 'var(--border)') : '#ccc'}`,
          borderRadius: 14, padding: 32, textAlign: 'center',
          background: dragOver ? '#F0F4FC' : canUploadFiles ? '#FAFBFE' : '#f5f5f5',
          cursor: canUploadFiles ? 'pointer' : 'not-allowed',
          transition: 'all .2s', opacity: canUploadFiles ? 1 : 0.6,
          position: 'relative',
        }}
      >
        <Upload size={28} color={canUploadFiles ? 'var(--navy)' : '#ccc'} style={{ margin: '0 auto 8px' }} />
        <p style={{ fontSize: 13, fontWeight: 700, color: canUploadFiles ? 'var(--navy)' : '#999' }}>
          {canUploadFiles ? 'اسحب الملفات هنا أو اضغط للرفع' : 'رفع الملفات مقفل لدورك الحالي'}
        </p>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>PDF, JPG, PNG — حتى 25MB</p>
        {uploading && (
          <div style={{ marginTop: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--navy)', fontWeight: 700 }}>⏳ جاري الرفع...</span>
          </div>
        )}
        {!canUploadFiles && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.6)', borderRadius: 14 }}>
            <Lock size={20} color="#999" />
          </div>
        )}
      </div>

      {/* Document list */}
      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>جاري تحميل المستندات...</p>
      ) : docs.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--muted)', padding: 20, fontSize: 13 }}>لا توجد مستندات محفوظة</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {docs.map((doc) => {
            const Icon = getFileIcon(doc.file_type || '');
            return (
              <Card key={doc.id} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: doc.file_type?.includes('pdf') ? '#FDECEF' : doc.file_type?.startsWith('image/') ? '#E6F7EF' : '#F5F8FF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon size={16} color={doc.file_type?.includes('pdf') ? 'var(--danger)' : 'var(--navy)'} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.file_name}</p>
                  <p style={{ fontSize: 11, color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                    {formatSize(doc.file_size)} · {new Date(doc.created_at).toLocaleDateString('ar-EG')}
                  </p>
                </div>
                <Badge color="default">{doc.file_type?.split('/').pop()?.toUpperCase() || 'FILE'}</Badge>
                <Button size="sm" variant="ghost" onClick={() => {
                  const { data } = supabase.storage.from('documents').getPublicUrl(doc.storage_path);
                  if (data?.publicUrl) window.open(data.publicUrl, '_blank');
                }}>
                  <Download size={14} />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(doc)}>
                  <Trash2 size={14} color="var(--danger)" />
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
