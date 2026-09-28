import { describe, expect, it } from 'vitest';
import { buildShopSections } from '../src/skins/shop.ts';
import { SKIN_CATALOG } from '../src/skins/catalog.ts';

describe('buildShopSections', () => {
  it('группирует каталог в три секции с правильными заголовками и составом', () => {
    const sections = buildShopSections(new Set(['berry']), 'berry', 0);
    expect(sections.map((section) => section.category)).toEqual(['color', 'pattern', 'effect']);
    expect(sections.map((section) => section.title)).toEqual(['Цвета', 'Узоры', 'Эффекты']);
    expect(sections.find((section) => section.category === 'color')!.skins).toHaveLength(8);
    expect(sections.find((section) => section.category === 'pattern')!.skins).toHaveLength(6);
    expect(sections.find((section) => section.category === 'effect')!.skins).toHaveLength(3);
  });

  it('статус selected — для текущего выбранного скина', () => {
    const sections = buildShopSections(new Set(['berry']), 'berry', 0);
    const berry = sections[0].skins.find((skin) => skin.id === 'berry')!;
    expect(berry.status).toBe('selected');
    expect(berry.reason).toBeUndefined();
  });

  it('статус owned — куплен, но не выбран сейчас', () => {
    const sections = buildShopSections(new Set(['berry', 'sunny']), 'berry', 100);
    const sunny = sections[0].skins.find((skin) => skin.id === 'sunny')!;
    expect(sunny.status).toBe('owned');
  });

  it('статус available — хватает монет, ещё не куплен', () => {
    const sections = buildShopSections(new Set(['berry']), 'berry', 20);
    const ocean = sections[0].skins.find((skin) => skin.id === 'ocean')!; // цена 18
    expect(ocean.status).toBe('available');
    expect(ocean.price).toBe(18);
  });

  it('статус locked-price — не хватает монет, указана точная нехватка с правильным склонением', () => {
    const sections = buildShopSections(new Set(['berry']), 'berry', 10);
    const sunny = sections[0].skins.find((skin) => skin.id === 'sunny')!; // цена 12
    expect(sunny.status).toBe('locked-price');
    expect(sunny.reason).toBe('Не хватает 2 монеты');
  });

  it('склонение «монет(а/ы)» в нехватке верное для разных остатков', () => {
    // ocean: цена 18, mint: 30
    const at = (balance: number, id: string) =>
      buildShopSections(new Set(['berry']), 'berry', balance)
        .flatMap((section) => section.skins)
        .find((skin) => skin.id === id)!;

    expect(at(17, 'ocean').reason).toBe('Не хватает 1 монета'); // 18 - 17 = 1
    expect(at(13, 'ocean').reason).toBe('Не хватает 5 монет'); // 18 - 13 = 5
    expect(at(0, 'mint').reason).toBe('Не хватает 30 монет'); // 30 - 0 = 30
    expect(at(9, 'mint').reason).toBe('Не хватает 21 монета'); // 30 - 9 = 21
    expect(at(8, 'mint').reason).toBe('Не хватает 22 монеты'); // 30 - 8 = 22
  });

  it('статус locked-progress — эффект без прогресса, даже при огромном балансе', () => {
    const sections = buildShopSections(new Set(['berry']), 'berry', 999999);
    const glow = sections[2].skins.find((skin) => skin.id === 'glow')!;
    expect(glow.status).toBe('locked-progress');
    expect(glow.reason).toBe('7 дней подряд');
  });

  it('открытый прогресс-скин переходит в owned/selected, а не остаётся locked', () => {
    const owned = new Set(['berry', 'iridescent']);
    const sections = buildShopSections(owned, 'iridescent', 0);
    const iridescent = sections[2].skins.find((skin) => skin.id === 'iridescent')!;
    expect(iridescent.status).toBe('selected');
  });

  it('ни один эффект в UI-статусах не показывает цену «0 монет», всегда только условие или владение', () => {
    const sections = buildShopSections(new Set(['berry']), 'berry', 0);
    const effects = sections.find((section) => section.category === 'effect')!.skins;
    for (const effect of effects) {
      expect(effect.status).not.toBe('available');
      expect(effect.status).not.toBe('locked-price');
      if (effect.status === 'locked-progress') {
        expect(effect.reason).toBeTruthy();
        expect(effect.reason).not.toMatch(/0\s*монет/);
      }
    }
  });

  it('каждый скин каталога с ценой 0, кроме владения по умолчанию, — эффект (никогда не продаётся)', () => {
    const freeNonOwned = SKIN_CATALOG.filter((skin) => skin.price === 0 && skin.id !== 'berry');
    expect(freeNonOwned.every((skin) => skin.category === 'effect')).toBe(true);
  });
});
