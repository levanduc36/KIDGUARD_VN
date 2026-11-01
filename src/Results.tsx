import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, Heart, Trophy } from 'lucide-react';
import { api, type Attempt, type Result } from './api';

const formatDate = (time: number) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(time);

function Takeaway({ result, main = false }: { result: Result; main?: boolean }) {
  return <section className="takeaway">
    {main ? <h1>Điều em có thể mang theo</h1> : <h3>Điều em có thể mang theo</h3>}
    {result.analysis ? <p className="ending-analysis">{result.analysis}</p> : <p>Phần nhìn lại của phiên bản bài học này chưa có trong lịch sử cũ.</p>}
    {result.help && <div className="ending-help"><Heart size={20} /><p>{result.help}</p></div>}
  </section>;
}

export function ResultScreen({ result, onAchievements, onLibrary, onRetry, starting }: { result: Result; onAchievements: () => void; onLibrary: () => void; onRetry: () => void; starting: boolean }) {
  return <div className="completion-card">
    <span className="pill"><CheckCircle2 size={16} /> ĐÃ HOÀN THÀNH BÀI HỌC</span>
    <p className="completion-lesson">{result.lessonTitle}</p>
    <p className={`result-evaluation ${result.evaluation.level}`}><strong>{result.evaluation.message}</strong></p>
    <Takeaway result={result} main />
    <div className="saved-note"><CheckCircle2 size={17} /> Hành trình của em đã được lưu trong Thành tựu.</div>
    <div className="result-actions"><button className="button primary" onClick={onAchievements}>Xem thành tựu<Trophy size={17} /></button><button className="button outline" disabled={starting} onClick={onRetry}>Thử lại</button></div>
    <button className="text-button" onClick={onLibrary}>Về thư viện<ArrowRight size={16} /></button>
  </div>;
}

export function HistoryPanel({ attempts }: { attempts: Attempt[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setResult(null); setError('');
    if (selected) void api<{ result: Result }>(`/history/${encodeURIComponent(selected)}`)
      .then(data => { if (active) setResult(data.result); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Chưa tải được kết quả.'); });
    return () => { active = false; };
  }, [selected, retry]);
  if (selected) return <div className="attempt-review">
    <button className="text-button" onClick={() => setSelected(null)}><ArrowLeft size={17} /> Các lần khám phá</button>
    {error ? <div role="alert"><p>{error}</p><button className="button outline" onClick={() => setRetry(value => value + 1)}>Thử tải lại</button></div> : !result ? <p role="status">Đang mở hành trình của em…</p> : <>
      <h3>Những lựa chọn của em</h3>
      <p className={`result-evaluation ${result.evaluation.level}`}><strong>{result.evaluation.message}</strong></p>
      <p className="muted">{formatDate(result.completedAt)}</p>
      <ol className="review-choices">{result.choices.map((choice, index) => <li key={`${choice.nodeId}-${index}`}>
        <h4>{index + 1}. {choice.title}</h4>
        <p className="review-scenario">{choice.text}</p>
        <div className="review-selection"><CheckCircle2 size={18} /><div><strong>Em đã chọn</strong><p>{choice.choiceText}</p></div></div>
        {choice.feedback && <p className="review-feedback">{choice.feedback}</p>}
      </li>)}</ol>
      {!result.choices.length && <p>Chi tiết lựa chọn chưa có trong lượt làm cũ này.</p>}
      <Takeaway result={result} />
    </>}
  </div>;
  return <><p className="muted">Lần mới nhất hiển thị trước. Những lần có cùng chuỗi lựa chọn chỉ giữ lần cuối.</p>
    <div className="attempt-list">{attempts.map(attempt => <button key={attempt.id} className="attempt-row" onClick={() => setSelected(attempt.id)}>
      <span><span className={`evaluation ${attempt.evaluation.level}`}>{attempt.evaluation.message}</span><small>{formatDate(attempt.completedAt)}</small><span className="review-link">Xem lại lựa chọn</span></span><ChevronRight size={20} />
    </button>)}</div>
    <p className="history-note">Thời gian hiển thị theo múi giờ Việt Nam.</p>
  </>;
}
