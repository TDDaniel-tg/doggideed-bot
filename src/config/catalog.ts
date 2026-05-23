import { getCustomColors, getCustomPrices } from '../db/database';

export const MODELS = [
  { id: 'bublik', name: 'Бублик', description: 'Миска-конструктор' },
  { id: 'lemon',  name: 'Как у Лимона', description: 'Двухцветная миска с готовыми размерами' },
];

export const BUBLIK_HEIGHTS = [
  { id: '3rings', name: '3 колечка - 11см' },
  { id: '4rings', name: '4 колечка - 15см' },
  { id: '5rings', name: '5 колечек - 18см' },
];

export const BUBLIK_VOLUMES = [
  { id: '300',  name: '300 мл' },
  { id: '600',  name: '600 мл' },
  { id: '900',  name: '900 мл' },
  { id: '1200', name: '1200 мл' },
  { id: '1700', name: '1700 мл (только 3-4 колечка)' },
];

export const LEMON_SIZES = [
  { id: '10_300',  name: '10см + 300мл' },
  { id: '12_600',  name: '12см + 600мл' },
  { id: '15_900',  name: '15см + 900мл' },
  { id: '20_1200', name: '20см + 1200мл' },
];

export type Color = {
  id: string;
  name: string;
  available: boolean;
};

export const COLORS: Color[] = [
  { id: 'sand',       name: 'Песочный',        available: true },
  { id: 'terracotta', name: 'Терракота',        available: true },
  { id: 'sage',       name: 'Шалфей',          available: true },
  { id: 'fog',        name: 'Туман',            available: true },
  { id: 'anthracite', name: 'Антрацит',         available: true },
  { id: 'milk',       name: 'Молоко',           available: true },
  { id: 'mustard',    name: 'Горчица',          available: true },
  { id: 'dustyrose',  name: 'Пыльная роза',     available: true },
  { id: 'indigo',     name: 'Индиго',           available: true },
  { id: 'ivory',      name: 'Слоновая кость',   available: true },
  { id: 'olive',      name: 'Оливковый',        available: true },
  { id: 'caramel',    name: 'Карамель',         available: true },
  { id: 'graphite',   name: 'Графит',           available: true },
  { id: 'blush',      name: 'Румяный',          available: true },
  { id: 'sky',        name: 'Небесный',         available: true },
];

export function getMergedColors(): Color[] {
  const customColors = getCustomColors().map(c => ({
    id: c.id,
    name: c.name,
    available: true
  }));
  return [...COLORS, ...customColors];
}

export function getSetPrices(): { price1: number, price2: number } {
  const customPrices = getCustomPrices();
  const override1 = customPrices.find(p => p.item_type === 'global' && p.item_id === 'set_1');
  const override2 = customPrices.find(p => p.item_type === 'global' && p.item_id === 'set_2');
  
  return {
    price1: override1 ? override1.price : 3490,
    price2: override2 ? override2.price : 5990,
  };
}
