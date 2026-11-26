import { PixiRenderer } from './PixiRenderer'
import type { Renderer } from '../types'

export const createPixiRenderer = (): Renderer => new PixiRenderer()
