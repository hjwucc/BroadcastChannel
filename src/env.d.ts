/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import type { ThemeContext } from './types/theme'

declare namespace App {
  interface Locals {
    SITE_URL: string
    RSS_URL: string
    RSS_PREFIX: string
    themeContext?: ThemeContext
  }
}