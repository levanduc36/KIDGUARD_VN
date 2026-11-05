import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronRight, Clock3, Copy, Eye, EyeOff, Heart, HelpCircle, Home, Leaf, LockKeyhole, LogOut, Menu, Play, Settings, ShieldCheck, Sparkles, Star, Trophy, Video, X, School } from 'lucide-react';
import { api, type Attempt, type Lesson, type Result, type User } from './api';

import { HistoryPanel, ResultScreen } from './Results';
import { Story, type ActiveStory } from './Story';
import { Modal } from './Modal';
import { Classes, type ClassData } from './Classes';

type Page = 'home' | 'library' | 'achievements' | 'classes' | 'settings';
type AuthMode = 'login' | 'register';
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Có lỗi xảy ra. Em thử lại nhé.';

function Brand({ compact = false }: { compact?: boolean }) {
  return <span className={`brand ${compact ? 'compact' : ''}`}><img src="/assets/logo.webp" alt="" width="48" height="44" /><span><strong>KIDGUARD<span> VN</span></strong><small>KHIÊN CHẮN NHÍ</small></span></span>;
}
function AuthForm({ initialMode, onSuccess }: { initialMode: AuthMode; onSuccess: (user: User) => void }) {
  const [mode, setMode] = useState(initialMode);
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password'));
    if (mode === 'register' && password !== data.get('confirm')) { setError('Hai mật khẩu chưa giống nhau. Em kiểm tra lại nhé.'); return; }
    setPending(true); setError('');
    try {
      const body = { username: data.get('username'), password, ...(mode === 'register' ? { fullName: data.get('fullName'), role, ...(role === 'student' ? { nickname: data.get('nickname') } : {}), ...(role === 'teacher' ? { teacherCode: data.get('teacherCode') } : {}) } : {}) };
      const response = await api<{ user: User }>(`/auth/${mode}`, body);
      onSuccess(response.user);
    } catch (err) { setError(errorMessage(err)); } finally { setPending(false); }
  }
  return <><form onSubmit={submit} className="auth-form" key={mode}>
      {mode === 'register' && <><div className="role-picker" aria-label="Chọn vai trò"><button type="button" className={role === 'student' ? 'selected' : ''} onClick={() => setRole('student')}>Học sinh</button><button type="button" className={role === 'teacher' ? 'selected' : ''} onClick={() => setRole('teacher')}>Giáo viên</button></div><label>Họ và tên<input name="fullName" autoComplete="name" minLength={2} maxLength={100} required placeholder={role === 'teacher' ? 'Nhập họ và tên' : 'Ví dụ: Nguyễn Minh An'} /></label>{role === 'student' && <label>Biệt danh<input name="nickname" autoComplete="nickname" minLength={2} maxLength={40} required placeholder="Ví dụ: Siêu nhân nhí" /><small>Biệt danh được dùng trong không gian học tập.</small></label>}{role === 'teacher' && <label>Mã xác minh giáo viên<input name="teacherCode" autoCapitalize="characters" required placeholder="Nhập mã xác minh" /><small>Mỗi mã chỉ dùng một lần.</small></label>}</>}
      <label>Tên đăng nhập<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} pattern="[a-zA-Z0-9_]{3,32}" minLength={3} maxLength={32} required placeholder={mode === 'register' && role === 'teacher' ? 'Nhập tên đăng nhập' : 'Ví dụ: nguoihung_nhi'} /><small>3–32 ký tự: chữ không dấu, số hoặc dấu gạch dưới.</small></label>
      <label>Mật khẩu<span className="password-field"><input name="password" type={visible ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={mode === 'register' ? 8 : 1} maxLength={128} required placeholder={mode === 'register' ? 'Ít nhất 8 ký tự' : 'Nhập mật khẩu của em'} /><button type="button" className="icon-button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
      {mode === 'register' && <label>Nhập lại mật khẩu<input name="confirm" type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={128} required placeholder={role === 'teacher' ? 'Nhập lại mật khẩu' : 'Nhập lại để kiểm tra nhé'} /></label>}
      {error && <p role="alert" className="error-message">{error}</p>}
      <button className="button primary full" disabled={pending}>{pending ? 'Đang xử lý…' : mode === 'register' ? 'Tạo tài khoản' : 'Đăng nhập'}<ArrowRight size={18} /></button>
      <p className="privacy-note"><LockKeyhole size={14} /> Không yêu cầu email, địa chỉ hay số điện thoại.</p>
    </form>
    <p className="auth-switch">{mode === 'register' ? 'Em đã có tài khoản?' : 'Em chưa có tài khoản?'} <button onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(''); }}>{mode === 'register' ? 'Đăng nhập' : 'Đăng ký ngay'}</button></p>
  </>;
}

