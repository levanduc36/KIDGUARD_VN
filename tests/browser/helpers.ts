import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export const origin = 'http://127.0.0.1:4173';
export async function post(request: APIRequestContext, url: string, data: unknown) {
  return request.post('/api' + url, { headers: { origin, 'x-kidguard-request': '1' }, data });
}
export async function account(page: Page, role: 'student' | 'teacher' = 'student') {
  const username = `${role}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const body: Record<string, string> = { username, fullName: username, password: 'Browser-regression-123', role };
  if (role === 'teacher') {
    body.teacherCode = 'TEACH-' + randomUUID().toUpperCase();
    if (!process.env.KIDGUARD_E2E_DATABASE) throw new Error('Missing isolated test database');
    const db = new DatabaseSync(process.env.KIDGUARD_E2E_DATABASE);
    try {
      db.exec('PRAGMA busy_timeout=5000');
      db.prepare('INSERT INTO teacher_access_codes(code_hash,label,created_at) VALUES (?,?,?)').run(createHash('sha256').update(body.teacherCode).digest('hex'), 'browser-test', Date.now());
    } finally { db.close(); }
  } else body.nickname = 'Bạn kiểm thử';
  const response = await post(page.request, '/auth/register', body);
  expect(response.status()).toBe(201);
  const user = (await response.json()).user;
  await page.goto('/');
  return user;
}
export async function goTo(page: Page, name: string) {
  await expect(page.locator('.app-header')).toBeVisible();
  const mobile = page.getByRole('button', { name: 'Mở điều hướng', exact: true });
  if (await mobile.isVisible() && await mobile.getAttribute('aria-expanded') !== 'true') await mobile.click();
  await page.locator('nav[aria-label="Điều hướng chính"]').getByRole('button', { name, exact: false }).click();
}
export async function finishVideo(page: Page) {
  await page.getByRole('button', { name: 'Xem video tình huống', exact: true }).click();
  await page.locator('video').evaluate(async (video: HTMLVideoElement) => {
    if (video.readyState < 1) await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error('Cannot load video')), { once: true });
    });
    video.muted = true; video.currentTime = Math.max(0, video.duration - 0.2); await video.play();
  });
  await expect(page.locator('.scene-actions')).toBeVisible();
}
