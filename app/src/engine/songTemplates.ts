export const SONG_TEMPLATES = [
  {
    id: 'verse-chorus',
    name: 'Verse / Chorus',
    description: 'A clear starting point: tell the story, then return to the hook.',
    sections: ['Verse', 'Chorus', 'Verse', 'Chorus'],
  },
  {
    id: 'chorus-first',
    name: 'Hook first',
    description: 'Open with the catchiest part, then move into the verse.',
    sections: ['Chorus', 'Verse', 'Chorus', 'Verse', 'Chorus'],
  },
  {
    id: 'full-pop',
    name: 'Full pop song',
    description: 'An intro, two verse and chorus cycles, a bridge, and an ending.',
    sections: ['Intro', 'Verse', 'Chorus', 'Verse', 'Chorus', 'Bridge', 'Chorus', 'Outro'],
  },
] as const
