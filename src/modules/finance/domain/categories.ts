import type { Category } from './models';

export function categoryRoot(category: Category, categories: Category[]): Category {
  if (!category.parentId) return category;
  return categories.find((item) => item.id === category.parentId) ?? category;
}

export function categoryLabel(category: Category, categories: Category[]): string {
  const parent = category.parentId ? categories.find((item) => item.id === category.parentId) : undefined;
  return parent ? `${parent.name} · ${category.name}` : category.name;
}

export function categoryTree(categories: Category[]): Category[] {
  const ids = new Set(categories.map((category) => category.id));
  const children = new Map<string, Category[]>();
  categories.forEach((category) => {
    if (!category.parentId || !ids.has(category.parentId)) return;
    const current = children.get(category.parentId) ?? [];
    current.push(category);
    children.set(category.parentId, current);
  });
  return categories.flatMap((category) => category.parentId && ids.has(category.parentId) ? [] : [category, ...(children.get(category.id) ?? [])]);
}

export function categoryFamilyIds(categoryId: string, categories: Category[]): Set<string> {
  return new Set([categoryId, ...categories.filter((item) => item.parentId === categoryId).map((item) => item.id)]);
}

export function categoryChildren(categoryId: string, categories: Category[]): Category[] {
  return categories.filter((item) => item.parentId === categoryId);
}
