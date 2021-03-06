import {
  MuStruct,
  MuDictionary,
  MuString,
  MuFloat64,
  MuBoolean,
  MuArray,
} from 'muschema';
import { Ghost } from './pac';

export const PacmanSchema = new MuStruct({
  x: new MuFloat64(),
  y: new MuFloat64(),
  color: new MuString(),
  dir: new MuFloat64(),
  mouthOpen: new MuBoolean(),
  isLive: new MuBoolean(),
});

export const GhostSchema = new MuStruct({
  x: new MuFloat64(),
  y: new MuFloat64(),
  color: new MuString(),
  dir: new MuFloat64(),
  isWeak: new MuBoolean(),
  isBlinking: new MuBoolean(),
  isDead: new MuBoolean(),
});

export const StateSchema = {
  client: new MuStruct({
    pacman: PacmanSchema,
    ghosts: new MuArray(GhostSchema),
  }),
  server: new MuStruct({
    pacman: new MuDictionary(PacmanSchema),
    ghosts: new MuArray(GhostSchema),
  }),
};

export const DBSchema = {
  client: {
    ghostHoster: new MuString(),
  },
  server: {
    isGhostHoster: new MuBoolean(),
  },
};
