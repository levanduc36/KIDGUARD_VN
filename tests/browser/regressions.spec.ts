import { test, expect } from '@playwright/test';
import { account, post, goTo, finishVideo, origin } from './helpers';

test('class notes stay with their class, drafts survive collapse, and removals require confirmation', async ({ page, browser }) => {
  await account(page, 'teacher');
  const studentContext = await browser.newContext({ baseURL: origin });
  const studentPage = await studentContext.newPage();
  try {
    const student = await account(studentPage);
    const classes = [];
    for (const name of ['Lớp A kiểm thử', 'Lớp B kiểm thử']) {
      const created = await post(page.request, '/classes', { name });
      expect(created.status()).toBe(201);
      const classroom = (await created.json()).class;
      const joined = await post(studentPage.request, '/classes/join', { code: classroom.joinCode });
      const requestId = (await joined.json()).request.id;
      expect((await post(page.request, `/classes/${classroom.id}/requests/${requestId}/respond`, { decision: 'accept' })).status()).toBe(200);
      await post(page.request, `/classes/${classroom.id}/notes/${student.id}`, { body: `${name} ghi chú` });
      classes.push(classroom);
    }
    const [a, b] = classes;
    await page.getByRole('button', { name: 'Mở lớp học', exact: true }).click();
    const open = async (name: string) => page.locator('.class-card').filter({ hasText: name }).click();
    const toggle = page.locator('.member-toggle').filter({ hasText: student.fullName });
    await open(a.name); await toggle.click();
    await page.locator('textarea').fill('Bản nháp của A');
    await toggle.click(); await toggle.click();
    await expect(page.locator('textarea')).toHaveValue('Bản nháp của A');
    await page.getByRole('button', { name: '← Danh sách lớp' }).click();
    await open(b.name); await toggle.click();
    await expect(page.locator('textarea')).toHaveValue(`${b.name} ghi chú`);
    await page.getByRole('button', { name: '← Danh sách lớp' }).click();
    await open(a.name); await toggle.click();
    await expect(page.locator('textarea')).toHaveValue('Bản nháp của A');
    await page.getByRole('button', { name: 'Lưu ghi chú' }).click();
    await expect(page.getByRole('status')).toContainText('Đã lưu ghi chú');

    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**/api/classes/${a.id}/members`, async route => {
      const response = await route.fetch(); await held; await route.fulfill({ response });
    });
    await page.getByRole('button', { name: '← Danh sách lớp' }).click();
    const requestedA = page.waitForRequest(r => r.url().endsWith(`/classes/${a.id}/members`));
    await open(a.name); await requestedA;
    await expect(page.locator('.member-list')).toHaveCount(0);
    await page.getByRole('button', { name: '← Danh sách lớp' }).click();
    await open(b.name); await expect(toggle).toBeVisible();
    const returnedA = page.waitForResponse(r => r.url().endsWith(`/classes/${a.id}/members`));
    release(); await returnedA;
    await toggle.click();
    await expect(page.locator('.class-detail-head h2')).toHaveText(b.name);
    await expect(page.locator('textarea')).toHaveValue(`${b.name} ghi chú`);
    await page.getByRole('button', { name: 'Lưu ghi chú' }).click();
    await expect(page.getByRole('status')).toContainText('Đã lưu ghi chú');
    const rosterB = await (await page.request.get(`/api/classes/${b.id}/members`)).json();
    expect(rosterB.members[0].note.body).toBe(`${b.name} ghi chú`);
    await page.unroute(`**/api/classes/${a.id}/members`);

    await page.locator('textarea').fill('');
    await page.getByRole('button', { name: 'Lưu ghi chú' }).click();
    await expect(page.getByRole('status')).toContainText('Đã xóa ghi chú');
    expect((await (await page.request.get(`/api/classes/${b.id}/members`)).json()).members[0].note).toBeNull();
    await page.locator('textarea').fill('Chưa lưu');
    await goTo(page, 'Trang chủ');
    await expect(page.getByRole('dialog')).toContainText('Ghi chú đang soạn');
    await page.getByRole('button', { name: 'Ở lại', exact: true }).click();
    await expect(page.locator('textarea')).toHaveValue('Chưa lưu');
    await goTo(page, 'Trang chủ');
    await page.getByRole('button', { name: 'Bỏ bản nháp và rời trang' }).click();
    await expect(page.locator('.teacher-home')).toBeVisible();
    await page.getByRole('button', { name: 'Mở lớp học', exact: true }).click();
    await open(b.name);
    await page.getByRole('button', { name: 'Xóa lớp', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText(b.name);
    expect((await (await page.request.get('/api/classes')).json()).classes).toHaveLength(2);
    await page.getByRole('button', { name: 'Hủy', exact: true }).click();
    await expect(page.locator('.class-detail-head h2')).toHaveText(b.name);
    await page.getByRole('button', { name: 'Xóa lớp', exact: true }).click();
    await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await expect(page.locator('.class-card')).toHaveCount(1);
    await open(a.name); await toggle.click();
    await page.getByRole('button', { name: 'Đưa khỏi lớp', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText(student.fullName);
    await page.getByRole('button', { name: 'Hủy', exact: true }).click();
    await expect(page.locator('.member-list h3')).toHaveText('Thành viên (1)');
    await page.getByRole('button', { name: 'Đưa khỏi lớp', exact: true }).click();
    await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await expect(page.locator('.member-list h3')).toHaveText('Thành viên (0)');
    expect((await studentPage.request.get(`/api/classes/${a.id}/members`)).status()).toBe(403);
  } finally { await studentContext.close(); }
});

test('invitations distinguish teacher and student actions, recover failures and update badges', async ({ page, browser }) => {
  await account(page, 'teacher');
  const context = await browser.newContext({ baseURL: origin });
  const studentPage = await context.newPage();
  try {
    const student = await account(studentPage);
    const created = await post(page.request, '/classes', { name: 'Lớp nhận lời mời' });
    const classroom = (await created.json()).class;
    const joined = await post(studentPage.request, '/classes/join', { code: classroom.joinCode });
    const joinId = (await joined.json()).request.id;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('.nav-notification')).toHaveCount(1);
    await page.getByRole('button', { name: 'Mở lớp học' }).click();
    await page.locator('.class-card').click();
    await expect(page.locator('.requests-list')).toContainText(student.fullName);
    await page.locator('.requests-list').getByRole('button', { name: 'Từ chối' }).click();
    await expect(page.locator('.requests-list')).toHaveCount(0);
    await expect(page.locator('.nav-notification')).toHaveCount(0);
    await page.locator('input[name=studentId]').fill(student.publicId);
    await page.getByRole('button', { name: 'Gửi lời mời' }).click();
    await expect(page.locator('.sent-invitations')).toContainText('Chờ học sinh phản hồi');
    await expect(page.locator('.sent-invitations button')).toHaveCount(0);
    await expect(page.locator('.requests-list')).toHaveCount(0);
    await studentPage.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(studentPage.locator('.nav-notification')).toHaveCount(1);
    await goTo(studentPage, 'Lớp học');
    await studentPage.route('**/api/classes/*/requests/*/respond', route => route.abort());
    await studentPage.getByRole('button', { name: 'Đồng ý', exact: true }).click();
    await expect(studentPage.getByRole('status')).toContainText('Chưa kết nối');
    await expect(studentPage.locator('.class-detail')).toHaveCount(0);
    await expect(studentPage.locator('.invitation-box')).toBeVisible();
    await studentPage.unroute('**/api/classes/*/requests/*/respond');
    await studentPage.getByRole('button', { name: 'Đồng ý', exact: true }).click();
    await expect(studentPage.locator('.member-list h3')).toHaveText('Thành viên (1)');
    await expect(studentPage.locator('.member-list')).toContainText(student.fullName);
    await expect(studentPage.locator('.nav-notification')).toHaveCount(0);
    await studentPage.getByRole('button', { name: 'Rời lớp', exact: true }).click();
    await expect(studentPage.getByRole('dialog')).toContainText(classroom.name);
    await studentPage.getByRole('button', { name: 'Hủy', exact: true }).click();
    await expect(studentPage.locator('.member-list h3')).toHaveText('Thành viên (1)');
    expect(joinId).toBeTruthy();
  } finally { await context.close(); }
});

test('lesson navigation honors its destination and lost responses resume the saved step', async ({ page }) => {
  await account(page);
  async function start() {
    await goTo(page, 'Thư viện tình huống');
    await page.locator('.lesson-card').first().click();
    await page.getByRole('button', { name: 'Bắt đầu bài học', exact: true }).click();
    await expect(page.locator('.scene-intro')).toBeVisible();
  }
  await start();
  await page.getByRole('button', { name: 'Mở menu tài khoản' }).click();
  await page.getByRole('menuitem', { name: 'Cài đặt' }).click();
  await page.getByRole('button', { name: 'Học tiếp', exact: true }).click();
  await expect(page.locator('.scene-intro')).toBeVisible();
  await page.getByRole('button', { name: 'Mở menu tài khoản' }).click();
  await page.getByRole('menuitem', { name: 'Cài đặt' }).click();
  await page.getByRole('button', { name: 'Rời bài học', exact: true }).click();
  await expect(page.locator('.settings-page')).toBeVisible();
  await expect(page.locator('.story-page')).toHaveCount(0);
  await start();
  await goTo(page, 'Lớp học');
  await page.getByRole('button', { name: 'Rời bài học', exact: true }).click();
  await expect(page.locator('.classes-page')).toBeVisible();
  await start();
  await finishVideo(page);
  await page.getByRole('radio').last().check();
  // Let the server commit, then lose both its response and the first recovery GET.
  await page.route('**/api/attempts/*', async route => {
    if (route.request().method() === 'GET') await route.abort(); else await route.continue();
  });
  await page.route('**/api/attempts/*/choices', async route => { await route.fetch(); await route.abort(); });
  await page.getByRole('button', { name: 'Chọn cách xử lý này' }).click();
  await expect(page.locator('.error-message')).toContainText('Chưa kết nối');
  await expect(page.getByRole('radio').last()).toBeChecked();
  await page.unroute('**/api/attempts/*'); await page.unroute('**/api/attempts/*/choices');
  await page.getByRole('button', { name: 'Chọn cách xử lý này' }).click();
  await expect(page.locator('.scene-intro')).toBeVisible();
  await finishVideo(page);
  // The ending is already saved when this response is lost; recover it once.
  await page.route('**/api/attempts/*/advance', async route => { await route.fetch(); await route.abort(); });
  await page.getByRole('button', { name: 'Hoàn thành và nhìn lại' }).click();
  await expect(page.locator('.completion-card')).toBeVisible();
  const history = await (await page.request.get('/api/history')).json();
  expect(history.attempts).toHaveLength(1);
  const review = await (await page.request.get(`/api/history/${history.attempts[0].id}`)).json();
  expect(review.result.choices).toHaveLength(1);
  expect(review.result.evaluation.level).toBe('confident');
});