function Landing({ openAuth, help }: { openAuth: (mode: AuthMode) => void; help: () => void }) {
  return <div className="landing"><header className="landing-header"><a href="#" aria-label="KIDGUARD VN – Trang chủ"><Brand /></a><div className="landing-nav"><span>Cùng em lớn lên an toàn</span><button className="button outline" onClick={() => openAuth('login')}>Đăng nhập<ArrowRight size={17} /></button></div></header>
    <main id="main-content"><section className="landing-hero"><div className="hero-copy"><span className="eyebrow"><span className="live-dot" /> NHỮNG NGƯỜI HÙNG NHỎ, NHỮNG LỰA CHỌN LỚN</span><h1>Mỗi lựa chọn,<br />một bước <span>trưởng thành.<svg viewBox="0 0 420 18" aria-hidden="true"><path d="M5 12 Q200 -5 410 10" /></svg></span></h1><p>Mỗi lựa chọn là một hành trình. Em đã sẵn sàng trở thành người hùng trong chính câu chuyện của mình chưa?</p><div className="hero-actions"><button className="button primary" onClick={() => openAuth('register')}>Bắt đầu hành trình<ArrowRight size={20} /></button><button className="text-button" onClick={() => openAuth('login')}>Mình đã có tài khoản<ChevronRight size={17} /></button></div><div className="hero-assurance"><ShieldCheck size={18} /><span>Một không gian học tập thân thiện dành cho em</span></div></div>
    <div className="hero-art"><div className="hero-orbit" /><span className="art-star star-one">✦</span><span className="art-star star-two">✧</span><span className="art-dot" /><img src="/assets/heroes.webp" alt="Hai người hùng nhí với áo choàng và chiếc khiên ngôi sao" width="1000" height="979" fetchPriority="high" /><div className="floating-badge badge-top"><ShieldCheck size={23} /><span>Tự tin hơn<strong>mỗi ngày một chút</strong></span></div><div className="floating-badge badge-bottom"><span className="yellow-icon"><Star fill="currentColor" size={19} /></span><span>Người hùng<strong>chính là em!</strong></span></div></div></section>
    <section className="journey-strip" aria-label="Cách học"><div><span className="step-icon mint"><Play size={23} /></span><span><strong>Khám phá tình huống</strong><small>Những câu chuyện gần gũi với em</small></span></div><span className="strip-arrow">···<ChevronRight size={18} /></span><div><span className="step-icon peach"><Sparkles size={23} /></span><span><strong>Tự chọn cách xử lý</strong><small>Mỗi lựa chọn mở ra một diễn biến</small></span></div><span className="strip-arrow">···<ChevronRight size={18} /></span><div><span className="step-icon lavender"><Trophy size={23} /></span><span><strong>Nhìn lại và trưởng thành</strong><small>Lưu hành trình, ghi nhận tiến bộ</small></span></div></section>
    <div className="landing-bottom"><span><Leaf size={17} /> Học từng chút. Vững vàng từng ngày.</span><span className="muted">Khám phá tình huống · Luyện kỹ năng an toàn</span></div></main>
    <footer className="landing-footer"><span>© {new Date().getFullYear()} KIDGUARD VN · Khiên chắn nhí</span><button onClick={help}>Tìm hiểu về KIDGUARD<ArrowRight size={14} /></button></footer>
  </div>;
}

function LessonCard({ lesson, onOpen }: { lesson: Lesson; onOpen: () => void }) {
  return <button className={`lesson-card ${lesson.theme}`} onClick={onOpen}><div className="lesson-cover"><img src={lesson.cover} alt="" loading="lazy" width="580" height="230" /><span className="cover-label">{lesson.status === 'coming-soon' ? <Clock3 size={12} /> : <Play size={12} />} {lesson.status === 'coming-soon' ? 'Sắp ra mắt' : lesson.duration || 'Sẵn sàng'}</span><span className="cover-play"><Play size={18} fill="currentColor" /></span></div><div className="lesson-card-body"><span className="topic"><span />{lesson.topic}</span><h3>{lesson.title}</h3><p>{lesson.description}</p><div className="card-footer"><span><Video size={14} /> Tình huống tương tác</span><span className="card-arrow"><ArrowRight size={17} /></span></div></div></button>;
}

