export type User = { id: string; username: string; nickname: string; fullName: string; role: 'student' | 'teacher'; publicId: string };
export type Lesson = { id: string; title: string; category: string; topic: string; theme: string; icon: string; description: string; duration: string | null; status: string; cover: string; mediaNote: string };
export type StoryNode = { id: string; title: string; text: string; kind: 'question' | 'narrative' | 'ending'; analysis?: string; help?: string; video: { src: string; poster?: string; captions?: string } | null; choices: { id: string; text: string }[] };
export type Evaluation = { level: 'confident' | 'growing' | 'practice'; message: string };
export type Attempt = { id: string; lessonId: string; lessonTitle: string; evaluation: Evaluation; completedAt: number };
export type Result = Attempt & { analysis: string; help: string; endingTitle: string; choices: { nodeId: string; choiceId: string; title: string; text: string; choiceText: string; feedback: string }[] };
export type ChoiceResponse = { feedback: string; positive: boolean; nextNode: StoryNode | null; answered: number; result: Result | null };
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Kidguard-Request': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch { throw new ApiError('Chưa kết nối được với máy chủ. Em kiểm tra mạng rồi thử lại nhé.', 0); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('session-expired'));
    throw new ApiError(data.error || 'Có lỗi xảy ra. Em thử lại nhé.', response.status);
  }
  return data;
}
