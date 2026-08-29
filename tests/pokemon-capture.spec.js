const { test, expect } = require('playwright/test');
const path = require('path');

const gameUrl = 'file://' + path.resolve(__dirname, '../pokemon-capture/index.html');

test.beforeEach(async ({ page }) => {
  await page.goto(gameUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('开局没有宝可梦，并显示三种随机目标', async ({ page }) => {
  await expect(page.locator('#team-count')).toHaveText('0');
  await expect(page.locator('#mode-status')).toContainText('捕捉第一只宝可梦');
  const names = await page.evaluate(() => window.__pokemonGameTest.getAvailablePokemon());
  expect(names.sort()).toEqual(['小火龙', '杰尼龟', '皮卡丘'].sort());
});

test('宝可梦到达中央后停留两秒并允许投掷', async ({ page }) => {
  await page.getByRole('button', { name: '开始捕捉' }).click();
  await page.evaluate(() => window.__pokemonGameTest.forceCenter());
  await expect(page.locator('#center-message')).toContainText('现在投掷');
  await expect(page.getByRole('button', { name: '投掷精灵球' })).toBeEnabled();
  expect(await page.evaluate(() => window.__pokemonGameTest.getCenterHoldMs())).toBe(2000);
});

test('Leo游戏首页包含新游戏入口', async ({ page }) => {
  const homeUrl = 'file://' + path.resolve(__dirname, '../index.html');
  await page.goto(homeUrl);
  const link = page.locator('a[href="pokemon-capture/"]');
  await expect(link).toBeVisible();
  await expect(link).toContainText('宝可梦训练家冒险');
});

test('捕捉第一只后解锁一打一但不解锁二打二', async ({ page }) => {
  await page.getByRole('button', { name: '开始捕捉' }).click();
  await page.evaluate(() => {
    window.__pokemonGameTest.forceCenter();
    window.__pokemonGameTest.forceCatch();
  });
  await expect(page.locator('#team-count')).toHaveText('1');
  await expect(page.locator('[data-mode="1"]')).toBeEnabled();
  await expect(page.locator('[data-mode="2"]')).toBeDisabled();
  await expect(page.locator('[data-mode="3"]')).toBeDisabled();
});
