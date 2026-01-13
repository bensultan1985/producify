import type { Theme } from '../types';

export const themes: Record<Theme, { bg: string; primary: string; secondary: string; text: string; accent: string }> = {
  black: {
    bg: 'bg-gray-900',
    primary: 'bg-black',
    secondary: 'bg-gray-800',
    text: 'text-white',
    accent: 'bg-gray-700',
  },
  gray: {
    bg: 'bg-gray-600',
    primary: 'bg-gray-700',
    secondary: 'bg-gray-500',
    text: 'text-white',
    accent: 'bg-gray-400',
  },
  white: {
    bg: 'bg-gray-100',
    primary: 'bg-white',
    secondary: 'bg-gray-200',
    text: 'text-gray-900',
    accent: 'bg-gray-300',
  },
  violet: {
    bg: 'bg-violet-900',
    primary: 'bg-violet-800',
    secondary: 'bg-violet-700',
    text: 'text-white',
    accent: 'bg-violet-600',
  },
  purple: {
    bg: 'bg-purple-900',
    primary: 'bg-purple-800',
    secondary: 'bg-purple-700',
    text: 'text-white',
    accent: 'bg-purple-600',
  },
  blue: {
    bg: 'bg-blue-900',
    primary: 'bg-blue-800',
    secondary: 'bg-blue-700',
    text: 'text-white',
    accent: 'bg-blue-600',
  },
};