function Library({ lessons, nickname, onOpen, teacher = false }: { lessons: Lesson[]; nickname: string; onOpen: (lesson: Lesson) => void; teacher?: boolean }) {
  if (teacher) return <section className="teacher-library"><div className="teacher-page-heading"><span className="eyebrow">TÀI LIỆU THỰC HÀNH</span><h1>Thư viện tình huống</h1><p>Chọn bài học để xem nội dung và trải nghiệm luồng thực hành như học sinh.</p></div><div className="teacher-section-heading"><h2>Bài học có sẵn</h2><p>{lessons.length} bài học tương tác đang được sử dụng.</p></div><div className="lesson-grid official-lessons teacher-lesson-grid">{lessons.map(lesson => <LessonCard key={lesson.id} lesson={lesson} onOpen={() => onOpen(lesson)} />)}</div></section>;
  return <><section className="library-intro"><div><span className="eyebrow">MỘT CHÚT TÒ MÒ, THÊM NHIỀU KỸ NĂNG</span><h1>Thư viện tình huống<span className="heading-spark">✦</span></h1><p>Xin chào <strong>{nickname}</strong>, hôm nay em muốn khám phá điều gì?</p></div><span className="intro-icon"><BookOpen size={32} /><span>✦</span></span></section>
    <div className="section-heading"><div><h2>Chọn câu chuyện của em <span className="count-badge">{lessons.length}</span></h2><p>Xem tình huống, chọn cách xử lý và khám phá điều xảy ra tiếp theo.</p></div></div>
    <div className="lesson-grid official-lessons">{lessons.map(lesson => <LessonCard key={lesson.id} lesson={lesson} onOpen={() => onOpen(lesson)} />)}</div>
  </>;
}

function Achievements({ attempts, onOpen, onLibrary, teacher = false }: { attempts: Attempt[]; onOpen: (id: string) => void; onLibrary: () => void; teacher?: boolean }) {
  const groups = [...new Set(attempts.map(attempt => attempt.lessonId))].map(id => attempts.filter(attempt => attempt.lessonId === id));
  if (teacher) return <section className="teacher-results"><div className="teacher-page-heading"><span className="eyebrow">LỊCH SỬ THỰC HÀNH</span><h1>Kết quả của tôi</h1><p>Xem lại các bài học đã thực hành và lựa chọn đã lưu.</p></div><div className="teacher-result-summary"><span><strong>{groups.length}</strong> bài học hoàn thành</span><span><strong>{attempts.length}</strong> lượt thực hành đã lưu</span><span><strong>{attempts.filter(a => a.evaluation.level === 'confident').length}</strong> lượt xử lý tốt</span></div><div className="teacher-section-heading"><h2>Lịch sử thực hành</h2><p>Chọn một bài học để xem lại kết quả.</p></div>{groups.length ? <div className="history-grid teacher-history-grid">{groups.map(group => <button className="history-card" key={group[0].lessonId} onClick={() => onOpen(group[0].lessonId)}><div><h3>{group[0].lessonTitle}</h3><p>{group.length} lượt thực hành đã lưu</p><p className={`evaluation ${group[0].evaluation.level}`}>{group[0].evaluation.message}</p></div><ChevronRight /></button>)}</div> : <div className="teacher-empty"><h2>Chưa có kết quả thực hành</h2><p>Kết quả sẽ xuất hiện tại đây sau khi hoàn thành một bài học.</p><button className="button primary" onClick={onLibrary}>Mở thư viện<ArrowRight size={18} /></button></div>}</section>;
  return <><section className="library-intro"><div><span className="eyebrow">MỖI BƯỚC NHỎ ĐỀU ĐÁNG TỰ HÀO</span><h1>Thành tựu của em <span className="heading-spark">✦</span></h1><p>Nhìn lại những điều em đã học và thử lại để tiến bộ hơn.</p></div><span className="intro-icon yellow"><Trophy size={32} /></span></section>
    <div className="stats-grid"><div><span className="step-icon mint"><BookOpen /></span><span><strong>{groups.length}</strong><small>Bài học đã hoàn thành</small></span></div><div><span className="step-icon peach"><CheckCircle2 /></span><span><strong>{attempts.length}</strong><small>Hành trình đã lưu</small></span></div><div><span className="step-icon lavender"><Star /></span><span><strong>{attempts.filter(a => a.evaluation.level === 'confident').length}</strong><small>Hành trình xử lý tốt</small></span></div></div>
    <div className="section-heading"><div><h2>Hành trình đã đi qua</h2><p>Chọn một bài để xem nhận xét và nhìn lại những lựa chọn của em.</p></div></div>
    {groups.length ? <div className="history-grid">{groups.map(group => <button className="history-card" key={group[0].lessonId} onClick={() => onOpen(group[0].lessonId)}><span className="step-icon mint"><Trophy /></span><div><span className="topic">ĐÃ HOÀN THÀNH</span><h3>{group[0].lessonTitle}</h3><p>{group.length} hành trình đã lưu</p><p className={`evaluation ${group[0].evaluation.level}`}>{group[0].evaluation.message}</p></div><ChevronRight /></button>)}</div> : <div className="empty-state achievement-empty"><span className="empty-art"><Trophy size={48} /><Star size={20} /></span><h2>Hành trình của em đang chờ bắt đầu</h2><p>Khi em hoàn thành một bài học, kết quả sẽ được lưu tại đây.</p><button className="button primary" onClick={onLibrary}>Khám phá thư viện<ArrowRight size={18} /></button></div>}
  </>;
}

