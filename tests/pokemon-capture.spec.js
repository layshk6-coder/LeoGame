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

test('开局拥有四种指定数量的精灵球', async ({ page }) => {
  await expect(page.locator('[data-ball="poke"] .ball-qty')).toHaveText('100');
  await expect(page.locator('[data-ball="great"] .ball-qty')).toHaveText('10');
  await expect(page.locator('[data-ball="ultra"] .ball-qty')).toHaveText('5');
  await expect(page.locator('[data-ball="master"] .ball-qty')).toHaveText('1');
});

test('投掷所选超级球后库存减少一个', async ({ page }) => {
  await page.getByRole('button', { name: /超级球/ }).click();
  await page.getByRole('button', { name: '开始捕捉' }).click();
  await page.evaluate(() => {
    window.__pokemonGameTest.forceCenter();
    window.__pokemonGameTest.forceCatch();
  });
  await expect(page.locator('[data-ball="great"] .ball-qty')).toHaveText('9');
});

test('大师球捕捉率为百分之百', async ({ page }) => {
  expect(await page.evaluate(() => window.__pokemonGameTest.getCatchRate('master'))).toBe(1);
});

test('大师球即使随机数最差也一定捕捉成功', async ({ page }) => {
  await page.getByRole('button', { name: /大师球/ }).click();
  await page.getByRole('button', { name: '开始捕捉' }).click();
  await page.evaluate(() => {
    Math.random = () => 0.999999;
    window.__pokemonGameTest.forceCenter();
    document.getElementById('throw-btn').click();
  });
  await expect(page.locator('#team-count')).toHaveText('1');
  await expect(page.locator('[data-ball="master"] .ball-qty')).toHaveText('0');
});

test('可以收藏超过三只宝可梦', async ({ page }) => {
  for (let count = 1; count <= 4; count++) {
    await page.evaluate(() => {
      window.__pokemonGameTest.forceCenter();
      window.__pokemonGameTest.forceCatch();
    });
    await expect(page.locator('#team-count')).toHaveText(String(count));
  }
  await expect(page.locator('[data-mode="3"]')).toBeEnabled();
  await expect(page.locator('#start-btn')).toBeEnabled();
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
