import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, ChevronRight, Clock3, Eye, EyeOff, Heart, HelpCircle, Home, Leaf, LockKeyhole, LogOut, Menu, Play, ShieldCheck, Sparkles, Star, Trophy, Video, X } from 'lucide-react';
import { api, type Attempt, type Lesson, type Result, type User } from './api';

import { HistoryPanel, ResultScreen } from './Results';
import { Story, type ActiveStory } from './Story';

type Page = 'home' | 'library' | 'achievements';
type AuthMode = 'login' | 'register';
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Có lỗi xảy ra. Em thử lại nhé.';

function Brand({ compact = false }: { compact?: boolean }) {
  return <span className={`brand ${compact ? 'compact' : ''}`}><img src="/assets/logo.webp" alt="" width="48" height="44" /><span><strong>KIDGUARD<span> VN</span></strong><small>KHIÊN CHẮN NHÍ</small></span></span>;
}
function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} aria-labelledby="modal-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-body"><div className="modal-header"><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Đóng"><X size={22} /></button></div>{children}</div></dialog>;
}
function AuthForm({ initialMode, onSuccess }: { initialMode: AuthMode; onSuccess: (user: User) => void }) {
  const [mode, setMode] = useState(initialMode);
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
      const body = { username: data.get('username'), password, ...(mode === 'register' ? { nickname: data.get('nickname') } : {}) };
      const response = await api<{ user: User }>(`/auth/${mode}`, body);
      onSuccess(response.user);
    } catch (err) { setError(errorMessage(err)); } finally { setPending(false); }
  }
  return <><div className="auth-welcome"><span className="round-icon"><ShieldCheck /></span><h3>{mode === 'register' ? 'Hành trình bắt đầu từ em!' : 'Chào mừng em trở lại!'}</h3><p>{mode === 'register' ? 'Tạo chiếc khiên của riêng em và lưu từng bước tiến.' : 'Chiếc khiên của em đang chờ. Cùng học tiếp nhé!'}</p></div>
    <form onSubmit={submit} className="auth-form" key={mode}>
      {mode === 'register' && <label>Biệt danh của em<input name="nickname" autoComplete="nickname" minLength={2} maxLength={40} required placeholder="Ví dụ: Siêu nhân nhí" /><small>Em có thể dùng biệt danh, không cần tên thật.</small></label>}
      <label>Tên đăng nhập<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} pattern="[a-zA-Z0-9_]{3,32}" minLength={3} maxLength={32} required placeholder="Ví dụ: nguoihung_nhi" /><small>3–32 ký tự: chữ không dấu, số hoặc dấu gạch dưới.</small></label>
      <label>Mật khẩu<span className="password-field"><input name="password" type={visible ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={mode === 'register' ? 8 : 1} maxLength={128} required placeholder={mode === 'register' ? 'Ít nhất 8 ký tự' : 'Nhập mật khẩu của em'} /><button type="button" className="icon-button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
      {mode === 'register' && <label>Nhập lại mật khẩu<input name="confirm" type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={128} required placeholder="Nhập lại để kiểm tra nhé" /></label>}
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

function Library({ lessons, nickname, onOpen }: { lessons: Lesson[]; nickname: string; onOpen: (lesson: Lesson) => void }) {
  return <><section className="library-intro"><div><span className="eyebrow">MỘT CHÚT TÒ MÒ, THÊM NHIỀU KỸ NĂNG</span><h1>Thư viện tình huống<span className="heading-spark">✦</span></h1><p>Xin chào <strong>{nickname}</strong>, hôm nay em muốn khám phá điều gì?</p></div><span className="intro-icon"><BookOpen size={32} /><span>✦</span></span></section>
    <div className="section-heading"><div><h2>Chọn câu chuyện của em <span className="count-badge">{lessons.length}</span></h2><p>Xem tình huống, chọn cách xử lý và khám phá điều xảy ra tiếp theo.</p></div></div>
    <div className="lesson-grid official-lessons">{lessons.map(lesson => <LessonCard key={lesson.id} lesson={lesson} onOpen={() => onOpen(lesson)} />)}</div>
  </>;
}

function Achievements({ attempts, onOpen, onLibrary }: { attempts: Attempt[]; onOpen: (id: string) => void; onLibrary: () => void }) {
  const groups = [...new Set(attempts.map(attempt => attempt.lessonId))].map(id => attempts.filter(attempt => attempt.lessonId === id));
  return <><section className="library-intro"><div><span className="eyebrow">MỖI BƯỚC NHỎ ĐỀU ĐÁNG TỰ HÀO</span><h1>Thành tựu của em <span className="heading-spark">✦</span></h1><p>Nhìn lại những điều em đã học và thử lại để tiến bộ hơn.</p></div><span className="intro-icon yellow"><Trophy size={32} /></span></section>
    <div className="stats-grid"><div><span className="step-icon mint"><BookOpen /></span><span><strong>{groups.length}</strong><small>Bài học đã hoàn thành</small></span></div><div><span className="step-icon peach"><CheckCircle2 /></span><span><strong>{attempts.length}</strong><small>Hành trình đã lưu</small></span></div><div><span className="step-icon lavender"><Star /></span><span><strong>{attempts.filter(a => a.evaluation.level === 'confident').length}</strong><small>Hành trình xử lý tốt</small></span></div></div>
    <div className="section-heading"><div><h2>Hành trình đã đi qua</h2><p>Chọn một bài để xem nhận xét và nhìn lại những lựa chọn của em.</p></div></div>
    {groups.length ? <div className="history-grid">{groups.map(group => <button className="history-card" key={group[0].lessonId} onClick={() => onOpen(group[0].lessonId)}><span className="step-icon mint"><Trophy /></span><div><span className="topic">ĐÃ HOÀN THÀNH</span><h3>{group[0].lessonTitle}</h3><p>{group.length} hành trình đã lưu</p><p className={`evaluation ${group[0].evaluation.level}`}>{group[0].evaluation.message}</p></div><ChevronRight /></button>)}</div> : <div className="empty-state achievement-empty"><span className="empty-art"><Trophy size={48} /><Star size={20} /></span><h2>Hành trình của em đang chờ bắt đầu</h2><p>Khi em hoàn thành một bài học, kết quả sẽ được lưu tại đây.</p><button className="button primary" onClick={onLibrary}>Khám phá thư viện<ArrowRight size={18} /></button></div>}
  </>;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialError, setInitialError] = useState('');
  const [auth, setAuth] = useState<AuthMode | null>(null);
  const [page, setPage] = useState<Page>('home');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
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
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
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
    const expired = () => { setUser(null); setStory(null); setResult(null); setDetail(null); setHistoryId(null); setLogoutConfirm(false); setExitConfirm(false); setAttempts([]); setLessons([]); setAuth('login'); setError('Phiên đăng nhập đã hết hạn. Em đăng nhập lại để tiếp tục nhé.'); };
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
  function navigate(next: Page) { setPage(next); setResult(null); setMobileMenu(false); mainRef.current?.focus(); }
  async function startLesson(lessonId: string) {
    setStarting(true); setError(''); setResult(null);
    try { const response = await api<ActiveStory>('/attempts', { lessonId }); setStory(response); setDetail(null); }
    catch (err) { setError(errorMessage(err)); } finally { setStarting(false); }
  }
  async function logout() {
    setLoggingOut(true);
    try { await api('/auth/logout', {}); setUser(null); setStory(null); setResult(null); setAttempts([]); setLessons([]); setLogoutConfirm(false); setPage('library'); }
    catch (err) { setError(errorMessage(err)); } finally { setLoggingOut(false); }
  }
  const navItems: { id: Page; label: string; icon: typeof Home }[] = [{ id: 'home', label: 'Trang chủ', icon: Home }, { id: 'library', label: 'Thư viện tình huống', icon: BookOpen }, { id: 'achievements', label: 'Thành tựu của em', icon: Trophy }];
  const history = attempts.filter(a => a.lessonId === historyId).sort((a, b) => b.completedAt - a.completedAt);
  if (loading) return <div className="loading-screen"><Brand /><span className="spinner" /><p>Đang chuẩn bị hành trình của em…</p></div>;
  if (initialError) return <div className="loading-screen"><Brand /><p role="alert">{initialError}</p><button className="button primary" onClick={loadSession}>Kết nối lại</button></div>;
  return <><a className="skip-link" href="#main-content">Chuyển đến nội dung chính</a>{!user ? <Landing openAuth={setAuth} help={() => setHelp(true)} /> : <div className="app-shell">
    {mobileMenu && <button className="sidebar-scrim" aria-label="Đóng điều hướng" onClick={() => setMobileMenu(false)} />}
    <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}><button className="brand-button" onClick={() => navigate('home')}><Brand compact /></button><span className="nav-caption">GÓC NHỎ CỦA EM</span><nav aria-label="Điều hướng chính">{navItems.map(item => <button key={item.id} className={!story && page === item.id ? 'active' : ''} aria-current={!story && page === item.id ? 'page' : undefined} onClick={() => story ? setExitConfirm(true) : navigate(item.id)}><item.icon size={20} /><span>{item.label}</span>{!story && page === item.id && <span className="nav-active-dot" />}</button>)}</nav><div className="sidebar-grow" /><button className="help-button" onClick={() => setHelp(true)}><HelpCircle size={20} /><span>Em cần giúp đỡ?</span><ChevronRight size={15} /></button><div className="sidebar-footer"><span className="live-dot" /> Cùng em lớn lên an toàn</div></aside>
    <div className="app-body"><header className="app-header"><div className="header-breadcrumb"><button className="icon-button mobile-menu-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Mở điều hướng" aria-expanded={mobileMenu}><Menu size={23} /></button><span className="desktop-only">Không gian học tập</span><ChevronRight size={14} /><strong>{story ? story.lesson.title : navItems.find(item => item.id === page)?.label}</strong></div><div className="user-menu"><span className="user-avatar">{user.nickname.slice(0, 1).toUpperCase()}</span><span><strong>{user.nickname}</strong><small>Người hùng nhí</small></span><button className="icon-button" aria-label="Đăng xuất" title="Đăng xuất" onClick={() => setLogoutConfirm(true)}><LogOut size={18} /></button></div></header>
    <main id="main-content" ref={mainRef} tabIndex={-1} className="main-content">{story ? <Story key={`${story.id}:${story.node.id}`} story={story} onUpdate={setStory} onComplete={value => { setResult(value); setStory(null); void loadData(); }} /> : result ? <ResultScreen result={result} onAchievements={() => navigate('achievements')} onLibrary={() => navigate('library')} onRetry={() => startLesson(result.lessonId)} starting={starting} /> : dataLoading && !lessons.length ? <div className="empty-state"><span className="spinner" /><p>Đang mở thư viện của em…</p></div> : dataError ? <div className="empty-state"><p role="alert">{dataError}</p><button className="button primary" onClick={loadData}>Thử lại</button></div> : page === 'achievements' ? <Achievements attempts={attempts} onOpen={setHistoryId} onLibrary={() => navigate('library')} /> : page === 'home' ? <><section className="welcome-heading"><span className="eyebrow">CHÀO MỪNG NGƯỜI HÙNG NHÍ</span><h1>Rất vui được gặp em,<br /><span>{user.nickname}!</span></h1><p>Mỗi lựa chọn là một hành trình. Cùng khám phá một điều mới hôm nay nhé.</p></section><div className="home-welcome"><img src="/assets/heroes.webp" alt="Hai người hùng nhí" width="1000" height="979" /><div><span className="pill">CHIẾC KHIÊN CỦA EM</span><h2>Sẵn sàng cho<br />những lựa chọn mới?</h2><p>Những câu chuyện gần gũi giúp em luyện kỹ năng bảo vệ bản thân.</p><button className="button primary" onClick={() => navigate('library')}>Đến thư viện<ArrowRight size={18} /></button></div></div><button className="home-history" onClick={() => navigate('achievements')}><span className="step-icon lavender"><Trophy /></span><span><strong>Nhìn lại hành trình của em</strong><small>Xem nhận xét và lựa chọn trong từng hành trình.</small></span><ArrowRight /></button></> : <Library lessons={lessons} nickname={user.nickname} onOpen={setDetail} />}</main><footer className="app-footer"><span>KIDGUARD VN · Khiên chắn nhí</span><span><Heart size={13} /> Mỗi lựa chọn là một hành trình.</span></footer></div></div>}
    {error && <div className="toast" role="alert"><span>{error}</span><button className="icon-button" onClick={() => setError('')} aria-label="Đóng thông báo"><X size={18} /></button></div>}
    {auth && !user && <Modal title={auth === 'register' ? 'Tạo tài khoản' : 'Đăng nhập'} onClose={() => setAuth(null)}><AuthForm initialMode={auth} onSuccess={value => { setUser(value); setPage('home'); setAuth(null); setError(''); }} /></Modal>}
    {detail && <Modal title={detail.title} onClose={() => setDetail(null)}><img className="detail-cover" src={detail.cover} alt="" /><span className="pill"><Clock3 size={14} /> {detail.duration}</span><p className="detail-description">{detail.description}</p><p className="muted">{detail.mediaNote}</p><button className="button primary full" onClick={() => startLesson(detail.id)} disabled={starting}>{starting ? 'Đang mở…' : 'Bắt đầu bài học'}<Play size={16} /></button></Modal>}
    {historyId && <Modal title={history[0]?.lessonTitle ?? 'Lịch sử làm bài'} onClose={() => setHistoryId(null)} wide><HistoryPanel key={historyId} attempts={history} /></Modal>}
    {help && <Modal title="Cùng em lớn lên an toàn" onClose={() => setHelp(false)}><div className="help-intro"><ShieldCheck size={36} /><p>KIDGUARD VN giúp em luyện cách xử lý tình huống qua những câu chuyện tương tác.</p></div><h3>Bắt đầu như thế nào?</h3><ol className="help-list"><li>Tạo tài khoản bằng biệt danh và tên đăng nhập.</li><li>Vào thư viện, chọn một bài học để bắt đầu.</li><li>Chọn cách xử lý, đọc phản hồi và theo dõi câu chuyện.</li><li>Hoàn thành câu chuyện, xem nhận xét và lựa chọn đã lưu tại Thành tựu của em.</li></ol><div className="help-note"><Heart size={22} /><p>Nếu một chuyện ngoài đời khiến em lo lắng hoặc không an toàn, hãy nói với người lớn em tin tưởng. Em không phải tự xử lý một mình.</p></div><p className="muted small">Phiên bản hiện tại chưa có khôi phục mật khẩu. Em hãy nhờ người lớn tin cậy giúp lưu thông tin đăng nhập ở nơi an toàn.</p></Modal>}
    {exitConfirm && <Modal title="Tạm dừng câu chuyện?" onClose={() => setExitConfirm(false)}><p>Lượt chưa hoàn thành sẽ không xuất hiện trong lịch sử. Khi quay lại, em sẽ bắt đầu một lượt mới.</p><div className="modal-actions"><button className="button outline" onClick={() => setExitConfirm(false)}>Học tiếp</button><button className="button primary" onClick={() => { setStory(null); setExitConfirm(false); navigate('library'); }}>Về thư viện</button></div></Modal>}
    {logoutConfirm && <Modal title="Đăng xuất tài khoản?" onClose={() => setLogoutConfirm(false)}>{story && <p>Lượt đang làm dở sẽ cần bắt đầu lại.</p>}<div className="modal-actions"><button className="button outline" onClick={() => setLogoutConfirm(false)}>Ở lại</button><button className="button primary" disabled={loggingOut} onClick={logout}>{loggingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}</button></div></Modal>}
  </>;
}
