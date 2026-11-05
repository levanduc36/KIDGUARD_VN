import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Use the real media ended event after seeking near the end; no synthetic events.
async function finishVideo(page: Page) {
  await page.locator('video').evaluate(async (video: HTMLVideoElement) => {
    video.muted = true;
    if (video.readyState < 1) await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error('Video failed to load')), { once: true });
    });
    video.currentTime = Math.max(0, video.duration - 0.25);
    await video.play();
  });
  await expect(page.locator('.scene-actions')).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
  await expect(page.locator('.scene-player, .scene-recap')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
}

async function openVideo(page: Page) {
  await expect(page.locator('.scene-intro')).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.locator('video')).toHaveCount(0);
  await page.getByRole('button', { name: 'Xem video tình huống' }).click();
  await expect(page.locator('video')).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
}

test('official lessons, videos, reviewable history and login work on desktop and mobile', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const username = `hero_${testInfo.project.name}_${Date.now()}`;
  const password = 'My-secret-hero-password';
  await page.goto('/');
  await page.getByRole('button', { name: 'Bắt đầu hành trình' }).click();
  await page.locator('input[name=fullName]').fill('Nguyễn Minh An');
  await page.locator('input[name=nickname]').fill('Siêu nhân nhí');
  await page.getByLabel('Tên đăng nhập', { exact: false }).fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByLabel('Nhập lại mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Rất vui được gặp em/ })).toBeVisible();
  await page.getByRole('button', { name: 'Đến thư viện', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Thư viện tình huống' })).toBeVisible();
  await expect(page.locator('.lesson-card')).toHaveCount(2);
  await expect(page.locator('.filters, .sidebar-quote, .demo-banner')).toHaveCount(0);
  await expect(page.getByText('Bài minh họa', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `.artifacts/library-official-${testInfo.project.name}.png`, fullPage: true });

  async function choose(index: number) {
    await page.getByRole('radio').nth(index).check();
    await page.getByRole('button', { name: 'Chọn cách xử lý này' }).click();
    await expect(page.locator('.scene-intro')).toBeVisible();
    await expect(page.getByText('Lựa chọn của em đã được ghi nhận', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Chuyện gì xảy ra tiếp?' })).toHaveCount(0);
  }
  for (const safe of [false, true]) {
    await page.locator('.lesson-card').filter({ has: page.getByRole('heading', { name: 'Lừa đảo', exact: true }) }).click();
    await page.getByRole('button', { name: 'Bắt đầu bài học', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Một lời nhờ giúp', exact: true })).toBeVisible();
    await openVideo(page);
    await expect(page.locator('video')).toHaveAttribute('src', '/videos/lua-dao/scene-1.mp4');
    await page.locator('video').evaluate(async (v: HTMLVideoElement) => { v.muted = true; await v.play(); });
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0);
    await page.screenshot({ path: `.artifacts/player-centered-${testInfo.project.name}.png`, fullPage: true });
    await expect(page.getByRole('radio')).toHaveCount(0);
    await finishVideo(page);
    if (!safe) {
      await page.getByRole('radio').nth(1).check();
      await expect(page.getByRole('radio')).toHaveCount(4);
      await page.screenshot({ path: `.artifacts/choices-only-${testInfo.project.name}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Xem lại video' }).click();
      await expect(page.locator('.scene-actions')).toHaveCount(0);
      await expect(page.getByRole('radio')).toHaveCount(0);
      await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeLessThan(5);
      await finishVideo(page);
      await expect(page.getByRole('radio').nth(1)).toBeChecked();
    }
    await choose(safe ? 3 : 1);
    if (!safe) {
      await expect(page.getByRole('heading', { name: 'Tin nhắn từ bạn thân', exact: true })).toBeVisible();
      await expect(page.locator('.scenario-text')).toContainText('tin nhắn thoại');
      await expect(page.locator('.scenario-text')).not.toContainText('mua quần áo');
      await openVideo(page);
      await expect(page.locator('video')).toHaveAttribute('src', '/videos/lua-dao/scene-4.mp4');
      await finishVideo(page);
      await choose(0);
      await openVideo(page);
      await expect(page.locator('video')).toHaveAttribute('src', '/videos/lua-dao/end-4-1.mp4');
    } else {
      await openVideo(page);
      await expect(page.locator('video')).toHaveAttribute('src', '/videos/lua-dao/scene-7.mp4');
    }
    await expect(page.locator('.ending-analysis')).toHaveCount(0);
    await page.screenshot({ path: `.artifacts/ending-${safe}-${testInfo.project.name}.png`, fullPage: true });
    await expect(page.getByRole('button', { name: 'Hoàn thành và nhìn lại' })).toHaveCount(0);
    await finishVideo(page);
    await page.getByRole('button', { name: 'Hoàn thành và nhìn lại' }).click();
    await expect(page.getByRole('heading', { name: 'Điều em có thể mang theo' })).toBeVisible();
    await expect(page.locator('.result-evaluation strong')).toBeVisible();
    await expect(page.locator('.ending-analysis')).toBeVisible();
    await expect(page.locator('.result-score')).toHaveCount(0);
    await page.screenshot({ path: `.artifacts/takeaway-${safe}-${testInfo.project.name}.png`, fullPage: true });
    if (safe) {
      // Retry must reopen the current official lesson, never the removed demo.
      await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Một lời nhờ giúp', exact: true })).toBeVisible();
      // Repeating exactly the same route replaces the earlier result.
      await openVideo(page);
      await finishVideo(page);
      await choose(3);
      await openVideo(page);
      await finishVideo(page);
      await page.getByRole('button', { name: 'Hoàn thành và nhìn lại' }).click();
      await page.getByRole('button', { name: 'Về thư viện', exact: true }).click();
    } else await page.getByRole('button', { name: 'Về thư viện', exact: true }).click();
  }
  async function achievements() {
    if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: 'Mở điều hướng' }).click();
    await page.getByRole('button', { name: 'Thành tựu của em', exact: true }).click();
  }
  await achievements();
  await expect(page.locator('.filters')).toHaveCount(0);
  await page.locator('.history-card').click();
  await expect(page.locator('.attempt-row')).toHaveCount(2);
  await expect(page.locator('.attempt-row').first()).toContainText('Em xử lý rất tốt!');
  await expect(page.locator('.attempt-row').last()).toContainText('Cùng luyện thêm');
  await page.locator('.attempt-row').last().click();
  await expect(page.getByRole('heading', { name: 'Những lựa chọn của em' })).toBeVisible();
  await expect(page.locator('.result-evaluation strong')).toContainText('Cùng luyện thêm');
  await expect(page.locator('.review-choices li')).toHaveCount(2);
  await expect(page.locator('.review-selection').last()).toContainText('chuyển tiền ngay');
  await expect(page.locator('.review-scenario').last()).toContainText('tin nhắn thoại');
  await expect(page.locator('.review-scenario').last()).not.toContainText('mua quần áo');
  await expect(page.locator('.ending-analysis')).toContainText('Kết quả: Chưa an toàn');
  await page.screenshot({ path: `.artifacts/review-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Các lần khám phá' }).click();
  await page.locator('.attempt-row').first().click();
  await expect(page.locator('.review-choices li')).toHaveCount(1);
  await expect(page.locator('.review-selection')).toContainText('quầy bảo vệ');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Mở menu tài khoản' }).click();
  await page.getByRole('menuitem', { name: 'Đăng xuất', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toContainText('Các bài đã hoàn thành vẫn được lưu');
  await expect(page.getByRole('dialog')).not.toContainText('Em có thể đăng nhập để tiếp tục');
  await page.getByRole('dialog').getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByLabel('Tên đăng nhập', { exact: false }).fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('dialog').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Rất vui được gặp em/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Rất vui được gặp em/ })).toBeVisible();
  await achievements();
  await expect(page.locator('.history-card')).toContainText('2 hành trình đã lưu');
  expect(errors).toEqual([]);
});

test('staged player retries failed video and gates transitions in both official lessons', async ({ page }, testInfo) => {
  await page.goto('/');
  const register = await page.request.post('/api/auth/register', {
    headers: { origin: 'http://127.0.0.1:4173', 'x-kidguard-request': '1' },
    data: { username: `flow_${testInfo.project.name}_${Date.now()}`, nickname: 'Bạn nhỏ', fullName: 'Bạn nhỏ kiểm thử', password: 'Test-video-flow-password' },
  });
  expect(register.status()).toBe(201);
  await page.reload();
  await page.getByRole('button', { name: 'Đến thư viện', exact: true }).click();
  await page.locator('.lesson-card').filter({ has: page.getByRole('heading', { name: 'Lừa đảo', exact: true }) }).click();
  await page.getByRole('button', { name: 'Bắt đầu bài học', exact: true }).click();
  await page.route('**/videos/lua-dao/scene-1.mp4', route => route.abort());
  await openVideo(page);
  await expect(page.getByRole('button', { name: 'Tải lại video' })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await page.unroute('**/videos/lua-dao/scene-1.mp4');
  await page.getByRole('button', { name: 'Tải lại video' }).click();
  await finishVideo(page);
  async function choose(index: number) {
    await page.getByRole('radio').nth(index).check();
    await page.getByRole('button', { name: 'Chọn cách xử lý này' }).click();
    await expect(page.locator('.scene-intro')).toBeVisible();
  }
  await choose(0);
  await expect(page.getByRole('heading', { name: 'Sau lời nhờ giúp', exact: true })).toBeVisible();
  await openVideo(page);
  await expect(page.getByRole('button', { name: 'Tiếp tục câu chuyện' })).toHaveCount(0);
  await finishVideo(page);
  await expect(page.getByRole('radio')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tiếp tục câu chuyện' }).click();
  await expect(page.locator('.scene-intro')).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: 'Mở điều hướng' }).click();
  await page.getByRole('button', { name: 'Thư viện tình huống', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Rời bài học', exact: true }).click();
  await page.locator('.lesson-card').filter({ has: page.getByRole('heading', { name: 'Bạo lực học đường', exact: true }) }).click();
  await page.getByRole('button', { name: 'Bắt đầu bài học', exact: true }).click();
  for (let step = 0; step < 12; step++) {
    await openVideo(page);
    await finishVideo(page);
    if (await page.getByRole('radio').count()) {
      await choose((await page.getByRole('radio').count()) - 1);
    } else if (await page.getByRole('button', { name: 'Hoàn thành và nhìn lại' }).count()) {
      await page.getByRole('button', { name: 'Hoàn thành và nhìn lại' }).click();
      break;
    } else await page.getByRole('button', { name: 'Tiếp tục câu chuyện' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Điều em có thể mang theo' })).toBeVisible();
});

test('all 29 videos decode, seek and support range requests', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The full media audit only needs one browser instance.');
  test.setTimeout(120_000);
  const manifest = JSON.parse(readFileSync('public/videos/manifest.json', 'utf8')) as { output: string }[];
  expect(manifest).toHaveLength(29);
  await page.goto('/');
  for (const entry of manifest) {
    const url = '/' + entry.output.replace(/^public\//, '');
    const response = await request.get(url, { headers: { Range: 'bytes=0-1023' } });
    expect(response.status(), url).toBe(206);
    expect(response.headers()['content-type']).toContain('video/mp4');
    const result = await page.evaluate(async src => {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'auto';
      video.src = src;
      document.body.append(video);
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Video timeout: ' + src)), 12_000);
          video.onerror = () => { clearTimeout(timer); reject(new Error('Video decode failed: ' + src)); };
          video.onloadeddata = () => { clearTimeout(timer); resolve(); };
        });
        await video.play();
        const frame = new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Seek timeout: ' + src)), 12_000);
          video.onseeked = () => { clearTimeout(timer); resolve(); };
        });
        video.currentTime = Math.min(2, video.duration / 2);
        await frame;
        return { width: video.videoWidth, duration: video.duration, error: video.error?.message ?? null };
      } finally { video.pause(); video.removeAttribute('src'); video.load(); video.remove(); }
    }, url);
    expect(result.error, url).toBeNull();
    expect(result.width, url).toBe(1280);
    expect(result.duration, url).toBeGreaterThan(3);
  }
});
