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
  await page.getByRole('button', { name: 'Xem video tÃ¬nh huá»‘ng' }).click();
  await expect(page.locator('video')).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
}

test('official lessons, videos, reviewable history and login work on desktop and mobile', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const username = `hero_${testInfo.project.name}_${Date.now()}`;
  const password = 'My-secret-hero-password';
  await page.goto('/');
  await page.getByRole('button', { name: 'Báº¯t Ä‘áº§u hÃ nh trÃ¬nh' }).click();
  await page.getByLabel('Biá»‡t danh cá»§a em').fill('SiÃªu nhÃ¢n nhÃ­');
  await page.getByLabel('TÃªn Ä‘Äƒng nháº­p', { exact: false }).fill(username);
  await page.getByLabel('Máº­t kháº©u', { exact: true }).fill(password);
  await page.getByLabel('Nháº­p láº¡i máº­t kháº©u', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Táº¡o tÃ i khoáº£n', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Ráº¥t vui Ä‘Æ°á»£c gáº·p em/ })).toBeVisible();
  await page.getByRole('button', { name: 'Äáº¿n thÆ° viá»‡n', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ThÆ° viá»‡n tÃ¬nh huá»‘ng' })).toBeVisible();
  await expect(page.locator('.lesson-card')).toHaveCount(2);
  await expect(page.locator('.filters, .sidebar-quote, .demo-banner')).toHaveCount(0);
  await expect(page.getByText('BÃ i minh há»a', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `.artifacts/library-official-${testInfo.project.name}.png`, fullPage: true });

  async function choose(index: number) {
    await page.getByRole('radio').nth(index).check();
    await page.getByRole('button', { name: 'Chá»n cÃ¡ch xá»­ lÃ½ nÃ y' }).click();
    await expect(page.locator('.scene-intro')).toBeVisible();
    await expect(page.getByText('Lá»±a chá»n cá»§a em Ä‘Ã£ Ä‘Æ°á»£c ghi nháº­n', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Chuyá»‡n gÃ¬ xáº£y ra tiáº¿p?' })).toHaveCount(0);
  }
  for (const safe of [false, true]) {
    await page.locator('.lesson-card').filter({ has: page.getByRole('heading', { name: 'Lá»«a Ä‘áº£o', exact: true }) }).click();
    await page.getByRole('button', { name: 'Báº¯t Ä‘áº§u bÃ i há»c', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Má»™t lá»i nhá» giÃºp', exact: true })).toBeVisible();
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
      await page.getByRole('button', { name: 'Xem láº¡i video' }).click();
      await expect(page.locator('.scene-actions')).toHaveCount(0);
      await expect(page.getByRole('radio')).toHaveCount(0);
      await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeLessThan(5);
      await finishVideo(page);
      await expect(page.getByRole('radio').nth(1)).toBeChecked();
    }
    await choose(safe ? 3 : 1);
    if (!safe) {
      await expect(page.getByRole('heading', { name: 'Tin nháº¯n tá»« báº¡n thÃ¢n', exact: true })).toBeVisible();
      await expect(page.locator('.scenario-text')).toContainText('tin nháº¯n thoáº¡i');
      await expect(page.locator('.scenario-text')).not.toContainText('mua quáº§n Ã¡o');
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
    await expect(page.getByRole('button', { name: 'HoÃ n thÃ nh vÃ  nhÃ¬n láº¡i' })).toHaveCount(0);
    await finishVideo(page);
    await page.getByRole('button', { name: 'HoÃ n thÃ nh vÃ  nhÃ¬n láº¡i' }).click();
    await expect(page.getByRole('heading', { name: 'Äiá»u em cÃ³ thá»ƒ mang theo' })).toBeVisible();
    await expect(page.locator('.result-evaluation strong')).toBeVisible();
    await expect(page.locator('.ending-analysis')).toBeVisible();
    await expect(page.locator('.result-score')).toHaveCount(0);
    await page.screenshot({ path: `.artifacts/takeaway-${safe}-${testInfo.project.name}.png`, fullPage: true });
    if (safe) {
      // Retry must reopen the current official lesson, never the removed demo.
      await page.getByRole('button', { name: 'Thá»­ láº¡i', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Má»™t lá»i nhá» giÃºp', exact: true })).toBeVisible();
      // Repeating exactly the same route replaces the earlier result.
      await openVideo(page);
      await finishVideo(page);
      await choose(3);
      await openVideo(page);
      await finishVideo(page);
      await page.getByRole('button', { name: 'HoÃ n thÃ nh vÃ  nhÃ¬n láº¡i' }).click();
      await page.getByRole('button', { name: 'Vá» thÆ° viá»‡n', exact: true }).click();
    } else await page.getByRole('button', { name: 'Vá» thÆ° viá»‡n', exact: true }).click();
  }
  async function achievements() {
    if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: 'Má»Ÿ Ä‘iá»u hÆ°á»›ng' }).click();
    await page.getByRole('button', { name: 'ThÃ nh tá»±u cá»§a em', exact: true }).click();
  }
  await achievements();
  await expect(page.locator('.filters')).toHaveCount(0);
  await page.locator('.history-card').click();
  await expect(page.locator('.attempt-row')).toHaveCount(2);
  await expect(page.locator('.attempt-row').first()).toContainText('Em xá»­ lÃ½ ráº¥t tá»‘t!');
  await expect(page.locator('.attempt-row').last()).toContainText('CÃ¹ng luyá»‡n thÃªm');
  await page.locator('.attempt-row').last().click();
  await expect(page.getByRole('heading', { name: 'Nhá»¯ng lá»±a chá»n cá»§a em' })).toBeVisible();
  await expect(page.locator('.result-evaluation strong')).toContainText('CÃ¹ng luyá»‡n thÃªm');
  await expect(page.locator('.review-choices li')).toHaveCount(2);
  await expect(page.locator('.review-selection').last()).toContainText('chuyá»ƒn tiá»n ngay');
  await expect(page.locator('.review-scenario').last()).toContainText('tin nháº¯n thoáº¡i');
  await expect(page.locator('.review-scenario').last()).not.toContainText('mua quáº§n Ã¡o');
  await expect(page.locator('.ending-analysis')).toContainText('Káº¿t quáº£: ChÆ°a an toÃ n');
  await page.screenshot({ path: `.artifacts/review-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'CÃ¡c láº§n khÃ¡m phÃ¡' }).click();
  await page.locator('.attempt-row').first().click();
  await expect(page.locator('.review-choices li')).toHaveCount(1);
  await expect(page.locator('.review-selection')).toContainText('quáº§y báº£o vá»‡');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'ÄÄƒng xuáº¥t', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toContainText('CÃ¡c bÃ i Ä‘Ã£ hoÃ n thÃ nh váº«n Ä‘Æ°á»£c lÆ°u');
  await expect(page.getByRole('dialog')).not.toContainText('Em cÃ³ thá»ƒ Ä‘Äƒng nháº­p Ä‘á»ƒ tiáº¿p tá»¥c');
  await page.getByRole('dialog').getByRole('button', { name: 'ÄÄƒng xuáº¥t', exact: true }).click();
  await page.getByRole('button', { name: 'ÄÄƒng nháº­p', exact: true }).click();
  await page.getByLabel('TÃªn Ä‘Äƒng nháº­p', { exact: false }).fill(username);
  await page.getByLabel('Máº­t kháº©u', { exact: true }).fill(password);
  await page.getByRole('dialog').getByRole('button', { name: 'ÄÄƒng nháº­p', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Ráº¥t vui Ä‘Æ°á»£c gáº·p em/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Ráº¥t vui Ä‘Æ°á»£c gáº·p em/ })).toBeVisible();
  await achievements();
  await expect(page.locator('.history-card')).toContainText('2 hÃ nh trÃ¬nh Ä‘Ã£ lÆ°u');
  expect(errors).toEqual([]);
});

test('staged player retries failed video, gates transitions and handles missing videos', async ({ page }, testInfo) => {
  await page.goto('/');
  const register = await page.request.post('/api/auth/register', {
    headers: { origin: 'http://127.0.0.1:4173', 'x-kidguard-request': '1' },
    data: { username: `flow_${testInfo.project.name}_${Date.now()}`, nickname: 'Báº¡n nhá»', password: 'Test-video-flow-password' },
  });
  expect(register.status()).toBe(201);
  await page.reload();
  await page.locator('.lesson-card').filter({ has: page.getByRole('heading', { name: 'Lá»«a Ä‘áº£o', exact: true }) }).click();
  await page.getByRole('button', { name: 'Báº¯t Ä‘áº§u bÃ i há»c', exact: true }).click();
  await page.route('**/videos/lua-dao/scene-1.mp4', route => route.abort());
  await openVideo(page);
  await expect(page.getByRole('button', { name: 'Táº£i láº¡i video' })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await page.unroute('**/videos/lua-dao/scene-1.mp4');
  await page.getByRole('button', { name: 'Táº£i láº¡i video' }).click();
  await finishVideo(page);
  async function choose(index: number) {
    await page.getByRole('radio').nth(index).check();
    await page.getByRole('button', { name: 'Chá»n cÃ¡ch xá»­ lÃ½ nÃ y' }).click();
    await expect(page.locator('.scene-intro')).toBeVisible();
  }
  await choose(0);
  await expect(page.getByRole('heading', { name: 'Sau lá»i nhá» giÃºp', exact: true })).toBeVisible();
  await openVideo(page);
  await expect(page.getByRole('button', { name: 'Tiáº¿p tá»¥c cÃ¢u chuyá»‡n' })).toHaveCount(0);
  await finishVideo(page);
  await expect(page.getByRole('radio')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tiáº¿p tá»¥c cÃ¢u chuyá»‡n' }).click();
  await expect(page.locator('.scene-intro')).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: 'Má»Ÿ Ä‘iá»u hÆ°á»›ng' }).click();
  await page.getByRole('button', { name: 'ThÆ° viá»‡n tÃ¬nh huá»‘ng', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Vá» thÆ° viá»‡n', exact: true }).click();
  await page.locator('.lesson-card').filter({ has: page.getByRole('heading', { name: 'Báº¡o lá»±c há»c Ä‘Æ°á»ng', exact: true }) }).click();
  await page.getByRole('button', { name: 'Báº¯t Ä‘áº§u bÃ i há»c', exact: true }).click();
  for (let i = 0; i < 3; i++) { await openVideo(page); await finishVideo(page); await choose(1); }
  await expect(page.locator('.scene-intro')).toContainText('Cáº£nh nÃ y chÆ°a cÃ³ video');
  await expect(page.getByRole('radio')).toHaveCount(0);
  await page.getByRole('button', { name: 'Chá»n cÃ¡ch xá»­ lÃ½', exact: true }).click();
  await expect(page.locator('video')).toHaveCount(0);
  await choose(1);
  await page.getByRole('button', { name: 'Chá»n cÃ¡ch xá»­ lÃ½', exact: true }).click();
  await choose(2);
  await page.getByRole('button', { name: 'Tiáº¿p tá»¥c', exact: true }).click();
  await page.getByRole('button', { name: 'HoÃ n thÃ nh vÃ  nhÃ¬n láº¡i' }).click();
  await expect(page.getByRole('heading', { name: 'Äiá»u em cÃ³ thá»ƒ mang theo' })).toBeVisible();
});

test('all 22 videos decode, seek and support range requests', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The full media audit only needs one browser instance.');
  test.setTimeout(120_000);
  const manifest = JSON.parse(readFileSync('public/videos/manifest.json', 'utf8')) as { output: string }[];
  expect(manifest).toHaveLength(22);
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