function SettingsPage({ user, onBack }: { user: User; onBack: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copyId() {
    try { await navigator.clipboard.writeText(user.publicId); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); }
  }
  return <section className={`settings-page ${user.role === 'teacher' ? 'teacher-page' : ''}`}><button className="text-button settings-back" onClick={onBack}><ArrowLeft size={17} /> Quay lại trang chủ</button><div className="settings-heading"><span className="eyebrow">TÀI KHOẢN</span><h1>Cài đặt</h1><p>Xem thông tin tài khoản và ID dùng để tham gia lớp học.</p></div><div className="settings-card"><div className="settings-id"><div><span>ID tài khoản</span><code>{user.publicId}</code><small>{user.role === 'teacher' ? 'ID giáo viên' : 'Dùng ID này để giáo viên mời em vào lớp.'}</small></div><button className="button outline" onClick={() => void copyId()}><Copy size={16} />{copied ? 'Đã sao chép' : 'Sao chép ID'}</button></div><dl className="settings-info"><div><dt>Họ và tên</dt><dd>{user.fullName}</dd></div><div><dt>Vai trò</dt><dd>{user.role === 'teacher' ? 'Giáo viên' : 'Học sinh'}</dd></div><div><dt>Tên đăng nhập</dt><dd>{user.username}</dd></div>{user.role === 'student' && <div><dt>Biệt danh</dt><dd>{user.nickname}</dd></div>}</dl></div></section>;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialError, setInitialError] = useState('');
  const [auth, setAuth] = useState<AuthMode | null>(null);
  const [page, setPage] = useState<Page>('home');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [classPending, setClassPending] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');
  const [detail, setDetail] = useState<Lesson | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [story, setStory] = useState<ActiveStory | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [exitConfirm, setExitConfirm] = useState(false);
  const [nextPage, setNextPage] = useState<Page>('home');
  const [classDrafts, setClassDrafts] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [accountMenu, setAccountMenu] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  async function loadSession() {
    setLoading(true); setInitialError('');
    try { setUser((await api<{ user: User | null }>('/session')).user); }
    catch (err) { setInitialError(errorMessage(err)); } finally { setLoading(false); }
  }
  async function loadData() {
    setDataLoading(true); setDataError('');
    try {
      const [catalog, history] = await Promise.all([api<{ lessons: Lesson[] }>('/lessons'), api<{ attempts: Attempt[] }>('/history')]);
      setLessons(catalog.lessons); setAttempts(history.attempts);
    } catch (err) { setDataError(errorMessage(err)); } finally { setDataLoading(false); }
  }
  useEffect(() => { void loadSession(); }, []);
  useEffect(() => { if (user) void loadData(); }, [user?.id]);
  useEffect(() => {
    setClassPending(false);
    if (!user) return;
    let active = true, version = 0;
    const refreshNotifications = async () => {
      if (document.visibilityState !== 'visible') return;
      const requestVersion = ++version;
      try {
        const value = await api<ClassData>('/classes');
        if (active && requestVersion === version) setClassPending(user.role === 'teacher'
          ? value.classes.some(c => (c.pendingCount ?? 0) > 0) : value.invitations.length > 0);
      } catch { /* Keep the last badge; page actions display actionable errors. */ }
    };
    void refreshNotifications();
    const timer = window.setInterval(refreshNotifications, 30_000);
    window.addEventListener('focus', refreshNotifications);
    window.addEventListener('classes-changed', refreshNotifications);
    document.addEventListener('visibilitychange', refreshNotifications);
    return () => {
      active = false; window.clearInterval(timer);
      window.removeEventListener('focus', refreshNotifications);
      window.removeEventListener('classes-changed', refreshNotifications);
      document.removeEventListener('visibilitychange', refreshNotifications);
    };
  }, [user?.id, user?.role]);
  useEffect(() => {
    const expired = () => { setUser(null); setStory(null); setResult(null); setDetail(null); setHistoryId(null); setLogoutConfirm(false); setExitConfirm(false); setDiscardConfirm(false); setAccountMenu(false); setClassDrafts(false); setAttempts([]); setLessons([]); setAuth('login'); setError('Phiên đăng nhập đã hết hạn. Em đăng nhập lại để tiếp tục nhé.'); };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, []);
  useEffect(() => {
    if (!story) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [story]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [page, story?.node.id, result]);
  function commitNavigation(next: Page) {
    setStory(null); setPage(next); setResult(null); setMobileMenu(false); setAccountMenu(false);
    mainRef.current?.focus();
  }
  function navigate(next: Page) {
    setAccountMenu(false); setMobileMenu(false);
    if (story) { setNextPage(next); setExitConfirm(true); return; }
    if (classDrafts && next !== page) { setNextPage(next); setDiscardConfirm(true); return; }
    commitNavigation(next);
  }
  async function startLesson(lessonId: string) {
    setStarting(true); setError(''); setResult(null);
    try { const response = await api<ActiveStory>('/attempts', { lessonId }); setStory(response); setDetail(null); }
    catch (err) { setError(errorMessage(err)); } finally { setStarting(false); }
  }
  async function logout() {
    setLoggingOut(true);
    try { await api('/auth/logout', {}); setUser(null); setStory(null); setResult(null); setAttempts([]); setLessons([]); setLogoutConfirm(false); setAccountMenu(false); setClassDrafts(false); setPage('home'); }
    catch (err) { setError(errorMessage(err)); } finally { setLoggingOut(false); }
  }
  const navItems: { id: Page; label: string; icon: typeof Home }[] = [{ id: 'home', label: 'Trang chủ', icon: Home }, { id: 'library', label: 'Thư viện tình huống', icon: BookOpen }, { id: 'classes', label: 'Lớp học', icon: School }, { id: 'achievements', label: user?.role === 'teacher' ? 'Kết quả của tôi' : 'Thành tựu của em', icon: Trophy }];
  const history = attempts.filter(a => a.lessonId === historyId).sort((a, b) => b.completedAt - a.completedAt);
  if (loading) return <div className="loading-screen"><Brand /><span className="spinner" /><p>Đang chuẩn bị hành trình của em…</p></div>;
  if (initialError) return <div className="loading-screen"><Brand /><p role="alert">{initialError}</p><button className="button primary" onClick={loadSession}>Kết nối lại</button></div>;
  return <><a className="skip-link" href="#main-content">Chuyển đến nội dung chính</a>{!user ? <Landing openAuth={setAuth} help={() => setHelp(true)} /> : <div className="app-shell">
    {mobileMenu && <button className="sidebar-scrim" aria-label="Đóng điều hướng" onClick={() => setMobileMenu(false)} />}
    <aside className={`sidebar ${mobileMenu ? 'open' : ''} ${user.role === 'teacher' ? 'teacher-sidebar' : ''}`}><button className="brand-button" onClick={() => navigate('home')}><Brand compact /></button><span className="nav-caption">{user.role === 'teacher' ? 'KHÔNG GIAN GIÁO VIÊN' : 'GÓC NHỎ CỦA EM'}</span><nav aria-label="Điều hướng chính">{navItems.map(item => <button key={item.id} className={!story && page === item.id ? 'active' : ''} aria-current={!story && page === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon size={20} /><span>{item.label}</span>{item.id === 'classes' && classPending && <span className="nav-notification" aria-label="Có thông báo mới">!</span>}{!story && page === item.id && <span className="nav-active-dot" />}</button>)}</nav><div className="sidebar-grow" /><button className="help-button" onClick={() => setHelp(true)}><HelpCircle size={20} /><span>Hỗ trợ</span><ChevronRight size={15} /></button></aside>
    <div className="app-body"><header className="app-header"><div className="header-breadcrumb"><button className="icon-button mobile-menu-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Mở điều hướng" aria-expanded={mobileMenu}><Menu size={23} /></button><span className="desktop-only">Không gian học tập</span><ChevronRight size={14} /><strong>{story ? story.lesson.title : page === 'settings' ? 'Cài đặt' : navItems.find(item => item.id === page)?.label}</strong></div><div className="user-menu"><span className="user-avatar">{(user.role === 'teacher' ? user.fullName : user.nickname).slice(0, 1).toUpperCase()}</span><span><strong>{user.role === 'teacher' ? user.fullName : user.nickname}</strong>{user.role === 'student' && <small>Người hùng nhí</small>}</span><div className="account-menu-wrap"><button className="icon-button" aria-label="Mở menu tài khoản" title="Menu tài khoản" onClick={() => setAccountMenu(!accountMenu)} aria-expanded={accountMenu}><Menu size={20} /></button>{accountMenu && <div className="account-menu" role="menu"><button role="menuitem" onClick={() => navigate('settings')}><Settings size={17} />Cài đặt</button><button role="menuitem" onClick={() => { setAccountMenu(false); setLogoutConfirm(true); }}><LogOut size={17} />Đăng xuất</button></div>}</div></div></header>
    <main id="main-content" ref={mainRef} tabIndex={-1} className={`main-content ${user.role === 'teacher' ? 'teacher-content' : ''}`}>{story ? <Story key={`${story.id}:${story.node.id}`} story={story} onUpdate={setStory} onComplete={value => { setResult(value); setStory(null); void loadData(); }} /> : result ? <ResultScreen result={result} onAchievements={() => navigate('achievements')} onLibrary={() => navigate('library')} onRetry={() => startLesson(result.lessonId)} starting={starting} /> : dataLoading && !lessons.length ? <div className="empty-state"><span className="spinner" /><p>Đang mở thư viện…</p></div> : dataError ? <div className="empty-state"><p role="alert">{dataError}</p><button className="button primary" onClick={loadData}>Thử lại</button></div> : page === 'settings' ? <SettingsPage user={user} onBack={() => navigate('home')} /> : page === 'classes' ? <Classes user={user} onDirtyChange={setClassDrafts} /> : page === 'achievements' ? <Achievements attempts={attempts} onOpen={setHistoryId} onLibrary={() => navigate('library')} teacher={user.role === 'teacher'} /> : page === 'home' ? user.role === 'teacher' ? <section className="teacher-home"><span className="eyebrow">BẢNG ĐIỀU KHIỂN GIÁO VIÊN</span><h1>Xin chào, {user.fullName}</h1><p>Quản lý lớp học, xem tiến độ cao nhất và ghi chú riêng cho từng học sinh.</p><button className="button primary" onClick={() => navigate('classes')}>Mở lớp học<ArrowRight size={18} /></button></section> : <><section className="welcome-heading"><span className="eyebrow">CHÀO MỪNG NGƯỜI HÙNG NHÍ</span><h1>Rất vui được gặp em,<br /><span>{user.nickname}!</span></h1><p>Mỗi lựa chọn là một hành trình. Cùng khám phá một điều mới hôm nay nhé.</p></section><div className="home-welcome"><img src="/assets/heroes.webp" alt="Hai người hùng nhí" width="1000" height="979" /><div><span className="pill">CHIẾC KHIÊN CỦA EM</span><h2>Sẵn sàng cho<br />những lựa chọn mới?</h2><p>Những câu chuyện gần gũi giúp em luyện kỹ năng bảo vệ bản thân.</p><button className="button primary" onClick={() => navigate('library')}>Đến thư viện<ArrowRight size={18} /></button></div></div><button className="home-history" onClick={() => navigate('achievements')}><span className="step-icon lavender"><Trophy /></span><span><strong>Nhìn lại hành trình của em</strong><small>Xem nhận xét và lựa chọn trong từng hành trình.</small></span><ArrowRight /></button></> : <Library lessons={lessons} nickname={user.nickname} onOpen={setDetail} teacher={user.role === 'teacher'} />}</main><footer className="app-footer"><span>KIDGUARD VN · Khiên chắn nhí</span></footer></div></div>}
    {error && <div className="toast" role="alert"><span>{error}</span><button className="icon-button" onClick={() => setError('')} aria-label="Đóng thông báo"><X size={18} /></button></div>}
    {auth && !user && <Modal title={auth === 'register' ? 'Tạo tài khoản' : 'Đăng nhập'} onClose={() => setAuth(null)}><AuthForm initialMode={auth} onSuccess={value => { setUser(value); setPage('home'); setAuth(null); setError(''); }} /></Modal>}
    {detail && <Modal title={detail.title} onClose={() => setDetail(null)}><img className="detail-cover" src={detail.cover} alt="" /><span className="pill"><Clock3 size={14} /> {detail.duration}</span><p className="detail-description">{detail.description}</p><button className="button primary full" onClick={() => startLesson(detail.id)} disabled={starting}>{starting ? 'Đang mở…' : 'Bắt đầu bài học'}<Play size={16} /></button></Modal>}
    {historyId && <Modal title={history[0]?.lessonTitle ?? 'Lịch sử làm bài'} onClose={() => setHistoryId(null)} wide><HistoryPanel key={historyId} attempts={history} /></Modal>}
    {help && <Modal title="Cùng em lớn lên an toàn" onClose={() => setHelp(false)}><div className="help-intro"><ShieldCheck size={36} /><p>KIDGUARD VN giúp em luyện cách xử lý tình huống qua những câu chuyện tương tác.</p></div><h3>Bắt đầu như thế nào?</h3><ol className="help-list"><li>Tạo tài khoản bằng biệt danh và tên đăng nhập.</li><li>Vào thư viện, chọn một bài học để bắt đầu.</li><li>Chọn cách xử lý, đọc phản hồi và theo dõi câu chuyện.</li><li>Hoàn thành câu chuyện, xem nhận xét và lựa chọn đã lưu tại Thành tựu của em.</li></ol><div className="help-note"><Heart size={22} /><p>Nếu một chuyện ngoài đời khiến em lo lắng hoặc không an toàn, hãy nói với người lớn em tin tưởng. Em không phải tự xử lý một mình.</p></div><p className="muted small">Phiên bản hiện tại chưa có khôi phục mật khẩu. Em hãy nhờ người lớn tin cậy giúp lưu thông tin đăng nhập ở nơi an toàn.</p></Modal>}
    {exitConfirm && <Modal title="Tạm dừng câu chuyện?" onClose={() => setExitConfirm(false)}><p>Lượt chưa hoàn thành sẽ không xuất hiện trong lịch sử. Khi quay lại, em sẽ bắt đầu một lượt mới.</p><div className="modal-actions"><button className="button outline" onClick={() => setExitConfirm(false)}>Học tiếp</button><button className="button primary" onClick={() => { setExitConfirm(false); commitNavigation(nextPage); }}>Rời bài học</button></div></Modal>}
    {discardConfirm && <Modal title="Rời trang khi chưa lưu ghi chú?" onClose={() => setDiscardConfirm(false)}><p>Ghi chú đang soạn sẽ bị bỏ nếu rời trang. Bạn có thể ở lại để lưu trước.</p><div className="modal-actions"><button className="button outline" onClick={() => setDiscardConfirm(false)}>Ở lại</button><button className="button primary" onClick={() => { setDiscardConfirm(false); setClassDrafts(false); commitNavigation(nextPage); }}>Bỏ bản nháp và rời trang</button></div></Modal>}
    {logoutConfirm && <Modal title="Đăng xuất tài khoản?" onClose={() => setLogoutConfirm(false)}>{story && <p>Lượt đang làm dở sẽ cần bắt đầu lại.</p>}{classDrafts && <p>Ghi chú chưa lưu sẽ bị bỏ khi đăng xuất.</p>}<div className="modal-actions"><button className="button outline" onClick={() => setLogoutConfirm(false)}>Ở lại</button><button className="button primary" disabled={loggingOut} onClick={logout}>{loggingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}</button></div></Modal>}
  </>;
}
