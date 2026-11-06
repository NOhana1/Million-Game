// Every company and fund in this game is fictional. These lines are flavour for the game world:
// they carry no figures or history, and each page labels them as fiction.

import type { Market } from '@portfolio-league/engine';

export type Profile = { focus: string; about: string };

export const PROFILES: Record<string, Profile> = {
  TAIX: {
    focus: 'The whole Tel Aviv market in one holding',
    about:
      'A broad fund that spreads its money across this game’s Tel Aviv market. Think of it as a seat in every room of the exchange at once.',
  },
  SHRN: {
    focus: 'Everyday banking along the coastal plain',
    about:
      'Sharon Bank is the neighbourhood lender of this game’s Sharon coast, with a branch that knows your name. It looks after household savings, mortgages and small-business loans.',
  },
  HGLL: {
    focus: 'Pantry staples from the northern hills',
    about:
      'HaGalil Foods turns the produce of the Galilee into olive oils, preserves and pantry staples. If it’s on a family table in this world, it probably came from here.',
  },
  NGVS: {
    focus: 'Solar power from the desert',
    about:
      'Negev Solar harvests the fiercest sun in the game and sends it north as clean electricity. Its fields of panels turn empty desert into a power station.',
  },
  YMSH: {
    focus: 'Container shipping across the Mediterranean',
    about:
      'Yam Shipping moves this world’s goods from harbour to harbour. Its fortunes rise and fall with the tides of trade.',
  },
  ARVA: {
    focus: 'Medicines developed in the desert valley',
    about:
      'Arava Pharma runs its laboratories in the quiet of the Arava valley, developing and making medicines. Its patient science answers to one test: does the treatment work?',
  },
  KNRT: {
    focus: 'Homes and offices around the lake',
    about:
      'Kinneret Real Estate builds and rents homes, offices and shopping streets near the lake. It’s a landlord whose view is hard to beat.',
  },
  CYBR: {
    focus: 'Defending networks against attack',
    about:
      'Tzafon Cyber keeps this world’s networks out of trouble, watching for intruders around the clock. Its engineers build the locks that banks and businesses rely on.',
  },
  MTLA: {
    focus: 'Phone and internet from the far north',
    about:
      'Metula Telecom connects homes and phones from the country’s northern tip all the way down. It’s the steady hum of a signal that’s simply expected to work.',
  },
  EILT: {
    focus: 'Insuring homes, cars and journeys',
    about:
      'Eilat Insurance sells peace of mind from the country’s southern shore. It covers the homes, cars and holidays of this game’s cautious citizens.',
  },
  USIX: {
    focus: 'The whole US market in one holding',
    about:
      'A broad fund that spreads its money across this game’s US market. One purchase gives you a slice of the entire American board.',
  },
  USTX: {
    focus: 'The technology names of the US market',
    about:
      'A fund that gathers this game’s American technology companies into a single holding. It’s a bet on the sector without having to pick a winner.',
  },
  MRDN: {
    focus: 'Designing computer chips',
    about:
      'Meridian Chips designs the tiny engines inside this world’s machines. When the appetite for computing grows, every eye turns to Meridian.',
  },
  SMTC: {
    focus: 'Renting computing power to businesses',
    about:
      'Summit Cloud rents out servers and storage so businesses never have to buy their own. Its product is the mountain of computing that no customer ever sees.',
  },
  ATLP: {
    focus: 'Moving money between shops and shoppers',
    about:
      'Atlas Payments carries the world’s purchases on its shoulders, one tap of a card at a time. It earns its living in the moment between buying and paying.',
  },
  RDWB: {
    focus: 'Early-stage biotechnology research',
    about:
      'Redwood Bio chases new therapies at the frontier of biology. Like its namesake it aims for great height, with all the risk of a long climb.',
  },
  BLPK: {
    focus: 'Producing and supplying energy',
    about:
      'Bluepeak Energy produces and delivers the fuel and power that keep this world’s engines turning. Its fate is tied to what the market will pay for energy.',
  },
  LKSR: {
    focus: 'Everyday shopping across the Midwest',
    about:
      'Lakeshore Retail runs the stores where this game’s shoppers fill their carts. It lives and dies by how confident those shoppers feel.',
  },
  IRBR: {
    focus: 'Heavy engineering and machinery',
    about:
      'Ironbridge Industrial builds the machines and structures that other companies stand on. Its order book is the sound of this world’s economy being built.',
  },
  PRFD: {
    focus: 'Packaged food from the American heartland',
    about:
      'Prairie Foods turns the great plains into cereals, flour and familiar boxes on the shelf. People keep eating in good times and bad.',
  },
};

export const MARKET_HOURS: Record<Market, string> = {
  TASE: 'Mon–Thu 10:00–17:30, Fri 10:00–13:50, Israel time',
  US: 'Mon–Fri 9:30–16:00, New York time',
};
