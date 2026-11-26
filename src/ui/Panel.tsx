import type { ElementType, HTMLAttributes } from 'react'

type Props = HTMLAttributes<HTMLElement> & { as?: ElementType }

/** 9-slice wooden frame (panel_menu borders 32/40) drawn with border-image in CSS. */
export function Panel({ as: Tag = 'section', className = '', ...rest }: Props) {
  return <Tag className={`panel ${className}`} {...rest} />
}
