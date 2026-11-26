import type { ButtonHTMLAttributes } from 'react'
import { img } from './img'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { icon?: string; 'aria-label': string }

export function RoundButton({ icon, children, className = '', type = 'button', ...rest }: Props) {
  return (
    <button type={type} className={`round ${className}`} {...rest}>
      {icon ? <img src={img(icon)} alt="" draggable={false} /> : children}
    </button>
  )
}
