// Sprites from the provided UI pack (assets/png/default/ui), bundled by Vite.
const files = import.meta.glob('./img/*.png', { eager: true, import: 'default' }) as Record<string, string>
export const img = (name: string): string => files[`./img/${name}.png`] ?? ''
