export const SONG_TEMPLATES = [
  {
    id: 'verse-chorus',
    name: 'Simple: Verse / Chorus',
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
  {
    id: 'electronic',
    name: 'Electronic build and drop',
    description: 'Build anticipation, release it in the drop, then give the listener a breather.',
    sections: ['Intro', 'Build', 'Drop', 'Breakdown', 'Build', 'Drop', 'Outro'],
  },
] as const
