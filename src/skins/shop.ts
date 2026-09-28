import { CATEGORY_TITLES, SKIN_CATALOG, type SkinCategory, type SkinDefinition } from './catalog';

export type ShopSkinStatus = 'selected' | 'owned' | 'available' | 'locked-price' | 'locked-progress';

export interface ShopSkinView {
  id: string;
  name: string;
  color: string;
  accent: string;
  category: SkinCategory;
  pattern?: SkinDefinition['pattern'];
  effect?: SkinDefinition['effect'];
  price: number;
  status: ShopSkinStatus;
  /** Пояснение под карточкой для заблокированных состояний. */
  reason?: string;
}

export interface ShopSection {
  category: SkinCategory;
  title: string;
  skins: ShopSkinView[];
}

const CATEGORY_ORDER: readonly SkinCategory[] = ['color', 'pattern', 'effect'];

/**
 * Строит витрину магазина: группирует каталог по категориям и определяет
 * честный статус каждой карточки. Прогресс-скины (`category === 'effect'`)
 * никогда не показывают цену — они открываются только через реально
 * достигнутый прогресс на сервере (см. `AppDatabase.grantProgressSkins`),
 * поэтому статус `locked-progress` всегда описывает достижимое условие.
 */
export function buildShopSections(
  ownedSkinIds: ReadonlySet<string>,
  selectedSkinId: string,
  balance: number,
): ShopSection[] {
  const byCategory = new Map<SkinCategory, ShopSkinView[]>();

  for (const definition of SKIN_CATALOG) {
    const owned = ownedSkinIds.has(definition.id);
    const selected = definition.id === selectedSkinId;

    let status: ShopSkinStatus;
    let reason: string | undefined;

    if (selected) {
      status = 'selected';
    } else if (owned) {
      status = 'owned';
    } else if (definition.category === 'effect') {
      status = 'locked-progress';
      reason = definition.unlockLabel ?? 'Откроется позже';
    } else if (balance >= definition.price) {
      status = 'available';
    } else {
      status = 'locked-price';
      reason = `Не хватает ${definition.price - balance} монет`;
    }

    const view: ShopSkinView = {
      id: definition.id,
      name: definition.name,
      color: definition.color,
      accent: definition.accent,
      category: definition.category,
      pattern: definition.pattern,
      effect: definition.effect,
      price: definition.price,
      status,
      reason,
    };

    const list = byCategory.get(definition.category) ?? [];
    list.push(view);
    byCategory.set(definition.category, list);
  }

  return CATEGORY_ORDER.map((category) => ({
    category,
    title: CATEGORY_TITLES[category],
    skins: byCategory.get(category) ?? [],
  }));
}
