# Producify
An experimental, futuristic suite of music tools.

## Features

### Beat Machine Module
An 8-step beat sequencer with AI orchestration capabilities.

**Features:**
- 8-step grid sequencer
- 11 tracks: 7 immediately playable + 4 AI-orchestrated
- Real-time playback with visual step indicator
- Tempo control (60-200 BPM)
- Metronome functionality
- 6 color themes (black, gray, white, violet, purple, blue)
- AI orchestration via "Producify" button
- Export beats as JSON
- Pure Web Audio API synthesis (no external audio files)

**Tracks:**
1. Kick - Bass drum
2. Snare - Snare drum
3. Hi-Hat - Hi-hat cymbal
4. Crash - Crash cymbal
5. Piano - Piano note
6. Heavy Synth - Bass synthesizer
7. String - String pad
8. X String ✨ - AI-generated
9. XX String ✨ - AI-generated
10. Tom ✨ - AI-generated
11. Sax ✨ - AI-generated

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL database (optional - for future persistence features)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/bensultan1985/producify.git
cd producify
```

2. Install dependencies:
```bash
npm install
```

3. (Optional) Set up database:
```bash
cp .env.example .env
# Edit .env with your DATABASE_URL
npx prisma generate
npx prisma migrate dev
```

4. Run the development server:
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

5. Open [http://localhost:3000](http://localhost:3000) with your browser to see the beat machine.

## Usage

1. **Create a beat pattern** - Click on the grid cells to activate steps
2. **Press Play** - Start the sequencer loop
3. **Adjust tempo** - Use the slider to change BPM
4. **Toggle metronome** - Enable click track for timing
5. **Click Producify** - AI generates patterns for tracks 8-11
6. **Edit AI tracks** - Modify the AI-generated patterns
7. **Export** - Save your beat as JSON

## Technology Stack

- **Next.js 16** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Prisma** - Database ORM (PostgreSQL)
- **Web Audio API** - Browser-native audio synthesis

## Learn More

To learn more about the technologies used:

- [Next.js Documentation](https://nextjs.org/docs)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
