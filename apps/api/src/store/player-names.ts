// Player names are unique, ignoring capitals and extra spaces: "Noam" and " noam " are the same
// name, "Noam12" is another. The bots' names are kept for the bots.

const BOT_STYLES = ['index holder', 'all-in gambler', 'cash keeper', 'tech chaser', 'random picker'];

/** The form two names are compared in. */
export const nameKey = (name: string) =>
  name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');

/** Names a person can't take, because they'd pass for a bot. */
export const isBotName = (name: string) => {
  const key = nameKey(name);
  return key.includes('(bot)') || BOT_STYLES.some((style) => key === style || key.startsWith(`${style} `));
};
