import { expect, test } from '@playwright/test';

test('customer can register, finish onboarding without payment, and start optional activation', async ({ page }) => {
  const username = `kunde-${Date.now()}`;
  const password = '1234';

  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Kunde registrieren' })).toBeVisible();
  await page.getByLabel('Benutzername').fill(username);
  await page.getByLabel('Passwort').fill(password);
  await page.getByRole('button', { name: 'Kunde registrieren' }).click();

  await page.waitForURL('**/usage-token?onboarding=1');
  await page.getByRole('button', { name: /^Weiter$/ }).click();
  await page.getByRole('button', { name: /^Weiter$/ }).click();

  const finishOnboardingButton = page.locator('button').filter({ hasText: /^Onboarding ohne Einzahlung abschliessen$/ }).first();
  await expect(finishOnboardingButton).toBeVisible();
  await expect(page.getByText('Danach optional Aktivierung starten')).toBeVisible();

  const beforeOnboarding = await page.evaluate(async () => {
    const response = await fetch('/api/auth/me', { cache: 'no-store' });
    return response.json();
  });
  expect(beforeOnboarding.user?.onboarding_completed_at).toBeNull();

  await finishOnboardingButton.click();

  await expect.poll(async () => {
    const payload = await page.evaluate(async () => {
      const response = await fetch('/api/auth/me', { cache: 'no-store' });
      return response.json();
    });
    return payload.user?.onboarding_completed_at ?? null;
  }).not.toBeNull();

  await page.goto('/login');
  await page.getByLabel('Benutzername').fill(username);
  await page.getByLabel('Passwort').fill(password);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.waitForURL('**/');
  await expect(page.getByRole('link', { name: 'Guthaben' })).toBeVisible();
  await page.getByRole('link', { name: 'Guthaben' }).click();
  await page.waitForURL('**/usage-token');
  await expect(page.getByText('Aktivierung und erste Einzahlung')).toBeVisible();
});