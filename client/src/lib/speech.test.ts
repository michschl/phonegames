import { describe, expect, it } from 'vitest';
import { rankGermanVoices, splitSentences } from './speech.ts';

const voice = (name: string, lang: string, voiceURI = name, localService = true): SpeechSynthesisVoice =>
  ({ name, lang, voiceURI, localService, default: false }) as SpeechSynthesisVoice;

describe('voice ranking', () => {
  it('prefers natural online voices over old robotic desktop voices (Windows/Edge)', () => {
    const ranked = rankGermanVoices([
      voice('Microsoft Hedda - German (Germany)', 'de-DE'),
      voice('Microsoft Stefan - German (Germany)', 'de-DE'),
      voice('Microsoft Katja Online (Natural) - German (Germany)', 'de-DE', 'katja-online', false),
      voice('Microsoft Leni Online (Natural) - German (Switzerland)', 'de-CH', 'leni-online', false),
      voice('Microsoft David - English (United States)', 'en-US'),
    ]);
    expect(ranked.map((v) => v.name)).toEqual(['Leni', 'Katja', 'Hedda', 'Stefan']);
    expect(ranked[0]).toMatchObject({ quality: 'natural', region: 'Schweiz', online: true });
  });

  it('never offers iOS novelty voices and ranks premium above compact', () => {
    const ranked = rankGermanVoices([
      voice('Eddy (Deutsch (Deutschland))', 'de-DE', 'com.apple.eloquence.de-DE.Eddy'),
      voice('Grandma (Deutsch (Deutschland))', 'de-DE', 'com.apple.eloquence.de-DE.Grandma'),
      voice('Anna', 'de-DE', 'com.apple.voice.compact.de-DE.Anna'),
      voice('Anna (Premium)', 'de-DE', 'com.apple.voice.premium.de-DE.Anna'),
      voice('Helena (Erweitert)', 'de-DE', 'com.apple.voice.enhanced.de-DE.Helena'),
    ]);
    expect(ranked.map((v) => `${v.name}/${v.quality}`)).toEqual(['Anna/natural', 'Helena/enhanced', 'Anna/standard']);
  });

  it('ranks Google voices as enhanced (Chrome/Android)', () => {
    const ranked = rankGermanVoices([voice('de-DE-language', 'de-DE'), voice('Google Deutsch', 'de-DE', 'Google Deutsch', false)]);
    expect(ranked[0]).toMatchObject({ name: 'Google Deutsch', quality: 'enhanced' });
  });
});

describe('splitSentences', () => {
  it('speaks sentence by sentence with longer pauses after ellipses', () => {
    expect(splitSentences('Die Nacht bricht herein. Alle schliessen die Augen … Werwölfe, erwacht!')).toEqual([
      { text: 'Die Nacht bricht herein.', pause: 260 },
      { text: 'Alle schliessen die Augen …', pause: 700 },
      { text: 'Werwölfe, erwacht!', pause: 380 },
    ]);
  });

  it('removes emojis and turns dashes into pauses', () => {
    expect(splitSentences('Was für ein Glück – niemand ist gestorben 🎉')).toEqual([
      { text: 'Was für ein Glück, niemand ist gestorben', pause: 260 },
    ]);
  });
});
