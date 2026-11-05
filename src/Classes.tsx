import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronDown, ChevronRight, ClipboardCheck, School, Trash2, UserPlus, Users } from 'lucide-react';
import { api, type User } from './api';
import { Modal } from './Modal';

export type ClassSummary = { id: string; name: string; joinCode: string; memberCount?: number; pendingCount?: number; teacherName?: string };
type Invitation = { id: string; classId: string; className: string; teacherName?: string; expiresAt: number };
export type ClassData = { classes: ClassSummary[]; invitations: Invitation[]; requests: Invitation[] };
type Member = { studentId?: string; fullName: string; nickname?: string; publicId?: string; progress?: { lessonId: string; lessonTitle: string; evaluation: { message: string }; completedAt: number }[]; note?: { body: string } | null };
type ClassRequest = { id: string; kind: 'invite' | 'join_request'; student: { fullName: string; publicId: string } };
type Draft = { body: string; savedBody: string };
const draftKey = (classId: string, studentId: string) => `${classId}:${studentId}`;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Có lỗi xảy ra. Vui lòng thử lại.';

export function Classes({ user, onDirtyChange }: { user: User; onDirtyChange: (dirty: boolean) => void }) {
  const teacher = user.role === 'teacher';
  const [data, setData] = useState<ClassData>({ classes: [], invitations: [], requests: [] });
  const [selected, setSelected] = useState<ClassSummary | null>(null);
  const selectedId = useRef<string | null>(null);
  const readVersion = useRef(0);
  const listVersion = useRef(0);
  const mounted = useRef(true);
  const mutationLock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [detail, setDetail] = useState<{ classId: string; members: Member[]; requests: ClassRequest[] } | null>(null);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [message, setMessage] = useState('');
  const [confirmation, setConfirmation] = useState<{ kind: 'delete' | 'leave' | 'remove'; member?: Member } | null>(null);
  const dirty = Object.values(drafts).some(draft => draft.body !== draft.savedBody);
  const current = detail?.classId === selected?.id ? detail : null;

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; readVersion.current++; listVersion.current++; onDirtyChange(false); };
  }, [onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const refresh = useCallback(async () => {
    const version = ++listVersion.current;
    try {
      const value = await api<ClassData>('/classes');
      if (mounted.current && version === listVersion.current) setData(value);
      return value;
    } catch (error) {
      if (mounted.current && version === listVersion.current) setMessage(errorMessage(error));
      return null;
    } finally { if (mounted.current && version === listVersion.current) setListLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const update = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = window.setInterval(update, 30_000);
    window.addEventListener('focus', update);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); };
  }, [refresh]);

  async function openClass(classroom: ClassSummary) {
    const version = ++readVersion.current;
    selectedId.current = classroom.id;
    setSelected(classroom); setExpandedStudentId(null); setDetail(null); setLoading(true); setMessage('');
    try {
      const [members, requests] = await Promise.all([
        api<{ members: Member[] }>(`/classes/${classroom.id}/members`),
        teacher ? api<{ requests: ClassRequest[] }>(`/classes/${classroom.id}/requests`) : Promise.resolve({ requests: [] }),
      ]);
      if (mounted.current && version === readVersion.current && selectedId.current === classroom.id) {
        setDetail({ classId: classroom.id, members: members.members, requests: requests.requests });
      }
    } catch (error) {
      if (mounted.current && version === readVersion.current) setMessage(errorMessage(error));
    } finally { if (mounted.current && version === readVersion.current) setLoading(false); }
  }
  function backToList() {
    readVersion.current++; selectedId.current = null;
    setSelected(null); setDetail(null); setLoading(false); setMessage('');
    void refresh();
  }
  async function mutate(action: () => Promise<void>) {
    if (mutationLock.current) return;
    mutationLock.current = true; setBusy(true); setMessage('');
    try { await action(); }
    catch (error) { if (mounted.current) setMessage(errorMessage(error)); }
    finally {
      mutationLock.current = false;
      if (mounted.current) setBusy(false);
      window.dispatchEvent(new Event('classes-changed'));
    }
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const name = new FormData(form).get('name');
    void mutate(async () => { await api('/classes', { name }); form.reset(); await refresh(); });
  }
  function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const code = new FormData(form).get('code');
    void mutate(async () => {
      await api('/classes/join', { code }); form.reset(); await refresh();
      setMessage('Yêu cầu tham gia đã được gửi tới giáo viên.');
    });
  }
  function respondToInvitation(item: Invitation, decision: 'accept' | 'reject') {
    void mutate(async () => {
      try {
        await api(`/classes/${item.classId}/requests/${item.id}/respond`, { decision });
        const latest = await refresh();
        if (decision === 'accept') {
          await openClass(latest?.classes.find(c => c.id === item.classId) ?? { id: item.classId, name: item.className, joinCode: '' });
        } else setMessage('Đã từ chối lời mời.');
      } catch (error) { await refresh(); throw error; }
    });
  }
  function respondToRequest(id: string, decision: 'accept' | 'reject') {
    if (!selected || !current || loading) return;
    const classroom = selected;
    void mutate(async () => {
      try { await api(`/classes/${classroom.id}/requests/${id}/respond`, { decision }); }
      finally { await openClass(classroom); await refresh(); }
    });
  }
  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || !current) return;
    const classroom = selected; const form = event.currentTarget; const studentId = new FormData(form).get('studentId');
    void mutate(async () => {
      await api(`/classes/${classroom.id}/invite`, { studentId }); form.reset();
      const value = await api<{ requests: ClassRequest[] }>(`/classes/${classroom.id}/requests`);
      if (selectedId.current === classroom.id) setDetail(old => old?.classId === classroom.id ? { ...old, requests: value.requests } : old);
      setMessage('Đã gửi lời mời vào lớp.'); await refresh();
    });
  }
  function saveNote(member: Member, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !current || !member.studentId || loading) return;
    const classId = current.classId, studentId = member.studentId;
    const key = draftKey(classId, studentId);
    const body = (drafts[key]?.body ?? member.note?.body ?? '').trim();
    void mutate(async () => {
      await api(`/classes/${classId}/notes/${studentId}`, { body });
      setDrafts(old => { const next = { ...old }; delete next[key]; return next; });
      setDetail(old => old?.classId === classId ? { ...old, members: old.members.map(m => m.studentId === studentId ? { ...m, note: body ? { body } : null } : m) } : old);
      setMessage(body ? 'Đã lưu ghi chú.' : 'Đã xóa ghi chú.');
    });
  }
  function confirmRemoval() {
    if (!confirmation || !selected || !current) return;
    const classroom = selected; const action = confirmation;
    void mutate(async () => {
      const suffix = action.kind === 'remove' ? `members/${action.member!.studentId}/remove` : action.kind;
      await api(`/classes/${classroom.id}/${suffix}`, {});
      setDrafts(old => Object.fromEntries(Object.entries(old).filter(([key]) => action.kind === 'remove'
        ? key !== draftKey(classroom.id, action.member!.studentId!) : !key.startsWith(`${classroom.id}:`))));
      setConfirmation(null);
      if (action.kind === 'remove') await openClass(classroom); else backToList();
      await refresh();
      setMessage(action.kind === 'remove' ? 'Đã đưa học sinh khỏi lớp.' : action.kind === 'delete' ? 'Đã xóa lớp.' : 'Đã rời lớp.');
    });
  }
  const joinRequests = current?.requests.filter(item => item.kind === 'join_request') ?? [];
  const sentInvites = current?.requests.filter(item => item.kind === 'invite') ?? [];

  return <section className={`classes-page ${teacher ? 'teacher-page' : ''}`}>
    <div className="classes-heading"><div><span className="eyebrow">{teacher ? 'QUẢN LÝ LỚP HỌC' : 'KẾT NỐI CÙNG LỚP'}</span><h1>Lớp học</h1>
      <p>{teacher ? 'Tạo lớp, xét yêu cầu và theo dõi tiến độ học tập của học sinh.' : 'Nhập mã lớp để gửi yêu cầu tham gia, hoặc xem lời mời từ giáo viên.'}</p>
    </div><School size={36} /></div>
    {message && <p className="classes-message" role="status">{message}</p>}
    {dirty && <p className="pending-note">Có ghi chú chưa lưu. Bản nháp được giữ khi mở học sinh hoặc lớp khác.</p>}
    {!selected ? <>
      <div className="class-actions">{teacher ? <form onSubmit={create}><label>Tạo lớp mới<input name="name" required minLength={2} maxLength={80} disabled={busy} placeholder="Ví dụ: Lớp 5A" /></label><button className="button primary" disabled={busy}>Tạo lớp</button></form>
        : <form onSubmit={join}><label>Nhập mã lớp<input name="code" required disabled={busy} autoCapitalize="characters" placeholder="KG-XXXXXXXX" /></label><button className="button primary" disabled={busy}>Gửi yêu cầu</button></form>}</div>
      {!teacher && data.invitations.length > 0 && <div className="invitation-box"><strong><UserPlus size={18} /> Lời mời chờ phản hồi</strong>
        {data.invitations.map(item => <div key={item.id}><span><b>{item.className}</b> · {item.teacherName}</span>
          <button className="button primary" disabled={busy} onClick={() => respondToInvitation(item, 'accept')}>Đồng ý</button>
          <button className="button outline" disabled={busy} onClick={() => respondToInvitation(item, 'reject')}>Từ chối</button>
        </div>)}</div>}
      {!teacher && data.requests.length > 0 && <p className="pending-note"><ClipboardCheck size={18} /> Đang chờ xét duyệt: {data.requests.map(item => item.className).join(', ')}.</p>}
      {listLoading ? <p role="status">Đang tải lớp học…</p> : <div className="class-grid">{data.classes.map(classroom => <button key={classroom.id} className="class-card" disabled={busy} onClick={() => void openClass(classroom)}><Users size={22} /><div><h2>{classroom.name}</h2>
        <p>{teacher ? `${classroom.memberCount} học sinh · ${classroom.pendingCount ? `${classroom.pendingCount} yêu cầu mới` : 'Không có yêu cầu mới'}` : `Giáo viên: ${classroom.teacherName}`}</p>
        {teacher && <code>{classroom.joinCode}</code>}</div><ChevronRight /></button>)}</div>}
      {!listLoading && !data.classes.length && <div className="empty-state"><School size={40} /><p>{teacher ? 'Chưa có lớp học nào.' : 'Em chưa tham gia lớp học nào.'}</p></div>}
    </> : <div className="class-detail">
      <div className="class-detail-tools"><button className="text-button" disabled={busy} onClick={backToList}>← Danh sách lớp</button><button className="text-button" disabled={busy || loading} onClick={() => void openClass(selected)}>Làm mới</button></div>
      <div className="class-detail-head"><div><h2>{selected.name}</h2>{teacher && <p>Mã lớp: <code>{selected.joinCode}</code></p>}</div>
        <button className="button outline danger" disabled={busy || loading || !current} onClick={() => setConfirmation({ kind: teacher ? 'delete' : 'leave' })}><Trash2 size={16} />{teacher ? 'Xóa lớp' : 'Rời lớp'}</button></div>
      {loading ? <p role="status">Đang tải thông tin lớp…</p> : !current ? <p>Chưa tải được thông tin. Nhấn Làm mới để thử lại.</p> : <>
        {teacher && <>
          <form className="invite-form" onSubmit={invite}><label>Mời học sinh bằng ID<input name="studentId" required pattern="S[0-9]{9}" disabled={busy} placeholder="S123456789" /></label><button className="button outline" disabled={busy}>Gửi lời mời</button></form>
          {joinRequests.length > 0 && <div className="requests-list"><h3>Yêu cầu chờ duyệt</h3>{joinRequests.map(item => <div key={item.id}><span><b>{item.student.fullName}</b> · {item.student.publicId}</span><button disabled={busy} onClick={() => respondToRequest(item.id, 'accept')}>Chấp nhận</button><button disabled={busy} onClick={() => respondToRequest(item.id, 'reject')}>Từ chối</button></div>)}</div>}
          {sentInvites.length > 0 && <div className="sent-invitations"><h3>Lời mời đã gửi</h3>{sentInvites.map(item => <p key={item.id}><strong>{item.student.fullName}</strong> · {item.student.publicId}<span>Chờ học sinh phản hồi</span></p>)}</div>}
        </>}
        <div className="member-list"><h3>Thành viên ({current.members.length})</h3>{current.members.map((member, index) => {
          const key = draftKey(current.classId, member.studentId ?? String(index));
          return <article key={member.studentId ?? index} className={teacher ? 'teacher-member' : ''}>
            {teacher ? <><button className="member-toggle" aria-expanded={expandedStudentId === member.studentId} onClick={() => setExpandedStudentId(expandedStudentId === member.studentId ? null : member.studentId!)}>
              <span><strong>{member.fullName}</strong><small>{member.nickname} · {member.publicId}</small></span><ChevronDown size={20} className={expandedStudentId === member.studentId ? 'open' : ''} /></button>
              {expandedStudentId === member.studentId && <div className="member-detail">
                <div className="member-progress">{member.progress?.length ? member.progress.map(progress => <p key={progress.lessonId}><b>{progress.lessonTitle}:</b> {progress.evaluation.message}</p>) : <p>Chưa có bài học hoàn thành.</p>}</div>
                <form onSubmit={event => saveNote(member, event)}><textarea name="note" aria-label={`Ghi chú cho ${member.fullName}`} maxLength={2000} disabled={busy}
                  value={drafts[key]?.body ?? member.note?.body ?? ''} onChange={event => { const body = event.target.value; setDrafts(old => ({ ...old, [key]: { body, savedBody: old[key]?.savedBody ?? member.note?.body ?? '' } })); }} placeholder="Ghi chú riêng cho học sinh này" />
                  <button className="button outline" disabled={busy}>Lưu ghi chú</button></form>
                <button className="text-button danger member-remove" disabled={busy} onClick={() => setConfirmation({ kind: 'remove', member })}>Đưa khỏi lớp</button>
              </div>}</> : <h4>{member.fullName}</h4>}
          </article>;
        })}</div>
      </>}
    </div>}
    {confirmation && selected && <Modal title={confirmation.kind === 'delete' ? 'Xóa lớp học?' : confirmation.kind === 'leave' ? 'Rời lớp học?' : 'Đưa học sinh khỏi lớp?'} onClose={() => { if (!busy) setConfirmation(null); }}>
      <p>{confirmation.kind === 'delete' ? <>Xóa lớp <strong>{selected.name}</strong> sẽ xóa danh sách thành viên, lời mời và toàn bộ ghi chú của lớp. Không thể hoàn tác. Lịch sử làm bài của học sinh vẫn được giữ.</>
        : confirmation.kind === 'leave' ? <>Em muốn rời lớp <strong>{selected.name}</strong>? Để vào lại, em cần được chấp nhận tham gia lớp.</>
        : <>Đưa <strong>{confirmation.member?.fullName}</strong> khỏi lớp <strong>{selected.name}</strong>? Lịch sử làm bài cá nhân vẫn được giữ.</>}</p>
      {message && <p role="alert" className="error-message">{message}</p>}
      <div className="modal-actions"><button className="button outline" disabled={busy} onClick={() => setConfirmation(null)}>Hủy</button><button className="button primary" disabled={busy} onClick={confirmRemoval}>{busy ? 'Đang xử lý…' : 'Xác nhận'}</button></div>
    </Modal>}
  </section>;
}
