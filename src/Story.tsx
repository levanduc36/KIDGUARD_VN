import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, Leaf, Play, RotateCcw } from 'lucide-react';
import { api, ApiError, type ChoiceResponse, type Lesson, type Result, type StoryNode } from './api';

export type ActiveStory = { id: string; node: StoryNode; answered: number; lesson: Lesson };

export function Story({ story, onUpdate, onComplete }: { story: ActiveStory; onUpdate: (story: ActiveStory) => void; onComplete: (result: Result) => void }) {
  const [stage, setStage] = useState<'intro' | 'video' | 'choices'>('intro');
  const [selected, setSelected] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [videoError, setVideoError] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const actionsHeading = useRef<HTMLHeadingElement>(null);
  const ending = story.node.kind === 'ending';
  const question = story.node.kind === 'question';
  const ready = stage === 'choices';
  useEffect(() => {
    (stage === 'choices' ? actionsHeading.current : heading.current)?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [stage]);

  function move(value: Pick<ChoiceResponse, 'nextNode' | 'answered' | 'result'>) {
    if (value.result) { onComplete(value.result); return; }
    if (value.nextNode) onUpdate({ ...story, node: value.nextNode, answered: value.answered });
  }
  async function recover(failure: unknown) {
    if (failure instanceof ApiError && (failure.status === 0 || failure.status === 409 || failure.status >= 500)) {
      try {
        const state = await api<Pick<ChoiceResponse, 'nextNode' | 'answered' | 'result'>>(`/attempts/${story.id}`);
        if (state.result || (state.nextNode && state.nextNode.id !== story.node.id)) { move(state); return; }
      } catch { /* Keep the current choice so the learner can retry when online. */ }
    }
    setError(failure instanceof Error ? failure.message : 'Chưa ghi nhận được lựa chọn. Em thử lại nhé.');
  }
  async function submit() {
    if (!ready || !selected || pending) return;
    setPending(true); setError('');
    try { move(await api<ChoiceResponse>(`/attempts/${story.id}/choices`, { nodeId: story.node.id, choiceId: selected })); }
    catch (err) { await recover(err); }
    finally { setPending(false); }
  }
  async function advance() {
    if (!ready || pending) return;
    setPending(true); setError('');
    try { move(await api<Pick<ChoiceResponse, 'nextNode' | 'answered' | 'result'>>(`/attempts/${story.id}/advance`, { nodeId: story.node.id })); }
    catch (err) { await recover(err); }
    finally { setPending(false); }
  }
  async function replay() {
    const player = video.current;
    if (!player) return;
    setError('');
    if (videoError) { setVideoError(false); player.load(); }
    player.currentTime = 0;
    player.scrollIntoView({ block: 'center', behavior: 'smooth' });
    try { await player.play(); }
    catch { setError('Em nhấn nút phát trên video để xem tiếp nhé.'); }
  }
  return <section className={`story-page staged-story stage-${stage}`}>
    <div className="story-title"><span className="eyebrow">{story.lesson.title.toLocaleUpperCase('vi')}</span><h1 ref={heading} tabIndex={-1}>{story.node.title}</h1><p>{question ? `Tình huống ${story.answered + 1} · Đọc, quan sát và chọn cách xử lý của em.` : 'Cùng theo dõi diễn biến tiếp theo của câu chuyện.'}</p></div>
    {stage === 'intro' ? <div className="scene-intro">
      <span className="round-icon"><BookOpen /></span><h2>{ending ? 'Trước khi xem đoạn kết' : 'Tình huống của em'}</h2>
      <div className="scenario-text"><p>{story.node.text || 'Lựa chọn vừa rồi sẽ đưa câu chuyện đến đâu? Cùng xem diễn biến tiếp theo nhé.'}</p></div>
      {!story.node.video && <p className="muted">Cảnh này chưa có video. Em đọc tình huống rồi tiếp tục nhé.</p>}
      <button className="button primary" onClick={() => setStage(story.node.video ? 'video' : 'choices')}>{story.node.video ? 'Xem video tình huống' : question ? 'Chọn cách xử lý' : 'Tiếp tục'}<Play size={18} /></button>
    </div> : <>
      {stage === 'video' && story.node.video && <div className="scene-player">
        <video ref={video} controls playsInline autoPlay preload="metadata" poster={story.node.video.poster} src={story.node.video.src}
          aria-label={`Video: ${story.node.title}`} onEnded={() => setStage('choices')} onError={() => setVideoError(true)}>
          {story.node.video.captions && <track kind="captions" src={story.node.video.captions} srcLang="vi" label="Tiếng Việt" default />}
          Trình duyệt chưa hỗ trợ video.
        </video>
        <div className="player-toolbar"><p aria-live="polite">{videoError ? 'Chưa tải được video. Em thử tải lại nhé.' : 'Video kết thúc sẽ chuyển sang bước tiếp theo.'}</p><button className="button outline" onClick={replay} disabled={pending}><RotateCcw size={17} />{videoError ? 'Tải lại video' : 'Phát lại video'}</button></div>
      </div>}
      {ready && <div className="choices-panel scene-actions">
        {story.node.video && <button className="text-button back-to-video" disabled={pending} onClick={() => { setVideoError(false); setError(''); setStage('video'); }}><RotateCcw size={17} /> Xem lại video</button>}
        <h2 ref={actionsHeading} tabIndex={-1}>{question ? 'Em sẽ chọn cách nào?' : ending ? 'Câu chuyện đã khép lại' : 'Câu chuyện tiếp tục'}</h2>
        {question ? <><p className="muted">Chọn một đáp án để câu chuyện tiếp tục.</p>
          <fieldset disabled={pending}><legend className="sr-only">Cách xử lý của em</legend>{story.node.choices.map((choice, index) => <label key={choice.id} className={`choice ${selected === choice.id ? 'selected' : ''}`}><input type="radio" name="choice" value={choice.id} checked={selected === choice.id} onChange={() => setSelected(choice.id)} /><span className="choice-letter">{String.fromCharCode(65 + index)}</span><span>{choice.text}</span>{selected === choice.id && <Check size={17} />}</label>)}</fieldset>
          <button className="button primary full" onClick={submit} disabled={!selected || pending}>{pending ? 'Đang chuyển cảnh…' : 'Chọn cách xử lý này'}<ArrowRight size={18} /></button>
        </> : <><p className="muted">{ending ? 'Cùng nhìn lại điều em đã học từ những lựa chọn vừa rồi.' : 'Sẵn sàng khám phá diễn biến tiếp theo nhé.'}</p><button className="button primary full" disabled={pending} onClick={advance}>{pending ? 'Đang ghi nhận…' : ending ? 'Hoàn thành và nhìn lại' : 'Tiếp tục câu chuyện'}<ArrowRight size={18} /></button></>}
        <p className="story-reassurance"><Leaf size={15} /> Mỗi lựa chọn là một cơ hội để học thêm.</p>
      </div>}
      {error && <p className="error-message" role="alert">{error}</p>}
    </>}
  </section>;
}
