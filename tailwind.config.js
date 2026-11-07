/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: {
          bg: '#111113',
          panel: '#151517',
          sidebar: '#151517',
          card: '#1a1a1d',
          hover: '#1f1f23',
          border: '#26272b',
          borderSubtle: '#1d1e21',
          text: '#d9dadc',
          muted: '#8b8d93',
          dim: '#5d6066',
          accent: '#47908a',
          accentHover: '#5aa8a1',
        },
        entity: {
          person: '#8a7bb8',
          organization: '#c08a55',
          company: '#b5835a',
          website: '#5c9e8f',
          domain: '#4fa3a0',
          account: '#9a86b0',
          email: '#b7a165',
          phone: '#a8946a',
          ip: '#5b7fae',
          location: '#6f9a68',
          document: '#8b8f98',
          event: '#a99b5e',
          custom: '#9b7f97',
        },
        status: {
          candidate: '#7c8088',
          unverified: '#c6a463',
          supported: '#739cc0',
          confirmed: '#6fae8c',
          rejected: '#c97c7c',
        }
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'Fira Code',
          'ui-monospace',
          'SFMono-Regular',
          'monospace',
        ],
      },
      boxShadow: {
        subtle: 'none',
        popover: '0 6px 18px rgba(0, 0, 0, 0.5)',
      }
    },
  },
  plugins: [],
}
